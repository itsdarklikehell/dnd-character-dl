// Exercises the package seams without touching the network or depending on order:
//  - the core (normalizeCharacter) is pure and deterministic,
//  - the Source (fetchRawCharacter) accepts an injected fetch,
//  - getCharacter composes Source + core,
//  - the Sink (saveCharacter) writes into a caller-controlled dir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeCharacter,
  fetchRawCharacter,
  getCharacter,
  saveCharacter,
  parseCharacterId,
  CharacterFetchError,
} from "../src/index.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/kaelor.raw.json", import.meta.url));
const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));

// A fake fetch that returns the API envelope wrapping the fixture.
function fakeFetch(body, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, json: async () => body });
}

test("normalizeCharacter is pure and deterministic", () => {
  const a = normalizeCharacter(raw, { fetchedAt: "FIXED" });
  const b = normalizeCharacter(raw, { fetchedAt: "FIXED" });
  assert.deepEqual(a, b);
  assert.equal(a.meta.fetchedAt, "FIXED");
});

test("normalizeCharacter never calls new Date(): fetchedAt defaults to null", () => {
  assert.equal(normalizeCharacter(raw).meta.fetchedAt, null);
});

test("normalizeCharacter computes D&D rules", () => {
  const c = normalizeCharacter(raw);
  assert.equal(c.meta.name, "Kaelor");
  assert.equal(c.identity.level, 3);
  assert.equal(c.proficiencyBonus, 2);
  assert.equal(c.abilities.str.score, 16);
  assert.equal(c.abilities.str.modifier, 3);
  assert.equal(c.savingThrows.str.proficient, true);
  assert.deepEqual(c.senses, ["Darkvision 60"]);
});

test("parseCharacterId accepts an id and a url", () => {
  assert.equal(parseCharacterId("166147623"), "166147623");
  assert.equal(parseCharacterId("https://www.dndbeyond.com/characters/166147623"), "166147623");
  assert.equal(parseCharacterId("nope"), null);
});

test("fetchRawCharacter uses the injected fetch (no network)", async () => {
  const data = await fetchRawCharacter("166147623", {
    fetch: fakeFetch({ success: true, data: raw }),
  });
  assert.equal(data.name, "Kaelor");
});

test("fetchRawCharacter throws CharacterFetchError on a non-ok HTTP response", async () => {
  await assert.rejects(
    () => fetchRawCharacter("166147623", { fetch: fakeFetch({}, { ok: false, status: 404 }) }),
    (e) => e instanceof CharacterFetchError && e.status === 404
  );
});

test("getCharacter composes Source + core", async () => {
  const { raw: r, character } = await getCharacter("166147623", {
    fetch: fakeFetch({ success: true, data: raw }),
    fetchedAt: "FIXED",
  });
  assert.equal(r.name, "Kaelor");
  assert.equal(character.meta.fetchedAt, "FIXED");
  assert.equal(character.meta.name, "Kaelor");
});

test("saveCharacter writes into the caller-provided dir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ddb-test-"));
  try {
    const character = normalizeCharacter(raw, { fetchedAt: "FIXED" });
    const { dir: outDir, slug, files } = await saveCharacter({ raw, character }, { dir });
    assert.equal(slug, "kaelor");
    assert.equal(files.length, 2);
    const written = JSON.parse(await readFile(join(outDir, "character.json"), "utf8"));
    assert.equal(written.meta.name, "Kaelor");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
