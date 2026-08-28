// D&D Beyond Source: fetches the Raw payload of a character.
//
// Isolates the unofficial endpoint, the { success, message, data } envelope and
// the failure modes. `fetch` is injected so this can be tested without network.

import { fetchJson, parseCharacterId, CharacterFetchError } from "../http.mjs";

export { parseCharacterId, CharacterFetchError };

// Unofficial but public JSON endpoint of D&D Beyond.
const ENDPOINT = (id) =>
  `https://character-service.dndbeyond.com/character/v5/character/${id}`;

// Fetches the Raw payload (the envelope's `data` object) of a character.
//
// @param {string|number} idOrUrl  Character ID or its dndbeyond URL.
// @param {object} [opts]
// @param {typeof fetch} [opts.fetch]  fetch implementation (injectable).
// @returns {Promise<object>} Raw payload ready for normalizeCharacter().
// @throws {CharacterFetchError} If the id is invalid, HTTP fails, or the API returns no data.
export async function fetchRawCharacter(idOrUrl, { fetch } = {}) {
  const id = parseCharacterId(idOrUrl);
  if (!id) throw new CharacterFetchError(`Invalid character ID: ${idOrUrl}`);

  const payload = await fetchJson(ENDPOINT(id), { fetch });
  if (!payload.success || !payload.data) {
    throw new CharacterFetchError(
      `The API responded with no data: ${payload.message || "unknown"}`
    );
  }
  return payload.data;
}
