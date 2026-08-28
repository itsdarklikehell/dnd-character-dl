// Nivel20 Source: fetches the Raw payload of a character.
//
// Nivel20 exposes a public JSON per URL. The numeric id is enough (the name slug
// in the URL is optional). `fetch` is injected to test without network.

import { fetchJson, parseCharacterId, CharacterFetchError } from "../http.mjs";

// Public Nivel20 endpoint (D&D 5e). The slug is optional: <id>.json is enough.
const ENDPOINT = (id) =>
  `https://nivel20.com/games/dnd-5/characters/${id}.json`;

// Fetches the full Raw payload (including the printable_hash wrapper).
//
// @param {string|number} idOrUrl  Character ID or its nivel20 URL.
// @param {object} [opts]
// @param {typeof fetch} [opts.fetch]  fetch implementation (injectable).
// @returns {Promise<object>} Raw payload ready for normalizeCharacter().
// @throws {CharacterFetchError} If the id is invalid, HTTP fails, or there is no data.
export async function fetchRawCharacter(idOrUrl, { fetch } = {}) {
  const id = parseCharacterId(idOrUrl);
  if (!id) throw new CharacterFetchError(`Invalid character ID: ${idOrUrl}`);

  const body = await fetchJson(ENDPOINT(id), { fetch });
  if (!body || !body.printable_hash) {
    throw new CharacterFetchError("The Nivel20 API responded without printable_hash.");
  }
  return body;
}
