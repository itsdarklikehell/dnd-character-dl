// Sink: persists a Character (and its Raw payload) to the filesystem.
//
// The target directory is the caller's choice. By default output is grouped by
// platform: <cwd>/<platform>/<name-slug>/.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Turns a name into a folder-safe slug: "Kaelor" -> "kaelor".
export function slugify(name) {
  return (name || "character")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "character";
}

// Base directory per platform: <cwd>/<platform>.
export function baseDirFor(platform) {
  return join(process.cwd(), platform || "dndbeyond");
}

// Writes raw.json + character.json into <dir>/<slug>/.
//
// @param {object} result
// @param {object} result.raw        Raw payload straight from the API.
// @param {object} result.character  Normalized Character.
// @param {string} [result.platform] Source platform (defines the folder).
// @param {object} [opts]
// @param {string} [opts.dir]   Base directory (default: <cwd>/<platform>).
// @param {string} [opts.slug]  Explicit slug (default: derived from the name).
// @returns {Promise<{dir: string, files: string[], slug: string}>}
export async function saveCharacter(result, { dir, slug } = {}) {
  const { raw, character, platform } = result;
  const baseDir = dir || baseDirFor(platform);
  const finalSlug = slug || slugify(character?.meta?.name ?? raw?.name);
  const targetDir = join(baseDir, finalSlug);

  await mkdir(targetDir, { recursive: true });
  const rawPath = join(targetDir, "raw.json");
  const charPath = join(targetDir, "character.json");
  await writeFile(rawPath, JSON.stringify(raw, null, 2));
  await writeFile(charPath, JSON.stringify(character, null, 2));

  return { dir: targetDir, slug: finalSlug, files: [rawPath, charPath] };
}
