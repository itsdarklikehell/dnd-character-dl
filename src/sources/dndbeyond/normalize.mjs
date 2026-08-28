// Pure core: turns a D&D Beyond Raw payload into a normalized Character.
//
// This is the only "deep" part of the project: it concentrates the D&D rules
// (stats, AC, skills, saving throws, proficiencies...). It is fully pure and
// deterministic:
//   - it does no fetching and never touches the filesystem,
//   - it never calls new Date() — `fetchedAt` is INJECTED.
//
// This interface is the test surface: hand it a raw payload and a fetchedAt,
// then assert on the Character it returns.

// ---------------------------------------------------------------------------
// Reference tables
// ---------------------------------------------------------------------------
export const STAT_NAMES = { 1: "str", 2: "dex", 3: "con", 4: "int", 5: "wis", 6: "cha" };
export const STAT_SUBTYPE = {
  "strength-score": 1, "dexterity-score": 2, "constitution-score": 3,
  "intelligence-score": 4, "wisdom-score": 5, "charisma-score": 6,
};
export const ALIGNMENTS = {
  1: "Lawful Good", 2: "Neutral Good", 3: "Chaotic Good",
  4: "Lawful Neutral", 5: "True Neutral", 6: "Chaotic Neutral",
  7: "Lawful Evil", 8: "Neutral Evil", 9: "Chaotic Evil",
};
// Ability backing each skill (keyed by its subType in the modifiers).
export const SKILLS = {
  acrobatics: "dex", "animal-handling": "wis", arcana: "int", athletics: "str",
  deception: "cha", history: "int", insight: "wis", intimidation: "cha",
  investigation: "int", medicine: "wis", nature: "int", perception: "wis",
  performance: "cha", persuasion: "cha", religion: "int",
  "sleight-of-hand": "dex", stealth: "dex", survival: "wis",
};
export const SAVE_SUBTYPE = {
  str: "strength-saving-throws", dex: "dexterity-saving-throws",
  con: "constitution-saving-throws", int: "intelligence-saving-throws",
  wis: "wisdom-saving-throws", cha: "charisma-saving-throws",
};

