// Pure core: turns a Nivel20 Raw payload into a normalized Character.
//
// Nivel20 hands over almost everything precomputed (AC, skills, saving throws,
// mods), so here we mostly MAP instead of calculating. The output shape parallels
// the D&D Beyond Source (natural convergence, since both are D&D 5e), but it is
// NOT an imposed shared contract (see docs/adr/0001).
//
// Pure and deterministic: no fetching, no filesystem, `fetchedAt` is injected.

// Nivel20 ability slugs (Spanish) -> standard English keys.
const ABILITY = { fue: "str", des: "dex", con: "con", int: "int", sab: "wis", car: "cha" };

// Nivel20 skill slugs (Spanish) -> standard English slugs.
const SKILL = {
  acrobacias: "acrobatics", arcanos: "arcana", atletismo: "athletics",
  enganar: "deception", historia: "history", interpretacion: "performance",
  intimidar: "intimidation", investigacion: "investigation",
  juego_de_manos: "sleight-of-hand", medicina: "medicine", naturaleza: "nature",
  percepcion: "perception", perspicacia: "insight", persuasion: "persuasion",
  religion: "religion", sigilo: "stealth", supervivencia: "survival",
  trato_con_animales: "animal-handling",
};

const isProf = (p) => p === "proficient" || p === "expertise";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Normalizes Nivel20 line breaks (\r\n) and trims. null -> null.
const clean = (text) => {
  if (text == null) return null;
  return String(text).replace(/\r\n/g, "\n").trim();
};

// Nivel20 bulleted text ("* " or "- ") -> clean array.
function splitBullets(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[*-]\s*/, "").trim())
    .filter(Boolean);
}

// "Oathbreaker (mazo de guerra)" -> { name: "Oathbreaker", type: "Mazo de guerra" }.
function splitParenType(name) {
  const m = String(name ?? "").match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), type: cap(m[2].trim()) };
  return { name: String(name ?? "").trim(), type: null };
}

function normalizeAbilities(ph) {
  const out = {};
  const map = ph.ability || {};
  for (const [es, en] of Object.entries(ABILITY)) {
    const a = map[es];
    if (!a) continue;
    const st = a.saving_throw || {};
    out[en] = {
      score: a.total,
      modifier: a.mod,
      breakdown: {
        base: a.base,
        increments: a.increments,
        bgIncrements: a.bg_increments,
        bonus: a.bonus,
        raceBonus: a.race_bonus,
      },
      save: { proficient: isProf(st.proficiency), bonus: st.total, proficiency: st.proficiency },
    };
  }
  return out;
}

function normalizeSavingThrows(ph) {
  const out = {};
  const map = ph.saving_throw || {};
  for (const [es, en] of Object.entries(ABILITY)) {
    const st = map[es];
    if (!st) continue;
    out[en] = { proficient: isProf(st.proficiency), bonus: st.total, proficiency: st.proficiency };
  }
  return out;
}

function normalizeSkills(ph) {
  const out = {};
  const map = ph.skill || {};
  for (const [es, sk] of Object.entries(map)) {
    const en = SKILL[es] || es;
    out[en] = {
      ability: ABILITY[sk.ability] || sk.ability,
      proficient: isProf(sk.proficiency),
      expertise: sk.proficiency === "expertise",
      bonus: sk.total,
      ranks: sk.ranks,
      proficiency: sk.proficiency,
    };
  }
  return out;
}

function normalizeClasses(ph) {
  return (ph.professions || []).map((p) => ({
    name: p.name,
    level: p.level,
    archetype: p.archetype_name || null,
    hitDie: p.hit_points_dice ? `d${p.hit_points_dice}` : null,
    features: (p.feats || []).map((f) => ({
      name: f.name,
      summary: f.summary,
      description: f.description,
      category: f.category_name,
    })),
    description: p.description,
    definition: p,
  }));
}

function normalizeFeats(ph) {
  const out = [];
  for (const f of ph.race_feats || []) out.push({ name: f.name, description: f.description, source: "race", definition: f });
  for (const f of ph.custom_feats || []) out.push({ name: f.name, summary: f.summary, description: f.description, source: "custom", definition: f });
  for (const f of ph.other_feats || []) out.push({ name: f.name, description: f.description, source: "other", definition: f });
  for (const f of ph.unlocked_feats || []) out.push({ name: f.name, description: f.description, source: "unlocked", definition: f });
  return out;
}

function normalizeInventory(ph) {
  const items = ph.items || {};
  const out = [];
  const push = (list, category) => {
    for (const it of list || []) {
      const { name, type } = splitParenType(it.name);
      out.push({
        name,
        type, // type pulled from the parentheses: "Mazo de guerra", "Escudo"...
        fullName: it.name,
        category,
        group: it.group,
        slot: it.slot,
        equippable: it.equippable,
        location: it.location,
        equipped: it.location === "equipped",
        description: it.description,
        definition: it,
      });
    }
  };
  push(items.armas, "Armas");
  push(items.armaduras, "Armaduras");
  push(items.equipo_de_aventuras, "Equipo de aventuras");
  return out;
}

