---
name: Unsafe JSON.parse on DB fields
description: Recurring pattern of JSON.parse on SQLite string fields without try/catch — causes crashes on corrupt data
type: project
---

Due to SQLite limitations, array fields (experience.bullets, experience.skills, project.skills) are stored as JSON-encoded strings. Code throughout the codebase does `typeof x === "string" ? JSON.parse(x) : x` without try/catch. Corrupt data crashes the entire request.

**Why:** SQLite has no native JSON array type, so arrays are stringified.

**How to apply:** When reviewing code that reads these fields, ensure JSON.parse is wrapped in try/catch with a fallback to empty array.