const mod = (score) => Math.floor((score - 10) / 2);
const proficiencyBonus = (level) => 2 + Math.floor((level - 1) / 4);

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------
// Flattens every modifier while keeping its source (race, class, feat, ...).
function flattenModifiers(data) {
  const groups = data.modifiers || {};
  const out = [];
  for (const [source, list] of Object.entries(groups)) {
    for (const m of list || []) out.push({ source, ...m });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Derived calculations
// ---------------------------------------------------------------------------
function computeStats(data, mods) {
  // Raw breakdown per ability id (keeps the API arrays untouched).
  const bd = {};
  for (const id of Object.keys(STAT_NAMES)) bd[id] = { base: 10, override: null, bonus: 0, fromModifiers: 0 };
  for (const s of data.stats || []) if (bd[s.id]) bd[s.id].base = s.value ?? 10;
  for (const s of data.overrideStats || []) if (bd[s.id] && s.value != null) bd[s.id].override = s.value;
  for (const s of data.bonusStats || []) if (bd[s.id] && s.value != null) bd[s.id].bonus += s.value;
  for (const m of mods) {
    if (m.type === "bonus" && STAT_SUBTYPE[m.subType] != null && m.value != null) {
      bd[STAT_SUBTYPE[m.subType]].fromModifiers += m.value;
    }
  }

  const out = {};
  for (const [id, name] of Object.entries(STAT_NAMES)) {
    const b = bd[id];
    const score = b.override != null ? b.override : b.base + b.bonus + b.fromModifiers;
    out[name] = {
      score,
      modifier: mod(score),
      breakdown: { base: b.base, override: b.override, bonusStat: b.bonus, fromModifiers: b.fromModifiers },
    };
  }
  return out;
}

function hasProficiency(mods, subType, type = "proficiency") {
  return mods.some((m) => m.type === type && m.subType === subType);
}

function computeSavingThrows(stats, mods, pb) {
  const out = {};
  for (const [ability, sub] of Object.entries(SAVE_SUBTYPE)) {
    const proficient = hasProficiency(mods, sub);
    out[ability] = {
      proficient,
      bonus: stats[ability].modifier + (proficient ? pb : 0),
    };
  }
  return out;
}

function computeSkills(stats, mods, pb) {
  const out = {};
  for (const [skill, ability] of Object.entries(SKILLS)) {
    const proficient = hasProficiency(mods, skill);
    const expertise = hasProficiency(mods, skill, "expertise");
    const mult = expertise ? 2 : proficient ? 1 : 0;
    out[skill] = {
      ability,
      proficient,
      expertise,
      bonus: stats[ability].modifier + mult * pb,
    };
  }
  return out;
}

function totalLevel(data) {
  return (data.classes || []).reduce((sum, c) => sum + (c.level || 0), 0);
}

function computeHitPoints(data, conMod, level) {
  if (data.overrideHitPoints != null) {
    const max = data.overrideHitPoints;
    return { max, current: max - (data.removedHitPoints || 0), temporary: data.temporaryHitPoints || 0, override: true };
  }
  const max = (data.baseHitPoints || 0) + (data.bonusHitPoints || 0) + conMod * level;
  return {
    max,
    current: max - (data.removedHitPoints || 0),
    temporary: data.temporaryHitPoints || 0,
    removed: data.removedHitPoints || 0,
    base: data.baseHitPoints || 0,
    bonus: data.bonusHitPoints || 0,
    override: false,
  };
}

function computeArmorClass(data, stats, mods) {
  const dexMod = stats.dex.modifier;
  let best = 10 + dexMod;
  let shield = 0;
  for (const item of data.inventory || []) {
    if (!item.equipped) continue;
    const def = item.definition || {};
    if (def.filterType !== "Armor" || def.armorClass == null) continue;
    let ac = def.armorClass;
    if (def.type === "Light Armor") ac += dexMod;
    else if (def.type === "Medium Armor") ac += Math.min(dexMod, 2);
    if (def.type === "Shield") shield += ac;
    else best = Math.max(best, ac);
  }
  best += shield;
  for (const m of mods) {
    if (m.type === "bonus" && m.subType === "armor-class" && m.value != null) best += m.value;
  }
  return best;
}

// Groups modifiers by type and extracts proficiencies / languages / senses / defenses.
function deriveFromModifiers(mods) {
  const byType = {};
  for (const m of mods) (byType[m.type] ||= []).push(m.friendlySubtypeName || m.subType);

  const names = (type) =>
    [...new Set(mods.filter((m) => m.type === type).map((m) => m.friendlySubtypeName || m.subType))];

  // Senses (darkvision, blindsight, ...) arrive as "set-base" with their range.
  const SENSE_SUBTYPES = new Set(["darkvision", "blindsight", "tremorsense", "truesight"]);
  const senses = mods
    .filter((m) => (m.type === "set-base" || m.type === "sense") && SENSE_SUBTYPES.has(m.subType))
    .map((m) => `${m.friendlySubtypeName || m.subType}${m.value ? " " + m.value : ""}`);

  return {
    languages: names("language"),
    senses: [...new Set(senses)],
    resistances: names("resistance"),
    immunities: names("immunity"),
    vulnerabilities: names("vulnerability"),
    proficiencies: {
      armor: mods.filter((m) => m.type === "proficiency" && /armor/i.test(m.subType)).map((m) => m.friendlySubtypeName),
      weapons: mods.filter((m) => m.type === "proficiency" && /weapon/i.test(m.subType)).map((m) => m.friendlySubtypeName),
      tools: mods.filter((m) => m.type === "proficiency" && /(tool|kit|instrument|supplies|vehicle|game)/i.test(m.subType)).map((m) => m.friendlySubtypeName),
      other: mods.filter((m) => m.type === "proficiency" && !/(armor|weapon|tool|kit|instrument|supplies|vehicle|game|saving-throws)/i.test(m.subType) && !SKILLS[m.subType]).map((m) => m.friendlySubtypeName),
    },
    byType, // full index: nothing is lost
  };
}

// ---------------------------------------------------------------------------
// Section normalizers (keep the full definition + add a summary)
// ---------------------------------------------------------------------------
function normalizeClasses(data) {
  return (data.classes || []).map((c) => ({
    name: (c.definition || {}).name,
    level: c.level,
    isStartingClass: c.isStartingClass,
    subclass: (c.subclassDefinition || {}).name || null,
    hitDie: (c.definition || {}).hitDice ? `d${c.definition.hitDice}` : null,
    hitDiceUsed: c.hitDiceUsed,
    features: (c.classFeatures || []).map((f) => ({
      name: (f.definition || {}).name,
      requiredLevel: (f.definition || {}).requiredLevel,
      description: (f.definition || {}).description,
      snippet: (f.definition || {}).snippet,
    })),
    definition: c.definition,
    subclassDefinition: c.subclassDefinition,
  }));
}

function normalizeRace(data) {
  const r = data.race || {};
  return {
    name: r.fullName || r.baseName || null,
    baseRace: r.baseRaceName,
    isSubRace: r.isSubRace,
    size: r.size,
    isLegacy: r.isLegacy,
    description: r.description,
    traits: (r.racialTraits || []).map((t) => ({
      name: (t.definition || {}).name,
      description: (t.definition || {}).description,
      snippet: (t.definition || {}).snippet,
    })),
    speeds: r.weightSpeeds,
    sources: r.sources,
    definition: r, // full race
  };
}

function normalizeBackground(data) {
  const b = data.background || {};
  const def = b.definition || {};
  return {
    name: def.name || null,
    hasCustom: b.hasCustomBackground,
    description: def.description,
    shortDescription: def.shortDescription,
    skillProficiencies: def.skillProficienciesDescription,
    toolProficiencies: def.toolProficienciesDescription,
    languages: def.languagesDescription,
    equipment: def.equipmentDescription,
    featureName: def.featureName,
    featureDescription: def.featureDescription,
    definition: def,
    customBackground: b.customBackground,
  };
}

function normalizeFeats(data) {
  return (data.feats || []).map((f) => {
    const def = f.definition || {};
    return {
      name: def.name,
      description: def.description,
      snippet: def.snippet,
      prerequisites: def.prerequisites,
      definition: def,
    };
  });
}

function normalizeInventory(data) {
  return (data.inventory || []).map((it) => {
    const def = it.definition || {};
    return {
      name: def.name,
      type: def.filterType || def.type || null,
      subType: def.subType,
      quantity: it.quantity ?? 1,
      equipped: !!it.equipped,
      isAttuned: !!it.isAttuned,
      magic: !!def.magic,
      rarity: def.rarity,
      weight: def.weight ?? null,
      cost: def.cost ?? null,
      armorClass: def.armorClass ?? null,
      damage: def.damage ?? null,
      damageType: def.damageType ?? null,
      properties: (def.properties || []).map((p) => p.name),
      description: def.description,
      snippet: def.snippet,
      chargesUsed: it.chargesUsed,
      definition: def, // full item
    };
  });
}

function normalizeActions(data) {
  const groups = data.actions || {};
  const out = [];
  for (const [source, list] of Object.entries(groups)) {
    for (const a of list || []) {
      out.push({
        source,
        name: a.name,
        actionType: a.actionType,
        description: a.description,
        snippet: a.snippet,
        attackTypeRange: a.attackTypeRange,
        dice: a.dice,
        damageTypeId: a.damageTypeId,
        range: a.range,
        activation: a.activation,
        limitedUse: a.limitedUse,
        isProficient: a.isProficient,
        raw: a,
      });
    }
  }
  for (const a of data.customActions || []) out.push({ source: "custom", ...a });
  return out;
}

function normalizeSpells(data) {
  const groups = data.spells || {};
  const out = [];
  for (const [source, list] of Object.entries(groups)) {
    for (const sp of list || []) {
      const def = sp.definition || {};
      out.push({
        name: def.name,
        level: def.level,
        school: def.school,
        ritual: def.ritual,
        concentration: def.concentration,
        castingTime: def.activation,
        range: def.range,
        components: def.components,
        description: def.description,
        source,
        prepared: !!sp.prepared,
        countsAsKnownSpell: sp.countsAsKnownSpell,
        definition: def,
      });
    }
  }
  out.sort((a, b) => (a.level - b.level) || String(a.name).localeCompare(String(b.name)));
  return out;
}

// ---------------------------------------------------------------------------
// Main normalizer — PURE. Includes EVERYTHING; nothing is dropped.
//
// @param {object} data   D&D Beyond Raw payload (the envelope's `data` object).
// @param {object} [opts]
// @param {string|null} [opts.fetchedAt]  Injected timestamp (ISO). If omitted it
//        stays null: the function never calls new Date() on its own.
// @returns {object} Normalized Character.
// ---------------------------------------------------------------------------
export function normalizeCharacter(data, { fetchedAt = null } = {}) {
  const mods = flattenModifiers(data);
  const stats = computeStats(data, mods);
  const level = totalLevel(data);
  const pb = proficiencyBonus(level);
  const derived = deriveFromModifiers(mods);
  const skills = computeSkills(stats, mods, pb);

  // Abilities with their saving throw folded in.
  const saves = computeSavingThrows(stats, mods, pb);
  const abilities = {};
  for (const ability of Object.keys(stats)) {
    abilities[ability] = { ...stats[ability], save: saves[ability] };
  }

  const out = {
    // --- meta ---
    meta: {
      id: data.id,
      name: data.name,
      socialName: data.socialName,
      username: data.username,
      userId: data.userId,
      readonlyUrl: data.readonlyUrl,
      status: data.status,
      statusSlug: data.statusSlug,
      canEdit: data.canEdit,
      isAssignedToPlayer: data.isAssignedToPlayer,
      providedFrom: data.providedFrom,
      dateModified: data.dateModified,
      source: "dndbeyond",
      fetchedAt,
    },

    // --- identity ---
    identity: {
      race: normalizeRace(data).name,
      background: ((data.background || {}).definition || {}).name || null,
      alignment: ALIGNMENTS[data.alignmentId] || null,
      alignmentId: data.alignmentId,
      level,
      experience: data.currentXp ?? 0,
      adjustmentXp: data.adjustmentXp,
      faith: data.faith,
      lifestyleId: data.lifestyleId,
      lifestyle: data.lifestyle,
    },

    physical: {
      age: data.age, gender: data.gender, eyes: data.eyes, hair: data.hair,
      skin: data.skin, height: data.height, weight: data.weight,
    },

    // --- combat mechanics ---
    abilities,
    proficiencyBonus: pb,
    savingThrows: saves,
    skills,
    passiveScores: {
      perception: 10 + skills.perception.bonus,
      investigation: 10 + skills.investigation.bonus,
      insight: 10 + skills.insight.bonus,
    },
    combat: {
      hitPoints: computeHitPoints(data, stats.con.modifier, level),
      armorClass: computeArmorClass(data, stats, mods), // estimate (see README)
      initiative: stats.dex.modifier,
      speeds: (data.race || {}).weightSpeeds || null,
      deathSaves: data.deathSaves,
      conditions: data.conditions,
      inspiration: !!data.inspiration,
    },

    proficiencies: derived.proficiencies,
    languages: derived.languages,
    senses: derived.senses,
    defenses: {
      resistances: derived.resistances,
      immunities: derived.immunities,
      vulnerabilities: derived.vulnerabilities,
    },

    // --- content ---
    classes: normalizeClasses(data),
    race: normalizeRace(data),
    background: normalizeBackground(data),
    feats: normalizeFeats(data),
    inventory: normalizeInventory(data),
    currencies: data.currencies || {},
    actions: normalizeActions(data),
    spellcasting: {
      spells: normalizeSpells(data),
      classSpells: data.classSpells,
      spellSlots: data.spellSlots,
      pactMagic: data.pactMagic,
    },

    // --- roleplay / notes ---
    traits: data.traits || {},
    notes: data.notes || {},

    // --- modifiers (full index + flat list) ---
    modifiers: { flat: mods, byType: derived.byType },

    // --- options, choices and homebrew ---
    options: data.options,
    choices: data.choices,
    optionalClassFeatures: data.optionalClassFeatures,
    optionalOrigins: data.optionalOrigins,
    characterValues: data.characterValues,
    custom: {
      items: data.customItems,
      actions: data.customActions,
      proficiencies: data.customProficiencies,
      senses: data.customSenses,
      speeds: data.customSpeeds,
      defenseAdjustments: data.customDefenseAdjustments,
    },
    creatures: data.creatures,

    // --- context ---
    campaign: data.campaign,
    campaignSetting: data.campaignSetting,
    decorations: data.decorations,
    preferences: data.preferences,
    configuration: data.configuration,
    activeSourceCategories: data.activeSourceCategories,
  };

  // --- safety net: any API key not mapped above ---
  const HANDLED = new Set([
    "id", "name", "socialName", "username", "userId", "readonlyUrl", "status",
    "statusSlug", "canEdit", "isAssignedToPlayer", "providedFrom", "dateModified",
    "alignmentId", "currentXp", "adjustmentXp", "faith", "lifestyleId", "lifestyle",
    "age", "gender", "eyes", "hair", "skin", "height", "weight",
    "stats", "bonusStats", "overrideStats",
    "baseHitPoints", "bonusHitPoints", "overrideHitPoints", "removedHitPoints", "temporaryHitPoints",
    "deathSaves", "conditions", "inspiration",
    "classes", "race", "raceDefinitionId", "raceDefinitionTypeId", "background",
    "feats", "features", "inventory", "currencies", "actions", "customActions",
    "spells", "classSpells", "spellSlots", "pactMagic",
    "traits", "notes", "modifiers",
    "options", "choices", "optionalClassFeatures", "optionalOrigins",
    "characterValues", "customItems", "customProficiencies", "customSenses",
    "customSpeeds", "customDefenseAdjustments", "creatures",
    "campaign", "campaignSetting", "decorations", "preferences", "configuration",
    "activeSourceCategories",
  ]);
  const unmapped = {};
  for (const k of Object.keys(data)) if (!HANDLED.has(k)) unmapped[k] = data[k];
  if (Object.keys(unmapped).length) out._unmapped = unmapped;

  return out;
}
