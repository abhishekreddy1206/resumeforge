---
name: LaTeX URL injection in href helper
description: LaTeX generator does not escape URLs inside \href{}, allowing injection of LaTeX commands via crafted URLs
type: project
---

In `src/lib/generators/latex.ts`, the `href()` function escapes display text via `esc()` but passes URLs raw into `\href{url}`. Characters like `}`, `{`, `%`, `#`, `\` in URLs can break or inject LaTeX commands.

**Why:** The `esc()` function was designed for body text, not for the URL argument of `\href{}` which has different escaping rules.

**How to apply:** When reviewing LaTeX generation code, verify that URLs are escaped with a URL-specific escaping function before interpolation into `\href{}`.
