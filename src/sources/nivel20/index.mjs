// Nivel20 Source: pairs its fetch with its normalizer.
// Source shape: { platform, matches, fetchRaw, normalize }.

import { fetchRawCharacter } from "./fetch.mjs";
import { normalizeCharacter } from "./normalize.mjs";

export const source = {
  platform: "nivel20",
  matches: (input) => /nivel20\.com/i.test(String(input ?? "")),
  fetchRaw: (input, opts) => fetchRawCharacter(input, opts),
  normalize: (raw, opts) => normalizeCharacter(raw, opts),
};
