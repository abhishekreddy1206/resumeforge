#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("crypto");
const path = require("path");
const { execFileSync } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env") });

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "referer",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ss_source",
  "ss_campaign",
  "gh_src",
  "gh_jid",
]);

const REVIEW_FLAG_ORDER = [
  "too_short",
  "dom_fallback",
  "untitled",
  "boilerplate_heavy",
];

const REVIEW_FLAG_LABELS = {
  too_short: "too short",
  dom_fallback: "captured from page DOM fallback",
  untitled: "missing a strong title",
  boilerplate_heavy: "contains heavy boilerplate",
};

const BOILERPLATE_TERMS = [
  { phrase: "subscribe", weight: 1 },
  { phrase: "sign in", weight: 1 },
  { phrase: "cookie", weight: 1 },
  { phrase: "privacy", weight: 1 },
  { phrase: "terms", weight: 1 },
  { phrase: "share", weight: 1 },
  { phrase: "menu", weight: 0.5 },
  { phrase: "home", weight: 0.5 },
];

function resolveDbPath() {
  const configured = process.env.DATABASE_URL;
  if (!configured) {
    return path.join(process.cwd(), "prisma", "dev.db");
  }
  if (configured.startsWith("file:")) {
    return configured.slice("file:".length);
  }
  return configured;
}

const dbPath = resolveDbPath();
const force = process.argv.includes("--force");

function runSql(sql) {
  execFileSync("sqlite3", [dbPath, sql], {
    stdio: "pipe",
    encoding: "utf8",
  });
}

