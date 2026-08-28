---
status: accepted
---

# Every Source normalizes independently; there is no unified Character across platforms

The project will support several origin platforms (Sources) — D&D Beyond today, Roll20/Foundry later — but we will **not** build a unified `Character` contract shared between them. Each Source has its own Normalizer and produces its own shape, persisted separately (`<platform>/<character>/character.json`). We decided this because the goal is to download and archive each character on its own (not to compare or merge them), because normalization code is inherently platform-specific (D&D Beyond's `modifiers` system looks nothing like Foundry's actor data or Roll20's export, even though both are D&D 5e), and because since they are all 5e the outputs will converge in shape naturally, without imposing a contract.

## Considered Options

- **Unified Character (rejected):** one identical shape for every platform behind a common `Source` interface. It would be a deep module and would justify the seam, but it only pays off if you want to compare or merge characters across platforms — which is not the case. With a single platform implemented, its contract would be guesswork.
- **Independent Sources (chosen):** each platform is an island under `src/sources/<platform>/`, sharing only the Sink (`src/save.mjs`) and the CLI shell.

## Consequences

- The Source seam (the `fetchRaw`/registry interface) is **not built yet**. The differing acquisition modes (D&D Beyond downloads from a public URL/id; Foundry exports `.json` files; Roll20 needs a manual export or an API key) mean that designing `fetchRaw(id)` today would land on the wrong interface. The seam will be designed when the second platform is actually implemented, based on how it delivers its data.
- `src/sources/dndbeyond/` is merely a placement convention ("platforms go here"), not a committed interface.
- A future architecture review **should not** re-propose the unified `Character` without re-reading this ADR first.

## Update (seam built — 2nd platform: Nivel20)

The second platform turned out to be **Nivel20**, not Roll20/Foundry. A correction to
the premise above: **Nivel20 is also downloaded from a public URL/JSON** (just like
D&D Beyond), so `fetchRaw(idOrUrl)` by URL **is** the right interface after all — it
was not a wrong guess. With two concrete adapters the seam became real and was built:

- Source shape `{ platform, matches, fetchRaw, normalize }`, one folder per platform
  under `src/sources/<platform>/`.
- Registry + `resolveSource(input, { platform })` in `src/sources/index.mjs`: detects
  from the URL, or from an explicit `--source`, or falls back to the default
  (dndbeyond) for a bare id.
- The Sink groups by platform: `<cwd>/<platform>/<slug>/`.

The core decision **stands**: every Source normalizes independently; the registry only
dispatches and does **not** impose a unified `Character`. The outputs converge in shape
naturally (both are D&D 5e), with no forced contract.

If a 3rd platform is NOT downloaded from a URL (e.g. Foundry from a file), `fetchRaw`
can also accept a path or an object without breaking the existing ones.
