#!/usr/bin/env node
// CLI shell: orchestrates Source (fetch) + core (normalize) + Sink (save).
// Holds no game rules and no persistence logic: it only orchestrates and reports.
//
// Usage:
//   dnd-character-dl <id | url> [--source <platform>] [--out <dir>]
//   dnd-character-dl https://www.dndbeyond.com/characters/166147623
//   dnd-character-dl https://nivel20.com/games/dnd-5/characters/2087153-harbek-ironforge.json
//   dnd-character-dl 2087153 --source nivel20
//
// Platforms: dndbeyond (default for a bare id), nivel20.
// Saves to <out|cwd>/<platform>/<character-name>/{raw,character}.json

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getCharacter, saveCharacter, CharacterFetchError, SOURCES } from "../src/index.mjs";

function parseArgs(argv) {
  const args = { input: null, out: undefined, platform: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" || a === "-o") args.out = argv[++i];
    else if (a === "--source" || a === "-s") args.platform = argv[++i];
    else if (!args.input) args.input = a;
  }
  return args;
}

export async function run(argv = process.argv.slice(2)) {
  const { input, out, platform } = parseArgs(argv);
  if (!input) {
    const plats = SOURCES.map((s) => s.platform).join(" | ");
    console.error(`Usage: dnd-character-dl <id | url> [--source <${plats}>] [--out <dir>]`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await getCharacter(input, { platform });
    console.log(`→ Downloaded from ${result.platform}...`);
    const { dir, slug } = await saveCharacter(result, { dir: out });

    const { character } = result;
    const cls = (character.classes || []).map((c) => `${c.name} ${c.level}`).join(" / ");
    console.log(`✓ ${character.meta.name} — ${character.race?.name ?? character.identity?.race ?? ""} ${cls}`);
    console.log(
      `  HP ${character.combat?.hitPoints?.max} · AC ~${character.combat?.armorClass}` +
        ` · Level ${character.identity?.level} · PB +${character.proficiencyBonus}`
    );
    if (character._unmapped) {
      console.log(`  ⚠ new API keys under _unmapped: ${Object.keys(character._unmapped).join(", ")}`);
    }
    console.log(`  Saved to: ${dir}/`);
  } catch (err) {
    if (err instanceof CharacterFetchError) console.error(`✗ ${err.message}`);
    else console.error("✗ Unexpected error:", err.message);
    process.exitCode = 1;
  }
}

// Self-executes only when this file is the entrypoint (not when imported).
const isMain =
  process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();