function queryJson(sql) {
  const output = execFileSync("sqlite3", ["-json", dbPath, sql], {
    stdio: "pipe",
    encoding: "utf8",
  });
  return output.trim() ? JSON.parse(output) : [];
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeArticleUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const keysToDelete = [];
    parsed.searchParams.forEach((_value, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    parsed.searchParams.sort();
    parsed.hash = "";

    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "");
    let normalized = `${protocol}//${host}${pathname}`;
    const qs = parsed.searchParams.toString();
    if (qs) {
      normalized += `?${qs}`;
    }
    return normalized;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function normalizeCaptureMethod(captureMethod) {
  return captureMethod === "dom_fallback" ? "dom_fallback" : "scraped";
}

function normalizeText(text) {
  return String(text || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function computeReview(title, content, captureMethod) {
  const normalizedText = normalizeText(content);
  const wordCount = normalizedText ? normalizedText.split(/\s+/u).filter(Boolean).length : 0;
  const flags = [];

  if (wordCount < 150) {
    flags.push("too_short");
  }
  if (captureMethod === "dom_fallback") {
    flags.push("dom_fallback");
  }
  if (!String(title || "").trim() || String(title || "").trim() === "Untitled") {
    flags.push("untitled");
  }

  const firstWords = normalizedText.split(/\s+/u).slice(0, 400).join(" ").toLowerCase();
  let score = 0;
  for (const term of BOILERPLATE_TERMS) {
    if (firstWords.includes(term.phrase)) {
      score += term.weight;
    }
  }
  if (score >= 4) {
    flags.push("boilerplate_heavy");
  }

  const orderedFlags = REVIEW_FLAG_ORDER.filter((flag) => flags.includes(flag));
  return {
    contentHash: crypto.createHash("sha256").update(normalizedText).digest("hex"),
    wordCount,
    reviewFlags: JSON.stringify(orderedFlags),
    reviewSummary: orderedFlags.length > 0
      ? orderedFlags.map((flag) => REVIEW_FLAG_LABELS[flag]).join(", ")
      : null,
  };
}

function effectiveTimestamp(row) {
  return new Date(row.lastRefreshedAt || row.createdAt).getTime();
}

function createSavedSourceVersionInsert(savedSourceId, version, entry) {
  return `INSERT INTO "SavedSourceVersion" (
    "id", "savedSourceId", "version", "url", "title", "content", "contentHash",
    "captureMethod", "publisher", "publishedAt", "wordCount", "reviewFlags",
    "reviewSummary", "changeType", "createdAt"
  ) VALUES (
    ${sqlValue(crypto.randomUUID())},
    ${sqlValue(savedSourceId)},
    ${sqlValue(version)},
    ${sqlValue(entry.normalizedUrl)},
    ${sqlValue(entry.row.title || "Untitled")},
    ${sqlValue(entry.row.content)},
    ${sqlValue(entry.contentHash)},
    ${sqlValue(entry.captureMethod)},
    ${sqlValue(entry.row.publisher)},
    ${sqlValue(entry.row.publishedAt)},
    ${sqlValue(entry.wordCount)},
    ${sqlValue(entry.reviewFlags)},
    ${sqlValue(entry.reviewSummary)},
    'migrated',
    ${sqlValue(entry.row.createdAt)}
  );`;
}

function backfillSavedSources() {
  const existingVersionCount = queryJson(`SELECT COUNT(*) AS count FROM "SavedSourceVersion";`)[0]?.count || 0;
  if (existingVersionCount > 0) {
    if (!force) {
      throw new Error("SavedSourceVersion already contains data. Re-run with --force only if you are intentionally rebuilding migrated history.");
    }
    runSql(`DELETE FROM "SavedSourceVersion";`);
  }

  const sources = queryJson(`
    SELECT
      "id",
      "profileId",
      "type",
      "url",
      "title",
      "content",
      "captureMethod",
      "publisher",
      "publishedAt",
      "lastRefreshedAt",
      "createdAt"
    FROM "SavedSource"
    ORDER BY "createdAt" ASC;
  `);

  const groups = new Map();
  for (const source of sources) {
    const normalizedUrl = normalizeArticleUrl(source.url);
    const key = `${source.profileId}:${normalizedUrl}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(source);
  }

  let mergedGroups = 0;
  let createdVersions = 0;

  const statements = ["BEGIN;"];

  for (const group of groups.values()) {
    const entries = group.map((row) => {
      const captureMethod = normalizeCaptureMethod(row.captureMethod);
      return {
        row,
        normalizedUrl: normalizeArticleUrl(row.url),
        captureMethod,
        ...computeReview(row.title, row.content, captureMethod),
      };
    });

    const survivor = [...entries].sort((a, b) => effectiveTimestamp(b.row) - effectiveTimestamp(a.row))[0];
    const distinctByHash = new Map();
    for (const entry of entries) {
      const current = distinctByHash.get(entry.contentHash);
      if (!current || effectiveTimestamp(entry.row) >= effectiveTimestamp(current.row)) {
        distinctByHash.set(entry.contentHash, entry);
      }
    }

    const versionEntries = Array.from(distinctByHash.values()).sort((a, b) => {
      return effectiveTimestamp(a.row) - effectiveTimestamp(b.row);
    });

    for (let index = 0; index < versionEntries.length; index += 1) {
      statements.push(createSavedSourceVersionInsert(survivor.row.id, index + 1, versionEntries[index]));
      createdVersions += 1;
    }

    const headEntry = versionEntries[versionEntries.length - 1] || survivor;
    statements.push(`
      UPDATE "SavedSource"
      SET
        "url" = ${sqlValue(headEntry.normalizedUrl)},
        "title" = ${sqlValue(headEntry.row.title || "Untitled")},
        "content" = ${sqlValue(headEntry.row.content)},
        "version" = ${sqlValue(versionEntries.length || 1)},
        "contentHash" = ${sqlValue(headEntry.contentHash)},
        "wordCount" = ${sqlValue(headEntry.wordCount)},
        "reviewFlags" = ${sqlValue(headEntry.reviewFlags)},
        "reviewSummary" = ${sqlValue(headEntry.reviewSummary)},
        "captureMethod" = ${sqlValue(headEntry.captureMethod)},
        "publisher" = ${sqlValue(headEntry.row.publisher)},
        "publishedAt" = ${sqlValue(headEntry.row.publishedAt)},
        "lastRefreshedAt" = ${sqlValue(headEntry.row.lastRefreshedAt)}
      WHERE "id" = ${sqlValue(survivor.row.id)};
    `);

    const loserIds = entries
      .map((entry) => entry.row.id)
      .filter((id) => id !== survivor.row.id);

    if (loserIds.length > 0) {
      mergedGroups += 1;
      statements.push(`
        UPDATE "GuideSource"
        SET
          "savedSourceId" = ${sqlValue(survivor.row.id)},
          "savedSourceVersionId" = NULL
        WHERE "savedSourceId" IN (${loserIds.map(sqlValue).join(", ")});
      `);
      statements.push(`DELETE FROM "SavedSource" WHERE "id" IN (${loserIds.map(sqlValue).join(", ")});`);
    }
  }
  statements.push("COMMIT;");
  runSql(statements.join("\n"));

  return {
    groups: groups.size,
    mergedGroups,
    createdVersions,
  };
}

function backfillGuideVersions() {
  runSql(`UPDATE "GuideVersion" SET "snapshotSemantics" = 'legacy_previous_head';`);

  const guides = queryJson(`
    SELECT "id", "version", "content"
    FROM "Guide";
  `);

  let createdCurrentHeadSnapshots = 0;
  const statements = [`UPDATE "GuideVersion" SET "snapshotSemantics" = 'legacy_previous_head';`, "BEGIN;"];

  for (const guide of guides) {
    const existing = queryJson(`
      SELECT "id"
      FROM "GuideVersion"
      WHERE "guideId" = ${sqlValue(guide.id)}
        AND "version" = ${sqlValue(guide.version)}
      LIMIT 1;
    `);

    if (existing.length > 0) {
      continue;
    }

    statements.push(`
      INSERT INTO "GuideVersion" (
        "id", "guideId", "version", "content", "changeDescription", "snapshotSemantics", "sourceRefs", "createdAt"
      ) VALUES (
        ${sqlValue(crypto.randomUUID())},
        ${sqlValue(guide.id)},
        ${sqlValue(guide.version)},
        ${sqlValue(guide.content)},
        'Backfilled current guide version',
        'current_head',
        '[]',
        CURRENT_TIMESTAMP
      );
    `);
    createdCurrentHeadSnapshots += 1;
  }
  statements.push("COMMIT;");
  runSql(statements.join("\n"));

  return {
    guides: guides.length,
    createdCurrentHeadSnapshots,
  };
}

function main() {
  const savedSourceSummary = backfillSavedSources();
  const guideVersionSummary = backfillGuideVersions();

  console.log(JSON.stringify({
    dbPath,
    savedSourceSummary,
    guideVersionSummary,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[backfill-learn-source-versioning] Failed:", error);
  process.exitCode = 1;
}
