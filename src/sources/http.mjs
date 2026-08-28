// HTTP helpers shared by the Sources. Imposes no Character shape: it only
// downloads JSON and reports errors uniformly.

// Typed error, so a Source failure can be told apart from any other.
export class CharacterFetchError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "CharacterFetchError";
    this.status = status ?? null;
  }
}

// Extracts the numeric id from a bare id or from a URL.
export function parseCharacterId(input) {
  if (input == null) return null;
  const m = String(input).match(/(\d{4,})/);
  return m ? m[1] : null;
}

// Downloads a URL and returns its JSON. `fetch` is injected to test without network.
export async function fetchJson(url, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) {
    throw new CharacterFetchError(
      `The API responded HTTP ${res.status} for ${url}. Is the character public?`,
      { status: res.status }
    );
  }
  return res.json();
}
