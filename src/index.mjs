// Public API of the package.
//
// Multi-platform: every Source (D&D Beyond, Nivel20…) brings its own fetch +
// normalize and produces its own shape (see docs/adr/0001). getCharacter resolves
// the Source from the URL or from the `platform` option.
//
// Convenience:  getCharacter(idOrUrl, { platform, fetch }) -> { raw, character, platform }
// Sink:         saveCharacter({ raw, character, platform }, { dir })

export { SOURCES, DEFAULT_SOURCE, resolveSource } from "./sources/index.mjs";
export { CharacterFetchError, parseCharacterId } from "./sources/http.mjs";
export { saveCharacter, slugify, baseDirFor } from "./save.mjs";

// Re-exports from the D&D Beyond Source (compatibility / direct access to the core).
export { normalizeCharacter } from "./sources/dndbeyond/normalize.mjs";
export { fetchRawCharacter } from "./sources/dndbeyond/fetch.mjs";

import { resolveSource } from "./sources/index.mjs";

// Fetches and normalizes a character in a single call.
//
// @param {string|number} idOrUrl  Character ID or URL.
// @param {object} [opts]
// @param {string} [opts.platform]   Forces the Source ("dndbeyond" | "nivel20").
// @param {typeof fetch} [opts.fetch] fetch implementation (injectable).
// @param {string} [opts.fetchedAt]  Timestamp to inject (default: now, ISO).
// @returns {Promise<{raw: object, character: object, platform: string}>}
export async function getCharacter(idOrUrl, { platform, fetch, fetchedAt } = {}) {
  const src = resolveSource(idOrUrl, { platform });
  const raw = await src.fetchRaw(idOrUrl, { fetch });
  const stamp = fetchedAt ?? new Date().toISOString();
  const character = src.normalize(raw, { fetchedAt: stamp });
  return { raw, character, platform: src.platform };
}
