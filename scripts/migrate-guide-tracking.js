#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * One-time migration: extract _sectionStatuses, _sectionErrors, _sectionAttempts
 * from the Guide.content JSON blob into dedicated columns.
 */

const path = require("path");
const { execFileSync } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env") });

function getDbPath() {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const filePath = url.replace("file:", "");
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(process.cwd(), filePath);
}

function query(dbPath, sql) {
  const output = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
  });
  return output.trim() ? JSON.parse(output) : [];
}

function run(dbPath, sql) {
  execFileSync("sqlite3", [dbPath, sql], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function main() {
  const dbPath = getDbPath();
  console.log(`Database: ${dbPath}`);

  const guides = query(dbPath, "SELECT id, content, sectionStatuses FROM Guide");
  console.log(`Found ${guides.length} guides to migrate`);

  let migrated = 0;
  let skipped = 0;

  for (const guide of guides) {
    if (guide.sectionStatuses) {
      skipped++;
      continue;
    }

    try {
      const content = JSON.parse(guide.content);
      const statuses = content._sectionStatuses || {};
      const errors = content._sectionErrors || {};
      const attempts = content._sectionAttempts || {};

      const hasData =
        Object.keys(statuses).length > 0 ||
        Object.keys(errors).length > 0 ||
        Object.keys(attempts).length > 0;

      if (!hasData) {
        skipped++;
        continue;
      }

      const statusesStr = JSON.stringify(statuses).replace(/'/g, "''");
      const errorsStr = JSON.stringify(errors).replace(/'/g, "''");
      const attemptsStr = JSON.stringify(attempts).replace(/'/g, "''");

      run(dbPath,
        `UPDATE Guide SET sectionStatuses = '${statusesStr}', sectionErrors = '${errorsStr}', sectionAttempts = '${attemptsStr}' WHERE id = '${guide.id}'`
      );

      migrated++;
      console.log(`  Migrated guide ${guide.id} (${Object.keys(statuses).length} sections)`);
    } catch (err) {
      console.error(`  Failed to migrate guide ${guide.id}:`, err.message);
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped`);
}

main();
