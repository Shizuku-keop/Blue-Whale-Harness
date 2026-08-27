#!/usr/bin/env node
/**
 * compat/validate.mjs — maintenance gate for the DSH compat registry.
 *
 * Zero-dependency structural validator for compat.json. It mirrors the rules
 * declared in schema.json (draft-07) plus a few repo-hygiene checks:
 *   - version-key coverage (every plugins.*.<ver> / storageFormats key must be
 *     listed in dshVersions),
 *   - date format (ISO 8601), status/sessionFormat enums,
 *   - alphabetical ordering of plugin keys (warning only),
 *   - stale-registry warning (> 90 days since `updated`, warning only).
 *
 * Usage:  node compat/validate.mjs [compat.json] [schema.json]
 * Exit:   0 = valid, 1 = invalid (failures only; warnings don't fail).
 */
import { readFileSync } from 'node:fs';

const [, , compatPath = 'compat/compat.json', schemaPath = 'compat/schema.json'] = process.argv;

const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const STATUS = new Set(['pass', 'fail', 'unknown']);
const SESSION_FORMAT = new Set(['zstd-jsonl', 'sqlite', 'unknown']);
const STALE_MS = 90 * 24 * 60 * 60 * 1000;

let failed = false;
const fail = (msg) => { failed = true; console.error(`FAIL  ${msg}`); };
const warn = (msg) => console.warn(`WARN  ${msg}`);
const ok = (msg) => console.log(`ok    ${msg}`);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`FAIL  ${path}: ${e.message}`);
    process.exit(1);
  }
}

function isVersion(v) { return typeof v === 'string' && VERSION_RE.test(v); }
function isIso(s) { return typeof s === 'string' && ISO_RE.test(s) && !Number.isNaN(Date.parse(s)); }
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

const data = readJson(compatPath);
const schema = readJson(schemaPath);

// --- top level ---
for (const key of ['schema', 'updated', 'generator', 'plugins', 'storageFormats']) {
  if (!(key in data)) fail(`${compatPath}: missing required top-level field "${key}"`);
}
if (isPlainObject(schema) && 'const' in (schema.schema ?? {})) {
  if (data.schema !== schema.schema.const) fail(`schema field: ${data.schema} !== schema.json const ${schema.schema.const}`);
} else if (data.schema !== 1) {
  fail(`schema field: expected 1, got ${JSON.stringify(data.schema)}`);
}
if (typeof data.updated !== 'string' || !isIso(data.updated)) fail(`updated: not a valid ISO-8601 timestamp (${JSON.stringify(data.updated)})`);
if (typeof data.generator !== 'string' || data.generator.length === 0) fail('generator: must be a non-empty string');

const staleMs = Date.now() - Date.parse(data.updated);
if (staleMs > STALE_MS) warn(`registry is stale: updated=${data.updated} (>90 days old)`);

// --- dshVersions ---
let versions = [];
if ('dshVersions' in data) {
  if (!Array.isArray(data.dshVersions) || data.dshVersions.length === 0) {
    fail('dshVersions: must be a non-empty array');
  } else {
    versions = data.dshVersions;
    versions.forEach((v, i) => { if (!isVersion(v)) fail(`dshVersions[${i}]: "${v}" does not match version pattern`); });
  }
}
const versionSet = new Set(versions);

// --- storageFormats ---
if (!isPlainObject(data.storageFormats)) {
  fail('storageFormats: must be an object');
} else {
  for (const [ver, fmt] of Object.entries(data.storageFormats)) {
    if (!isVersion(ver)) fail(`storageFormats: key "${ver}" is not a valid version`);
    if (versions.length > 0 && !versionSet.has(ver)) fail(`storageFormats: key "${ver}" not listed in dshVersions`);
    if (!isPlainObject(fmt)) { fail(`storageFormats.${ver}: must be an object`); continue; }
    if (!SESSION_FORMAT.has(fmt.sessionFormat)) fail(`storageFormats.${ver}.sessionFormat: "${fmt.sessionFormat}" not in ${[...SESSION_FORMAT].join('|')}`);
    if ('projcacheVersion' in fmt && fmt.projcacheVersion !== null && !Number.isInteger(fmt.projcacheVersion)) {
      fail(`storageFormats.${ver}.projcacheVersion: must be an integer or null`);
    }
    if ('verifiedAt' in fmt && !isIso(fmt.verifiedAt)) fail(`storageFormats.${ver}.verifiedAt: not a valid ISO timestamp`);
    if ('evidence' in fmt && typeof fmt.evidence !== 'string') fail(`storageFormats.${ver}.evidence: must be a string`);
  }
}

// --- plugins ---
let rowCount = 0;
if (!isPlainObject(data.plugins)) {
  fail('plugins: must be an object');
} else {
  const names = Object.keys(data.plugins);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (names.join('\n') !== sorted.join('\n')) warn('plugins: keys are not in alphabetical order');
  for (const [name, perVer] of Object.entries(data.plugins)) {
    if (!isPlainObject(perVer)) { fail(`plugins.${name}: must be an object of dsh-version -> result`); continue; }
    for (const [ver, row] of Object.entries(perVer)) {
      if (!isVersion(ver)) fail(`plugins.${name}: version key "${ver}" is not a valid version`);
      if (versions.length > 0 && !versionSet.has(ver)) fail(`plugins.${name}["${ver}"]: version not listed in dshVersions`);
      if (!isPlainObject(row)) { fail(`plugins.${name}["${ver}"]: result must be an object`); continue; }
      if (!STATUS.has(row.status)) fail(`plugins.${name}["${ver}"].status: "${row.status}" not in ${[...STATUS].join('|')}`);
      if (!isIso(row.testedAt)) fail(`plugins.${name}["${ver}"].testedAt: not a valid ISO timestamp`);
      if ('dshVersion' in row && row.dshVersion !== ver) fail(`plugins.${name}["${ver}"].dshVersion: "${row.dshVersion}" != key "${ver}"`);
      for (const f of ['by', 'evidence', 'pluginVersion']) {
        if (f in row && typeof row[f] !== 'string') fail(`plugins.${name}["${ver}"].${f}: must be a string`);
      }
      rowCount++;
    }
  }
}

ok(`${compatPath}: schema=${data.schema}, ${Object.keys(data.plugins ?? {}).length} plugins, ${rowCount} version-rows, ${Object.keys(data.storageFormats ?? {}).length} storage formats`);
if (failed) { console.error('compat.json is INVALID'); process.exit(1); }
console.log('compat.json is valid.');
