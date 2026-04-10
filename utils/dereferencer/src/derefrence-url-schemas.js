#!/usr/bin/env node

const $RefParser = require('@apidevtools/json-schema-ref-parser');
const path = require('path');
const fs = require('fs').promises;

const OUTPUT_DIR = path.resolve("../../../standalone/");

/**
 * Schemas to dereference.
 *
 * - `url`    : the online $id / raw URL of the modular schema (source)
 * - `output` : relative path inside the standalone tree (target)
 */
const SCHEMAS = {
  real_dataset_metadata: {
    url: 'https://github.com/umetadataforms/schemas/raw/main/modular/real-dataset-metadata/v0.0.2.json',
    output: 'real-dataset-metadata/v0.0.2.json'
  },
  tabular_data_metadata: {
    url: 'https://github.com/umetadataforms/schemas/raw/main/modular/tabular-data-metadata/v0.0.2.json',
    output: 'tabular-data-metadata/v0.0.2.json'
  }
};

async function dereferenceSchema(schemaUrl) {
  console.log('#'.repeat(80));
  console.log(`Processing: ${schemaUrl}`);

  // Let $RefParser resolve HTTP(S) URLs directly, following $ref URLs online.
  const dereferencedSchema = await $RefParser.dereference(schemaUrl);
  return dereferencedSchema;
}

/**
 * Strip $id/$schema from child nodes and adjust the root $id
 * from /modular/ to /standalone/.
 */
function stripIdsFromChildren(rootSchema) {
  function recurse(node, isRoot = false) {
    if (typeof node !== 'object' || node === null) return;

    if (isRoot) {
      if (typeof node.$id === 'string') {
        // Change the location from modular -> standalone
        node.$id = node.$id.replace('/modular/', '/standalone/');
      }
    } else {
      delete node.$id;
      delete node.$schema;
    }

    for (const key of Object.keys(node)) {
      recurse(node[key], false);
    }
  }

  recurse(rootSchema, true);
  return rootSchema;
}

async function main() {
  for (const [key, schemaCfg] of Object.entries(SCHEMAS)) {
    try {
      let dereferenced = await dereferenceSchema(schemaCfg.url);
      dereferenced = stripIdsFromChildren(dereferenced);

      console.log(`${key} schema dereferenced successfully`);

      const outputPath = path.join(OUTPUT_DIR, schemaCfg.output);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(dereferenced, null, 2));

      console.log(`Written to ${outputPath}`);
    } catch (err) {
      console.error(`Failed to dereference ${key}:`, err.message);
    }
  }
}

main().catch(err => console.error('Unhandled error:', err));