// Attacks: carry to-hit roll, damage, range, versatile, tags. Richer than `items`.
function normalizeAttacks(ph) {
  return (ph.attacks || []).map((a) => {
    const { name, type } = splitParenType(a.name);
    const atk = a.attack || {};
    const dmg = atk.damage || {};
    return {
      name,
      type,
      group: a.group,
      equipped: a.location === "equipped",
      proficient: !!a.proficient,
      range: atk.range || null,
      target: atk.target || null,
      toHit: atk.to_hit ? atk.to_hit.value : null,
      damage: dmg.value
        ? { value: dmg.value, dice: dmg.dice, bonus: dmg.bonus, type: dmg.type }
        : null,
      versatile: (a.fields || {}).versatil || null,
      tags: a.tags || [],
      description: a.description,
      definition: a,
    };
  });
}

// Protections: equipped armor/shields with the AC value they contribute.
function normalizeProtections(ph) {
  return (ph.protections || []).map((p) => {
    const { name, type } = splitParenType(p.name);
    return {
      name,
      type: type || p.group,
      group: p.group,
      equipped: p.location === "equipped",
      acValue: (p.armor || {}).value || null,
      tags: p.tags || [],
      description: p.description,
      definition: p,
    };
  });
}

// Background personality: bullets -> arrays (converges with D&D Beyond's `traits`).
function normalizePersonality(ph) {
  const bg = ph.background || {};
  return {
    traits: splitBullets(bg.traits),
    ideals: splitBullets(bg.ideals),
    bonds: splitBullets(bg.bonds),
    flaws: splitBullets(bg.flaws),
  };
}

function splitLanguages(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeCharacter(raw, { fetchedAt = null } = {}) {
  const ph = raw.printable_hash || raw;
  const info = ph.info || {};
  const fields = ph.fields || {};
  const armor = ph.armor || {};

  const skills = normalizeSkills(ph);

  const out = {
    meta: {
      id: info.id,
      name: info.name,
      player: info.player,
      status: info.status,
      imageUrl: info.image_url,
      readonlyUrl: info.id ? `https://nivel20.com/games/dnd-5/characters/${info.id}` : null,
      source: "nivel20",
      fetchedAt,
    },

    identity: {
      race: info.race || info.subrace_name || info.race_name || null,
      background: (ph.background || {}).name || null,
      alignment: fields.alineamiento || null,
      level: info.level,
      levelDesc: info.level_desc,
      experience: fields.puntos_de_experiencia ?? null,
      size: info.size,
      campaign: info.campaign,
    },

    physical: {
      age: fields.edad ?? null,
      appearance: clean(fields.apariencia),
    },

    abilities: normalizeAbilities(ph),
    proficiencyBonus: info.proficiency_bonus,
    savingThrows: normalizeSavingThrows(ph),
    skills,
    passiveScores: {
      // Nivel20 does not compute passive perception (fields.perception.total is
      // usually 0); we derive it: 10 + the Perception skill's total modifier.
      perception: (fields.perception || {}).total || (10 + (skills.perception?.bonus ?? 0)),
    },
    combat: {
      hitPoints: { max: info.hit_points },
      armorClass: armor.normal ?? null,
      armorDetail: armor,
      initiative: (ph.initiative || {}).total ?? null,
      speed: info.speed,
      speedDetail: ph.speed,
    },

    proficiencies: ph.proficiencies || {},
    languages: splitLanguages(fields.idiomas),

    // --- content ---
    classes: normalizeClasses(ph),
    race: { name: info.race, baseRace: info.race_name, subrace: info.subrace_name, definition: { race: ph.race, subrace: ph.subrace } },
    background: ph.background || {},
    feats: normalizeFeats(ph),
    inventory: normalizeInventory(ph),
    equipmentText: splitBullets(ph.equipment),
    actions: ph.actions || [],
    attacks: normalizeAttacks(ph),
    protections: normalizeProtections(ph),
    spellcasting: {
      isCaster: !!info.spell_caster,
      spellBooks: ph.spell_books,
      spellModifiers: ph.spell_modifiers,
      multiclass: ph.multiclass,
      spellSave: fields.spell_save,
      spellAttack: fields.spell_attack,
    },

    // --- roleplay / notes ---
    personality: normalizePersonality(ph),
    notes: {
      history: clean(fields.historia),
      historyParagraphs: (fields.historia || "").split(/\r?\n\r?\n+/).map((p) => p.trim()).filter(Boolean),
      notes: clean(fields.notas),
      notesList: splitBullets(fields.notas),
    },
    fields,

    resources: ph.resources || {},
    tags: ph.tags || [],
    selectionOptions: ph.selection_options || [],
  };

  // --- safety net: any printable_hash key not mapped above ---
  const HANDLED = new Set([
    "info", "fields", "armor", "ability", "abilities", "saving_throw", "saving_throws",
    "skill", "skills", "initiative", "speed", "proficiency", "proficiencies",
    "professions", "race", "subrace", "race_feats", "custom_feats", "other_feats",
    "unlocked_feats", "feats", "background", "items", "equipment", "actions",
    "attacks", "protections", "spell_books", "spell_modifiers", "multiclass",
    "resources", "tags", "tag_ids", "originals", "selection_options",
  ]);
  const unmapped = {};
  for (const k of Object.keys(ph)) if (!HANDLED.has(k)) unmapped[k] = ph[k];
  if (Object.keys(unmapped).length) out._unmapped = unmapped;

  return out;
}
