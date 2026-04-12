---
name: Prompt injection risk in AI skills
description: LLM prompts interpolate untrusted external data (job descriptions, user messages) alongside PII — indirect prompt injection risk
type: project
---

The AI skills in `src/lib/claude/skills/` construct prompts by string-interpolating untrusted data (scraped job descriptions, user chat messages) alongside the candidate's full profile (including PII like email, phone). This creates indirect prompt injection risk where a malicious job posting could cause the LLM to exfiltrate PII.

**Why:** Job descriptions are scraped from external URLs — attacker-controlled content. The candidate's full profile is in the same prompt context.

**How to apply:** When reviewing new AI skills or changes to existing ones, always check: (1) is untrusted data interpolated into prompts? (2) is PII in the same prompt? (3) are there delimiter/defensive instructions separating system instructions from untrusted content?
