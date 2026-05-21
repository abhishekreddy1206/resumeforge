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

/**
 * Decide whether `npm install` should run under `root`.
 * True if node_modules is absent, or its install marker is missing/stale
 * relative to package-lock.json.
 */
function needsInstall(root) {
  const nodeModules = path.join(root, "node_modules");
  if (!fs.existsSync(nodeModules)) {
    return true;
  }
  const lockPath = path.join(root, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    return false; // no lockfile to compare against
  }
  const markerPath = path.join(nodeModules, ".package-lock.json");
  if (!fs.existsSync(markerPath)) {
    return true; // node_modules present but never fully installed
  }
  return fs.statSync(lockPath).mtimeMs > fs.statSync(markerPath).mtimeMs;
}

module.exports = { repoRoot, ensureEnv, needsInstall };
