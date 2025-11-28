#!/usr/bin/env node

/**
 * Validate JSON test data against a JSON Schema using Ajv (draft 2020-12),
 * using ONLY local schema files and logging Git + SHA256 info.
 *
 * Test file format (required):
 *
 * {
 *   "schema": "modular/common/url/v0.0.1.json",
 *   "data": [ ... ]
 * }
 *
 * OR:
 *
 * {
 *   "schema": "https://github.com/umetadataforms/schemas/raw/main/modular/common/url/v0.0.1.json",
 *   "data": [ ... ]
 * }
 *
 * The "schema" value may be either:
 *   - a path relative to the repo root, or
 *   - a full GitHub "raw" URL under:
 *       https://github.com/umetadataforms/schemas/raw/main/
 *
 * Usage:
 *   ./validate-json-data.js <test.json>
 *
 * Install dependencies:
 *   npm install ajv ajv-formats
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const Ajv = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats");

// -----------------------------------------------------------------------------
// CLI ARGUMENTS
// -----------------------------------------------------------------------------

if (process.argv.length !== 3) {
  console.error("Usage: ./validate-json-data.js <test.json>");
  process.exit(1);
}

const testFilePath = path.resolve(process.argv[2]);

// Single repo root for both schemas and test data
const REPO_ROOT = path.resolve(__dirname, "../../../");

// Base URL for online schemas – will be mapped to local filesystem paths
const ONLINE_BASE = "https://github.com/umetadataforms/schemas/raw/main/";

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Redact personal information from paths when printing.
 */
