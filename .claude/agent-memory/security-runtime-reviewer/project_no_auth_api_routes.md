---
name: No authentication on API routes
description: All API routes are unauthenticated — acceptable for local single-user tool but critical if deployed
type: project
---

All API routes under `src/app/api/` have no authentication or authorization. This includes destructive endpoints like `/api/profile/chat/apply` that overwrite the entire profile.

**Why:** The app appears designed as a local/single-user tool (SQLite, single profile via `findFirst`).

**How to apply:** Flag as critical if any deployment or multi-user plans emerge. The `/api/profile/chat/apply` endpoint is the highest risk since it accepts arbitrary JSON and writes directly to DB.
