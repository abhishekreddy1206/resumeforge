"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** Absolute path to the repo root, resolved from this file's location. */
function repoRoot() {
  return path.join(__dirname, "..");
}

/**
 * Ensure a .env file exists under `root`.
 * Returns { status: "exists" | "created" | "missing" }.
 */
function ensureEnv(root) {
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    return { status: "exists" };
  }
  const examplePath = path.join(root, ".env.example");
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    return { status: "created" };
  }
  return { status: "missing" };
}

module.exports = { repoRoot, ensureEnv };
