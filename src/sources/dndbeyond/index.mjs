// D&D Beyond Source: pairs its fetch with its normalizer.
// Source shape: { platform, matches, fetchRaw, normalize }.

import { fetchRawCharacter } from "./fetch.mjs";
import { normalizeCharacter } from "./normalize.mjs";

export const source = {
  platform: "dndbeyond",
  // Recognizes dndbeyond URLs. A bare id does not match (it falls back to the default).
  matches: (input) => /dndbeyond\.com/i.test(String(input ?? "")),
  fetchRaw: (input, opts) => fetchRawCharacter(input, opts),
  normalize: (raw, opts) => normalizeCharacter(raw, opts),
};
