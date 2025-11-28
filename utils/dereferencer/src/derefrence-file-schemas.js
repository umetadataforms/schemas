#!/usr/bin/env node

const $RefParser = require("@apidevtools/json-schema-ref-parser");
const path = require("path");
const fs = require("fs").promises;

// -----------------------------------------------------------------------------
// Repo + paths, mirroring validate-json-data.js
// -----------------------------------------------------------------------------

// Single repo root for everything
const REPO_ROOT = path.resolve(__dirname, "../../../");

// Base directory for modular schemas
const SCHEMA_ROOT = path.join(REPO_ROOT, "modular");

// Output directory for standalone schemas
const OUTPUT_DIR = path.join(REPO_ROOT, "standalone");

// Base URL for online schemas – will be mapped to local filesystem paths
const ONLINE_BASE =
  "https://github.com/umetadataforms/schemas/raw/main/";

// Schemas to dereference (repo-relative under modular/)
const SCHEMAS = {
  real_dataset_metadata: "real-dataset-metadata/v0.0.1.json",
  tabular_data_metadata: "tabular-data-metadata/v0.0.1.json",
};

// -----------------------------------------------------------------------------
// Utility: map any schema URL/ref to a local file path in the repo
// -----------------------------------------------------------------------------

/**
 * Map a schema URL (file path or GitHub raw URL) to a local file path.
 *
 * Examples:
 *   "https://github.com/umetadataforms/schemas/raw/main/modular/common/url/v0.0.1.json"
 *     ->  <REPO_ROOT>/modular/common/url/v0.0.1.json
 *
 *   "/…/whatever/modular/common/url/v0.0.1.json"
 *     ->  <REPO_ROOT>/modular/common/url/v0.0.1.json
 *
 *   "modular/common/url/v0.0.1.json"
 *     ->  <REPO_ROOT>/modular/common/url/v0.0.1.json
 */
function urlToLocalPath(url) {
  let u = String(url || "").trim();

  // If it's a GitHub raw URL, strip the fixed prefix and use the tail
  if (u.startsWith(ONLINE_BASE)) {
    u = u.slice(ONLINE_BASE.length);
  }

  // If we can see "/modular/", assume everything after that is repo-relative
  const modularIdx = u.indexOf("/modular/");
  if (modularIdx !== -1) {
    const relFromModular = u.substring(modularIdx + "/modular/".length);
    return path.join(SCHEMA_ROOT, relFromModular);
  }

  // file:// URLs – drop the scheme and treat as a normal path
  if (u.startsWith("file://")) {
    u = u.slice("file://".length);
  }

  // If it already looks repo-relative ("modular/…" or "something.json"), use it as
  // a path relative to REPO_ROOT.
  u = u.replace(/^\/+/, ""); // remove leading slashes if any
  return path.join(REPO_ROOT, u);
}

// -----------------------------------------------------------------------------
// Dereferencing
// -----------------------------------------------------------------------------

async function dereferenceSchema(relativePath) {
  console.log("#".repeat(80));
  console.log(`Processing: ${relativePath}`);

  const entryFile = path.join(SCHEMA_ROOT, relativePath);

  const dereferencedSchema = await $RefParser.dereference(entryFile, {
    // IMPORTANT: use ONLY local filesystem; map all refs via urlToLocalPath
    resolve: {
      file: {
        async read(file) {
          const fullPath = path.normalize(urlToLocalPath(file.url));
          console.log(`Resolving (file): ${fullPath}`);
          return fs.readFile(fullPath, "utf8");
        },
      },
      http: {
        async read(file) {
          const fullPath = path.normalize(urlToLocalPath(file.url));
          console.log(`Resolving (http→local): ${fullPath}`);
          return fs.readFile(fullPath, "utf8");
        },
      },
      https: {
        async read(file) {
          const fullPath = path.normalize(urlToLocalPath(file.url));
          console.log(`Resolving (https→local): ${fullPath}`);
          return fs.readFile(fullPath, "utf8");
        },
      },
    },
  });

  return dereferencedSchema;
}

/**
 * Strip $id/$schema from child nodes and adjust the root $id
 * from /modular/ to /standalone/.
 */
function stripIdsFromChildren(obj) {
  function recurse(node, isRoot = false) {
    if (typeof node !== "object" || node === null) return;

    if (isRoot) {
      if (typeof node.$id === "string") {
        // Change the location from modular -> standalone in the root id
        node.$id = node.$id.replace("/modular/", "/standalone/");
      }
    } else {
      delete node.$id;
      delete node.$schema;
    }

    for (const key of Object.keys(node)) {
      recurse(node[key], false);
    }
  }

  recurse(obj, true);
  return obj;
}

async function main() {
  for (const [key, schemaPath] of Object.entries(SCHEMAS)) {
    try {
      let dereferenced = await dereferenceSchema(schemaPath);
      dereferenced = stripIdsFromChildren(dereferenced);

      console.log(`${key} schema dereferenced successfully`);

      const outputPath = path.join(OUTPUT_DIR, schemaPath);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(dereferenced, null, 2));

      console.log(`Written to ${outputPath}`);
    } catch (err) {
      console.error(`Failed to dereference ${key}:`, err.message);
    }
  }
}

main().catch((err) => console.error("Unhandled error:", err));
