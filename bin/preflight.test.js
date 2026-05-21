"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const { repoRoot, ensureEnv, needsInstall, findOpenPort } = require("./preflight");

const createdTmpDirs = [];

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rf-preflight-"));
  createdTmpDirs.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of createdTmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

test("needsInstall is true when node_modules is absent", () => {
  const dir = tmpDir();
  assert.strictEqual(needsInstall(dir), true);
});

test("needsInstall is false when the install marker is current", () => {
  const dir = tmpDir();
  const nm = path.join(dir, "node_modules");
  fs.mkdirSync(nm);
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
  fs.writeFileSync(path.join(nm, ".package-lock.json"), "{}");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(dir, "package-lock.json"), old, old);
  // marker keeps its "now" mtime → newer than the lockfile → not stale
  assert.strictEqual(needsInstall(dir), false);
});

test("needsInstall is true when package-lock.json is newer than the install marker", () => {
  const dir = tmpDir();
  const nm = path.join(dir, "node_modules");
  fs.mkdirSync(nm);
  fs.writeFileSync(path.join(nm, ".package-lock.json"), "{}");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(nm, ".package-lock.json"), old, old);
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}"); // written "now" → newer
  assert.strictEqual(needsInstall(dir), true);
});

test("needsInstall is true when node_modules exists but the install marker is missing", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
  assert.strictEqual(needsInstall(dir), true);
});

test("needsInstall is false when node_modules exists and there is no lockfile", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, "node_modules"));
  assert.strictEqual(needsInstall(dir), false);
});

test("findOpenPort skips an occupied port and returns a free one", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const busy = server.address().port;
  try {
    const port = await findOpenPort(busy, busy + 20);
    assert.notStrictEqual(port, busy);
    assert.ok(port > busy && port <= busy + 20, `got ${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("findOpenPort throws when the whole range is occupied", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const busy = server.address().port;
  try {
    await assert.rejects(
      () => findOpenPort(busy, busy),
      /No open port/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("findOpenPort detects a port occupied on IPv6 only", async (t) => {
  // A server bound to the IPv6 wildcard with ipv6Only leaves the IPv4
  // loopback (127.0.0.1) free. findOpenPort must still treat the port as
  // occupied, because the dev server (next dev) binds the unspecified
  // address — so the probe must too, not just IPv4 loopback.
  const server = net.createServer();
  const bound = await new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.once("listening", () => resolve(true));
    server.listen({ port: 0, host: "::", ipv6Only: true });
  });
  if (!bound) {
    t.skip("IPv6 not available on this host");
    return;
  }
  const busy = server.address().port;
  try {
    await assert.rejects(() => findOpenPort(busy, busy), /No open port/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
