"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { repoRoot, ensureEnv } = require("./preflight");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rf-preflight-"));
}

test("repoRoot points at the directory containing package.json", () => {
  const root = repoRoot();
  assert.ok(
    fs.existsSync(path.join(root, "package.json")),
    `expected package.json under ${root}`,
  );
});

test("ensureEnv copies .env.example when .env is missing", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, ".env.example"), "DATABASE_URL=file:./x.db\n");
  const result = ensureEnv(dir);
  assert.strictEqual(result.status, "created");
  assert.strictEqual(
    fs.readFileSync(path.join(dir, ".env"), "utf8"),
    "DATABASE_URL=file:./x.db\n",
  );
});

test("ensureEnv leaves an existing .env untouched", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, ".env"), "KEEP=1\n");
  fs.writeFileSync(path.join(dir, ".env.example"), "KEEP=0\n");
  const result = ensureEnv(dir);
  assert.strictEqual(result.status, "exists");
  assert.strictEqual(fs.readFileSync(path.join(dir, ".env"), "utf8"), "KEEP=1\n");
});

test("ensureEnv reports missing when neither file exists", () => {
  const dir = tmpDir();
  const result = ensureEnv(dir);
  assert.strictEqual(result.status, "missing");
});
