// Source registry. Every Source is independent (see docs/adr/0001): it brings its
// own fetch + normalize and produces its own shape. This registry only dispatches;
// it does NOT impose a shared Character contract.

import { source as dndbeyond } from "./dndbeyond/index.mjs";
import { source as nivel20 } from "./nivel20/index.mjs";

export const SOURCES = [dndbeyond, nivel20];

// The Source used when the input is a bare id (no URL, no --source).
export const DEFAULT_SOURCE = dndbeyond;

// Resolves the Source for a given input.
//  - an explicit `platform` (from --source) wins.
//  - otherwise it is detected from the URL.
//  - if nothing matches (e.g. a bare id), the default is used.
export function resolveSource(input, { platform } = {}) {
  if (platform) {
    const s = SOURCES.find((x) => x.platform === platform);
    if (!s) {
      throw new Error(
        `Unknown Source: "${platform}". Options: ${SOURCES.map((x) => x.platform).join(", ")}`
      );
    }
    return s;
  }
  return SOURCES.find((x) => x.matches(input)) || DEFAULT_SOURCE;
}
