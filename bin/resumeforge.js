#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const { repoRoot, ensureEnv, needsInstall, findOpenPort } = require("./preflight");

const USAGE = `resumeforge — ResumeForge launcher

Usage:
  resumeforge up    Start the dev server + background worker
`;

/**
 * Spawn a command, inheriting stdio. Resolves with its exit code.
 * Rejects if the process fails to spawn (e.g. the binary is not on PATH),
 * since no `exit` event fires in that case.
 */
function run(cmd, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code == null ? 1 : code));
  });
}

async function up() {
  const root = repoRoot();

  // 1. .env preflight
  const env = ensureEnv(root);
  if (env.status === "created") {
    console.log("⚠  Created .env from .env.example — review it before relying on the app.");
  } else if (env.status === "missing") {
    console.log("⚠  No .env or .env.example found — the app may not be configured.");
  }

  // 2. dependency preflight
  if (needsInstall(root)) {
    console.log("Installing dependencies (npm install)…");
    const installCode = await run("npm", ["install"], root, process.env);
    if (installCode !== 0) {
      console.error("npm install failed.");
      process.exit(installCode);
    }
  }

  // 3. port selection
  const port = await findOpenPort(3000, 3010);
  if (port !== 3000) {
    console.log(`Port 3000 in use — starting on ${port}`);
  }

  // 4. launch dev server + worker
  const code = await run("npm", ["run", "dev:all"], root, {
    ...process.env,
    PORT: String(port),
  });
  process.exit(code);
}

function main() {
  const cmd = process.argv[2];

  if (cmd === "up") {
    up().catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
    return;
  }

  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  process.stderr.write(`Unknown command: ${cmd}\n\n${USAGE}`);
  process.exit(1);
}

main();
