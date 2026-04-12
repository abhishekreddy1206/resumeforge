# Security & Runtime Reviewer Memory Index

## Project Security Patterns
- [project_prompt_injection_risk.md](project_prompt_injection_risk.md) — AI skills interpolate untrusted data + PII into LLM prompts
- [project_no_auth_api_routes.md](project_no_auth_api_routes.md) — All API routes unauthenticated, acceptable for local use only
- [project_json_parse_pattern.md](project_json_parse_pattern.md) — Recurring unsafe JSON.parse on SQLite string fields without try/catch
- [project_latex_url_injection.md](project_latex_url_injection.md) — LaTeX generator does not escape URLs inside \href{}, allowing injection
