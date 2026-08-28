# dnd-character-dl

Download a D&D character and normalize it into a complete, usable JSON. No
dependencies (Node.js 18+). Works as a **CLI** and as a **library**.

**Supported platforms:**

| Platform | Detection | Output folder |
|---|---|---|
| [D&D Beyond](https://www.dndbeyond.com) | a `dndbeyond.com` URL, or a bare id (default) | `dndbeyond/<name>/` |
| [Nivel20](https://nivel20.com) | a `nivel20.com` URL, or `--source nivel20` | `nivel20/<name>/` |

> These use each platform's public JSON endpoints. The character must be public.
> Each platform normalizes independently (see `docs/adr/0001`); the outputs converge
> in shape naturally, since both are D&D 5e — no contract is imposed.

## Installation

```bash
npm install dnd-character-dl
# or without installing, via npx:
npx dnd-character-dl <id-or-url>
```

## CLI usage

```bash
# D&D Beyond
dnd-character-dl 166147623
dnd-character-dl https://www.dndbeyond.com/characters/166147623

# Nivel20
dnd-character-dl https://nivel20.com/games/dnd-5/characters/2087153-harbek-ironforge.json
dnd-character-dl 2087153 --source nivel20

# Custom output folder
dnd-character-dl 166147623 --out ./my-characters
```

It writes two files to `<out|cwd>/<platform>/<name>/`:

- `raw.json` — the complete, untouched API response.
- `character.json` — the normalized character (nothing is dropped).

## Library usage

```js
import { getCharacter, saveCharacter } from "dnd-character-dl";

// Download + normalize in one call (the platform is detected from the URL):
const { raw, character, platform } = await getCharacter(
  "https://nivel20.com/games/dnd-5/characters/2087153.json"
);
console.log(platform, character.meta.name, character.combat.hitPoints.max);

// Or force the platform for a bare id:
const ddb = await getCharacter("166147623", { platform: "dndbeyond" });

// Persist (grouped by platform: ./nivel20/<slug>/, ./dndbeyond/<slug>/):
await saveCharacter({ raw, character, platform }, {});
```

### API

| Function | Description |
|---|---|
| `getCharacter(idOrUrl, { platform?, fetch?, fetchedAt? })` | Resolves the platform, downloads + normalizes. Returns `{ raw, character, platform }`. |
| `resolveSource(idOrUrl, { platform? })` | Returns the Source (`{ platform, matches, fetchRaw, normalize }`) for an input. |
| `saveCharacter({ raw, character, platform }, { dir?, slug? })` | Writes both JSON files to `<dir \| cwd/platform>/<slug>/`. |
| `normalizeCharacter(raw, { fetchedAt? })` | The **pure** D&D Beyond core. (Every Source has its own under `src/sources/<platform>/`.) |
| `fetchRawCharacter(idOrUrl, { fetch? })` | Downloads only the D&D Beyond Raw payload. `fetch` is injectable. |
| `SOURCES` | The list of registered Sources. |

`normalizeCharacter` is pure and deterministic: it does no fetching, never touches the
filesystem and never calls `new Date()` — `fetchedAt` is injected. It is the package's
test surface.

## What `character.json` contains

It normalizes **everything** the API returns. Main sections: `meta`, `identity`,
`physical`, `abilities` (with breakdown and saving throws), `proficiencyBonus`,
`savingThrows`, `skills`, `passiveScores`, `combat` (HP, AC, initiative, speeds),
`proficiencies`, `languages`, `senses`, `defenses`, `classes`, `race`, `background`,
`feats`, `inventory`, `currencies`, `actions`, `spellcasting`, `traits`, `notes`,
`modifiers` (flat list + index by type), `options`, `choices`, `campaign`, and more.

Each section also keeps the API's full `definition`, so no nested data is lost. If the
API adds an unmapped key, it shows up under `_unmapped`.

> **Note:** `combat.armorClass` is an **estimate** (equipped armor, or 10 + DEX, plus
> `armor-class` modifiers). It does not cover every special case; verify it against the
> official sheet if you need exactness. The data to recompute it is kept intact in
> `inventory` and `modifiers`.

## Development

```bash
node --test     # runs the suite (no network, uses fixtures)
```