function redactPath(p) {
  if (!p) return p;

  const norm = path.normalize(p);

  const home = process.env.HOME;
  if (home && norm.startsWith(home)) {
    return norm.replace(home, "<HOME>");
  }

  const winHome = process.env.USERPROFILE;
  if (winHome && norm.startsWith(winHome)) {
    return norm.replace(winHome, "<HOME>");
  }

  return norm.replace(/\/(Users|home|u)\/[^/]+/i, "/<REDACTED>");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Map a schema reference (either repo-relative path OR online URL under ONLINE_BASE)
 * to a local file path in the repo.
 *
 * Examples:
 *   "modular/common/url/v0.0.1.json"
 *     ->  <REPO_ROOT>/modular/common/url/v0.0.1.json
 *
 *   "https://github.com/umetadataforms/schemas/raw/main/modular/common/url/v0.0.1.json"
 *     ->  <REPO_ROOT>/modular/common/url/v0.0.1.json
 */
function schemaRefToLocalPath(schemaRef) {
  let ref = String(schemaRef || "").trim();
  if (!ref) throw new Error("Schema reference was empty");

  // If it's a GitHub raw URL, strip the fixed prefix and use the tail
  if (ref.startsWith(ONLINE_BASE)) {
    ref = ref.slice(ONLINE_BASE.length);
  }

  // At this point we expect something like "modular/..." or "some/path.json"
  ref = ref.replace(/^\/+/, ""); // remove leading slashes if any

  return path.join(REPO_ROOT, ref);
}

// Cache: schemaRef (as Ajv sees it) → { schema, localPath }
const schemaCache = new Map();

function loadLocalSchema(schemaRef) {
  if (schemaCache.has(schemaRef)) {
    return schemaCache.get(schemaRef).schema;
  }

  const localPath = schemaRefToLocalPath(schemaRef);

  let schema;
  try {
    schema = readJson(localPath);
  } catch (err) {
    throw new Error(
      `Failed to read schema from "${localPath}" (from "${schemaRef}"): ${err.message}`
    );
  }

  schemaCache.set(schemaRef, { schema, localPath });
  return schema;
}

/**
 * SHA-256 of any JSON object or string.
 */
function sha256Of(value) {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Git commit hash of the repository.
 */
function getGitCommit() {
  try {
    const out = execSync("git rev-parse HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    return null;
  }
}

/**
 * Check whether a file has uncommitted changes inside the repo.
 */
function isFileDirty(filePath) {
  try {
    const rel = path.relative(REPO_ROOT, filePath);
    const out = execSync(`git status --porcelain -- "${rel}"`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim().length > 0;
  } catch {
    return null;
  }
}

function sectionHeader(title) {
  const base = `= ${title} =`;
  const totalWidth = 80;
  if (base.length >= totalWidth) return base;
  return base + "=".repeat(totalWidth - base.length);
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------

(async () => {
  // Read test JSON
  let testJson;
  try {
    testJson = readJson(testFilePath);
  } catch (err) {
    console.error("Test file is not readable or not valid JSON:", testFilePath);
    console.error(err.message);
    process.exit(1);
  }

  const schemaRefRaw = testJson.schema;
  const schemaRef = String(schemaRefRaw || "").trim();
  if (!schemaRef) {
    console.error(
      'Test JSON must have a "schema" field containing either a repo-relative path like "modular/common/url/v0.0.1.json" or a GitHub raw URL under ' +
        ONLINE_BASE
    );
    process.exit(1);
  }

  if (!Array.isArray(testJson.data)) {
    console.error('Test JSON "data" must be an array.');
    process.exit(1);
  }

  const dataArray = testJson.data;

  // Ajv setup
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    loadSchema: async (uri) => loadLocalSchema(uri),
  });
  addFormats(ajv);

  // Load root schema
  let rootSchema;
  let rootSchemaLocalPath;
  try {
    rootSchema = loadLocalSchema(schemaRef);
    rootSchemaLocalPath = schemaCache.get(schemaRef).localPath;
  } catch (err) {
    console.error("Failed to load root schema:");
    console.error(err.message);
    process.exit(1);
  }

  // Compile schema
  let validate;
  try {
    validate = await ajv.compileAsync(rootSchema);
  } catch (err) {
    console.error("Schema failed to compile:");
    console.error(err.message);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Run validation (buffer output)
  // ---------------------------------------------------------------------------

  const results = [];
  let allValid = true;

  dataArray.forEach((item, index) => {
    const valid = validate(item);
    const entry = { index, valid };
    if (!valid) {
      allValid = false;
      entry.errors = validate.errors ? JSON.parse(JSON.stringify(validate.errors)) : [];
    }
    results.push(entry);
  });

  // Precompute hashes and commit for later reporting
  const schemaHash = sha256Of(rootSchema);
  const dataHash = sha256Of(dataArray);
  const repoCommit = getGitCommit();

  const rootSchemaDisplayPath = redactPath(
    path.relative(process.cwd(), rootSchemaLocalPath)
  );
  const testFileDisplayPath = redactPath(
    path.relative(process.cwd(), testFilePath)
  );

  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------

  console.log("JSON Data Test Log");
  console.log("");
  console.log("Timestamp:", new Date().toISOString());
  console.log("");
  console.log(sectionHeader("Context"));
  console.log(" Repo root:     ", redactPath(REPO_ROOT));
  console.log(" Schema ref:    ", schemaRef);
  console.log(" Root schema:   ", rootSchemaDisplayPath);
  console.log(" Test file:     ", testFileDisplayPath);

  // ---------------------------------------------------------------------------
  // Schema file report
  // ---------------------------------------------------------------------------

  console.log("");
  console.log(sectionHeader("Schema File"));
  console.log(" Path:          ", rootSchemaDisplayPath);
  console.log(" SHA256:        ", schemaHash);
  if (repoCommit) {
    console.log(" Repo commit:   ", repoCommit);
    const schemaDirty = isFileDirty(rootSchemaLocalPath);
    console.log(
      " Status:        ",
      schemaDirty === true
        ? "modified"
        : schemaDirty === false
        ? "clean"
        : "unknown"
    );
  } else {
    console.log(" Repo commit:   (not a git repository)");
    console.log(" Status:        unknown");
  }

  // ---------------------------------------------------------------------------
  // Test data file report
  // ---------------------------------------------------------------------------

  console.log("");
  console.log(sectionHeader("Test File"));
  console.log(" Path:          ", testFileDisplayPath);
  console.log(" SHA256:        ", dataHash);
  if (repoCommit) {
    console.log(" Repo commit:   ", repoCommit);
    const testDirty = isFileDirty(testFilePath);
    console.log(
      " Status:        ",
      testDirty === true
        ? "modified"
        : testDirty === false
        ? "clean"
        : "unknown"
    );
  } else {
    console.log(" Repo commit:   (not a git repository)");
    console.log(" Status:        unknown");
  }

  // ---------------------------------------------------------------------------
  // Validation results (printed last)
  // ---------------------------------------------------------------------------

  console.log("");
  console.log(sectionHeader("Validation"));
  for (const r of results) {
    if (r.valid) {
      console.log(`✔ data[${r.index}] is valid.`);
    } else {
      console.error(`✖ data[${r.index}] is NOT valid.`);
      console.error("Errors:");
      console.error(JSON.stringify(r.errors, null, 2));
    }
  }

  if (!allValid) process.exit(1);
})();
