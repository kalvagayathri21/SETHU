import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schemaUrl = new URL("../schema.sql", import.meta.url);
const initScriptUrl = new URL("../../scripts/init-db.js", import.meta.url);

test("database setup adds the sample marker safely and preserves existing sample listings", async () => {
  const [schema, initScript] = await Promise.all([
    readFile(schemaUrl, "utf8"),
    readFile(initScriptUrl, "utf8")
  ]);

  assert.match(
    schema,
    /ALTER TABLE users ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;/
  );
  assert.match(schema, /ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS sample_key TEXT UNIQUE;/);
  assert.match(schema, /SET is_sample = true[\s\S]*?u\.role IN \('INDIVIDUAL_PROVIDER', 'BUSINESS_PROVIDER'\)/);
  assert.match(schema, /sr\.sample_key LIKE 'sample-provider-review:%'/);
  assert.match(schema, /u\.email = 'sample-customer@demo\.sethu\.invalid'/);
  assert.match(initScript, /readFile\(path\.join\(scriptDirectory, "\.\.", "backend", "schema\.sql"\)/);
  assert.match(initScript, /await pool\.query\(schema\)/);
});
