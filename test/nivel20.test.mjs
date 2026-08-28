// Tests for the Nivel20 Source + the multi-platform resolver. No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { normalizeCharacter } from "../src/sources/nivel20/normalize.mjs";
import { getCharacter, resolveSource, SOURCES } from "../src/index.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/harbek.nivel20.raw.json", import.meta.url));
const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));

const fakeFetch = (body, { ok = true, status = 200 } = {}) =>
  async () => ({ ok, status, json: async () => body });

test("nivel20: normalizeCharacter is pure and deterministic", () => {
  const a = normalizeCharacter(raw, { fetchedAt: "FIXED" });
  const b = normalizeCharacter(raw, { fetchedAt: "FIXED" });
  assert.deepEqual(a, b);
  assert.equal(a.meta.fetchedAt, "FIXED");
  assert.equal(a.meta.source, "nivel20");
});

test("nivel20: maps and translates the precomputed data", () => {
  const c = normalizeCharacter(raw);
  assert.equal(c.meta.name, "Harbek Ironforge");
  assert.equal(c.identity.level, 1);
  assert.equal(c.proficiencyBonus, 2);
  // CON: 15 base + 2 from race = 17.
  assert.equal(c.abilities.con.score, 17);
  assert.equal(c.abilities.con.modifier, 3);
  // AC precomputed by Nivel20 (chain mail + shield).
  assert.equal(c.combat.armorClass, 18);
  // Skills translated from Spanish into English slugs.
  const profSkills = Object.entries(c.skills).filter(([, v]) => v.proficient).map(([k]) => k).sort();
  assert.deepEqual(profSkills, ["animal-handling", "insight", "persuasion"]);
  assert.deepEqual(c.languages, ["común", "enano"]);
  assert.equal(c._unmapped, undefined); // everything mapped
});

test("nivel20: extracts attacks with damage and to-hit roll", () => {
  const c = normalizeCharacter(raw);
  const oath = c.attacks.find((a) => a.name === "Oathbreaker");
  assert.ok(oath, "the Oathbreaker attack must exist");
  assert.equal(oath.type, "Mazo de guerra"); // splitParenType
  assert.equal(oath.toHit, 4);
  assert.equal(oath.damage.value, "1d8 +4");
  assert.equal(oath.damage.type, "Contundente");
  assert.equal(oath.versatile, "1d10");
  assert.equal(oath.proficient, true);
});

test("nivel20: splits inventory name and type (splitParenType)", () => {
  const c = normalizeCharacter(raw);
  const item = c.inventory.find((i) => i.name === "Stonewall");
  assert.ok(item);
  assert.equal(item.type, "Escudo");
  assert.equal(item.fullName, "Stonewall (escudo)");
});

test("nivel20: background personality as bullet arrays", () => {
  const c = normalizeCharacter(raw);
  assert.ok(Array.isArray(c.personality.ideals));
  assert.ok(c.personality.ideals.length > 0);
  assert.ok(c.personality.traits.length > 0);
  // The "* " bullets were stripped.
  assert.ok(c.personality.ideals.every((s) => !s.startsWith("*")));
});

test("nivel20: derives passive perception (Nivel20 does not compute it)", () => {
  const c = normalizeCharacter(raw);
  // fields.perception.total arrives as 0; it must derive 10 + Perception mod (+2) = 12.
  assert.equal(c.passiveScores.perception, 12);
});

test("resolveSource detects the platform from the URL", () => {
  assert.equal(resolveSource("https://nivel20.com/games/dnd-5/characters/2087153.json").platform, "nivel20");
  assert.equal(resolveSource("https://www.dndbeyond.com/characters/166147623").platform, "dndbeyond");
});

test("resolveSource: a bare id falls back to the default (dndbeyond)", () => {
  assert.equal(resolveSource("2087153").platform, "dndbeyond");
});

test("resolveSource: an explicit --source wins", () => {
  assert.equal(resolveSource("2087153", { platform: "nivel20" }).platform, "nivel20");
});

test("resolveSource: an unknown source throws", () => {
  assert.throws(() => resolveSource("x", { platform: "roll20" }), /Unknown Source/);
});

test("getCharacter resolves Nivel20 and returns the platform", async () => {
  const { character, platform } = await getCharacter(
    "https://nivel20.com/games/dnd-5/characters/2087153.json",
    { fetch: fakeFetch(raw), fetchedAt: "FIXED" }
  );
  assert.equal(platform, "nivel20");
  assert.equal(character.meta.name, "Harbek Ironforge");
  assert.equal(character.meta.source, "nivel20");
});

test("exactly 2 sources are registered", () => {
  assert.deepEqual(SOURCES.map((s) => s.platform).sort(), ["dndbeyond", "nivel20"]);
});
