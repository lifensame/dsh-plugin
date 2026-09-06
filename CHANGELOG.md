# Changelog

## 0.2.0 — 2026-09-06

### Fixed

- **Chinese (and other non-ASCII) titles no longer collapse to the same id.** Slugs now keep Unicode letters and digits, so 中文标题 produce distinct ids and re-saving the same title updates its memory instead of overwriting a different one. Titles made only of symbols/emoji fall back to a stable title hash.
- **`memory_delete` no longer accepts malformed ids.** Every file operation validates the id (letters, digits, and hyphens only), so an id like `../victim` can no longer escape the memory directory.

### Changed

- `memory_search` (and `/memory <text>`) now splits multi-word queries: memories matching **all** words rank first, with a best-effort fallback to partial matches when nothing matches everything. `limit` is capped at 50.
- `memory_summarize` with an explicit `title` reuses that id and updates the existing memory instead of accumulating duplicates; a model-derived title still always creates a fresh entry. The output now includes `action: created|updated`.

### Added

- `/memory show <id>`, `/memory rm <id>`, and `/memory help` subcommands (plain text still searches, as before).
- `npm test` — a self-contained smoke test that stubs the `@deepseek-ai` peer packages and exercises the real plugin code.
