# dnd-character-dl

Download a D&D character and normalize it into a complete, usable JSON. No dependencies (Node.js 24+). Works as a **CLI** and as a **library**.

## Supported Platforms

| Platform | Detection | Output folder |
|---|---|---|
| [D&D Beyond](https://www.dndbeyond.com) | a `dndbeyond.com` URL, or a bare id (default) | `dndbeyond/<name>/` |
| [Nivel20](https://nivel20.com) | a `nivel20.com` URL, or `--source nivel20` | `nivel20/<name>/` |

> These use each platform's public JSON endpoints. The character must be public.
> Each platform normalizes independently; the outputs converge in shape naturally, since both are D&D 5e.

## Installation

This package is published to **GitHub Packages**, not to the public npm registry.
Point the `@abr4xas` scope at GitHub's registry in your project's `.npmrc`:

```ini
@abr4xas:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` must be a personal access token with the `read:packages` scope.
GitHub Packages requires authentication even for public packages. Then:

```bash
pnpm add @abr4xas/dnd-character-dl
```

## CLI Usage

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

## Library Usage

```js
import { getCharacter, saveCharacter } from "@abr4xas/dnd-character-dl";

// Download + normalize in one call (the platform is detected from the URL):
const { raw, character, platform } = await getCharacter(
  "https://nivel20.com/games/dnd-5/characters/2087153.json"
);

// Or save directly to disk:
await saveCharacter("166147623", { out: "./characters" });
```

## API

### `getCharacter(urlOrId, options?)`

Downloads and normalizes a character.

**Parameters:**
- `urlOrId` (string) - A full URL or a bare character ID
- `options` (object, optional)
  - `source` (string) - Force a platform: `"dndbeyond"` or `"nivel20"`
  - `out` (string) - Output folder (default: cwd)

**Returns:** `Promise<{ raw: object, character: object, platform: string }>`

### `saveCharacter(urlOrId, options?)`

Downloads, normalizes, and saves to disk.

**Parameters:** Same as `getCharacter`.

**Returns:** `Promise<{ path: string, platform: string }>`

## Development

```bash
pnpm install
pnpm test
```

## License

MIT
