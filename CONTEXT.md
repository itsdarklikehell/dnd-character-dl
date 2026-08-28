# CONTEXT

A project to extract tabletop RPG characters from online platforms and normalize
them into a common shape. It starts with D&D Beyond; the intent is to support
several platforms (Roll20, etc.) in the future.

## Domain vocabulary

- **Raw payload** — the complete, untouched API response from a platform. For
  D&D Beyond it is the `data` object inside the `{ success, message, data }`
  envelope returned by the `character-service` endpoint.
- **Character** — the normalized object the project produces. Today its shape is
  derived entirely from D&D Beyond. _Open question:_ decide how much of this shape
  is common to every platform (see Source).
- **Normalizer** — the **pure** Raw payload → Character transformation. For D&D
  Beyond it lives in `src/sources/dndbeyond/normalize.mjs`
  (`normalizeCharacter(raw, { fetchedAt })`). It does no fetching, never touches the
  filesystem and never calls `new Date()`: `fetchedAt` is injected. It is the
  project's test surface. Every Source has its own (see ADR-0001).
- **Source** — an origin platform. Each Source lives under
  `src/sources/<platform>/` and is independent: its own fetch plus its own
  Normalizer, with no shared `Character` contract (see `docs/adr/0001`). Source
  shape: `{ platform, matches, fetchRaw, normalize }`. Today **dndbeyond** and
  **nivel20** exist. The registry and `resolveSource` live in `src/sources/index.mjs`.
- **Sink** — where the Character is persisted. It lives in `src/save.mjs`
  (`saveCharacter({ raw, character }, { dir })`), with the directory controlled by
  the caller (default `<cwd>/dndbeyond/<slug>/`).
- **Seam** — where an interface lives; a place where behavior can be swapped
  without editing in place.

## Architecture status

- ✅ **Pure core** (`src/sources/<platform>/normalize.mjs`) separated from I/O.
  Deterministic and testable.
- ✅ **Package boundary** — `package.json` with `exports` (library) + `bin` (CLI),
  a caller-controlled Sink (`src/save.mjs`), the API in `src/index.mjs`, and the
  suite in `test/` (no network).
- 🚫 **Unified Character** — deliberately rejected (see ADR-0001). Every Source
  normalizes independently; the registry only dispatches.
- ✅ **Source seam** — built once the 2nd platform arrived (Nivel20). Both are
  downloaded from a public URL, so `fetchRaw(idOrUrl)` is the right interface.
  Registry + `resolveSource` in `src/sources/index.mjs`; the Sink groups by platform.
