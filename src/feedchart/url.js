// @ts-check
// Feed Chart share-link codec. Links keep the parameter names of the pre-rebuild pages,
// so every link already sent to a customer (feed-calc, cplus-calc, feed-calc-admin,
// including hidden options such as ?m=4-3-3) opens the same chart.
//
//   a=direct   d=2   m=<method>   tv=<gal>   ca=<lb/gal>   fp=near-ripen   phz=yes
//   u=<unit>   p=standard|custom   ec_<phase>=<EC>   rs=<schedule>   rp_<phase>=<recipe>
//   pa/pb/pbl=<lb> (team mode, both lines)   phup=yes   bf=yes   tri=yes   fac=<name>   lang=es
//   t=light|dark (read by shared/theme.js)
// `si` is retired and ignored.
import { DATA, getLine, formatStockTankVolume } from "../engine/index.js";

/** @typedef {import("../engine/data.js").LineId} LineId */
/** @typedef {import("../engine/data.js").Phase} Phase */
/** @typedef {import("../engine/settings.js").FeedSettings} FeedSettings */

/**
 * @typedef {object} Extras
 * @property {string} facility
 * @property {{ phup: boolean, bf: boolean, tri: boolean }} show
 */

/**
 * @typedef {object} PageMode
 * @property {LineId} line
 * @property {"customer" | "team"} mode
 */

const PHASES = /** @type {Phase[]} */ ([...DATA.phases]);
const ALL_UNITS = [...DATA.feedUnits.stock, ...DATA.feedUnits.direct];

/** @param {PageMode} page */
function validMethods(page) {
  const line = getLine(page.line);
  if (page.mode === "team") return [...line.methods, "custom"];
  return page.line === "3part" ? [...line.methods] : [];
}

/**
 * Settings input (for resolveFeedSettings) and page extras from a query string.
 * @param {URLSearchParams} p
 * @param {PageMode} page
 * @returns {{ input: Partial<FeedSettings> & { line: LineId }, extras: Extras }}
 */
export function decodeParams(p, page) {
  const line = getLine(page.line);
  /** @type {Partial<FeedSettings> & { line: LineId }} */
  const input = { line: page.line };

  const a = p.get("a");
  input.application = a === "direct" ? "direct" : "stock";

  const m = p.get("m");
  if (m && validMethods(page).includes(m)) input.method = m;

  const d = p.get("d");
  const dosersApply = page.line === "3part" || input.application === "stock";
  if (dosersApply && (d === "2" || d === "3")) input.doserCount = d === "2" ? 2 : 3;
  const twoDoser = input.doserCount === 2;

  if (p.has("tv")) input.stockTankVolumeGal = Number(p.get("tv"));
  if (page.line === "cplus" && twoDoser) {
    if (p.has("ca")) input.cplusCaStockLbPerGal = Number(p.get("ca"));
    if (p.has("fp")) input.cplusFinalPhase = /** @type {any} */ (p.get("fp"));
  }
  if (page.mode === "team") {
    const defaults = line.customStock.defaultLbs;
    input.customLbs = {
      partA: p.has("pa") ? Number(p.get("pa")) : defaults.partA,
      partB: p.has("pb") ? Number(p.get("pb")) : defaults.partB,
      bloom: p.has("pbl") ? Number(p.get("pbl")) : defaults.bloom,
    };
  }

  input.usePhoszyme = p.get("phz") === "yes";

  const u = p.get("u");
  if (u && ALL_UNITS.includes(u)) input.unit = /** @type {any} */ (u);

  const preset = p.get("p");
  if (preset === "high" || preset === "standard" || preset === "custom") {
    input.ecPreset = preset;
    if (preset === "custom") {
      /** @type {Record<string, number>} */
      const targetEc = { ...DATA.ecPresets.high };
      PHASES.forEach(phase => {
        const value = parseFloat(p.get(`ec_${phase.toLowerCase()}`) ?? "");
        if (value > DATA.customEc.minExclusive && value <= DATA.customEc.max) targetEc[phase] = value;
      });
      input.targetEc = /** @type {any} */ (targetEc);
    }
  }

  if (!twoDoser) {
    const schedules = /** @type {Record<string, Record<Phase, string>>} */ (line.schedules);
    const rs = p.get("rs") ?? "";
    const retired = page.line === "3part" && /** @type {readonly string[]} */ (DATA.recipeSchedules.retired).includes(rs);
    const recipes = /** @type {readonly string[]} */ (line.recipeNames);
    const fallback = schedules[DATA.recipeSchedules.defaultSchedule];
    // Old pages wrote rs=custom and skipped any phase whose recipe matched the phase name.
    const phaseRecipe = rs === "custom"
      ? /** @type {Record<Phase, string>} */ (Object.fromEntries(PHASES.map(phase => [phase, recipes.includes(phase) ? phase : fallback[phase]])))
      : { ...(schedules[rs] ?? fallback) };
    if (!retired) {
      PHASES.forEach(phase => {
        const recipe = p.get(`rp_${phase.toLowerCase()}`);
        if (recipe && recipes.includes(recipe)) phaseRecipe[phase] = recipe;
      });
    }
    input.recipeSchedule = "custom";
    input.phaseRecipe = phaseRecipe;
  }

  return {
    input,
    extras: {
      facility: (p.get("fac") ?? "").trim(),
      show: { phup: p.get("phup") === "yes", bf: p.get("bf") === "yes", tri: p.get("tri") === "yes" },
    },
  };
}

/**
 * Query parameters for a chart, writing only what differs from the defaults.
 * @param {FeedSettings} s
 * @param {Extras & { lang: string, mode: "customer" | "team" }} extras
 */
export function encodeParams(s, extras) {
  const p = new URLSearchParams();
  const line = getLine(s.line);
  if (extras.lang !== "en") p.set("lang", extras.lang);
  if (extras.facility) p.set("fac", extras.facility);
  if (s.application !== "stock") p.set("a", s.application);
  const defaultTank = line.stockTankVolume.defaultGal;
  const tankParam = () => {
    if (s.stockTankVolumeGal !== defaultTank) p.set("tv", formatStockTankVolume(s.line, s.stockTankVolumeGal));
  };
  if (s.application === "stock") {
    if (s.doserCount === 2) {
      p.set("d", "2");
      if (s.line === "3part") tankParam();
      if (s.line === "cplus") {
        if (s.cplusCaStockLbPerGal !== DATA.lines.cplus.twoDoser.defaultCaStock) p.set("ca", String(s.cplusCaStockLbPerGal));
        if (s.cplusFinalPhase !== DATA.lines.cplus.twoDoser.defaultFinalPhase) p.set("fp", s.cplusFinalPhase);
      }
    } else if (s.method !== line.defaultMethod) {
      p.set("m", s.method);
      if (s.method === "custom") {
        p.set("pa", String(s.customLbs.partA));
        p.set("pb", String(s.customLbs.partB));
        p.set("pbl", String(s.customLbs.bloom));
        tankParam();
      }
    }
    if (s.line === "cplus") tankParam();
  }
  if (s.usePhoszyme) p.set("phz", "yes");
  if (extras.show.phup) p.set("phup", "yes");
  if (extras.show.bf) p.set("bf", "yes");
  if (extras.show.tri) p.set("tri", "yes");
  const defaultUnit = s.application === "stock" ? DATA.feedUnits.defaultStock : DATA.feedUnits.defaultDirect;
  if (s.unit !== defaultUnit) p.set("u", s.unit);
  if (s.ecPreset !== DATA.defaultEcPreset) p.set("p", s.ecPreset);
  if (s.ecPreset === "custom") PHASES.forEach(phase => p.set(`ec_${phase.toLowerCase()}`, String(s.targetEc[phase])));
  if (s.doserCount !== 2 && s.recipeSchedule !== DATA.recipeSchedules.defaultSchedule) {
    if (s.recipeSchedule === "custom") {
      const base = /** @type {Record<string, Record<Phase, string>>} */ (line.schedules)[DATA.recipeSchedules.defaultSchedule];
      PHASES.forEach(phase => {
        if (s.phaseRecipe[phase] !== base[phase]) p.set(`rp_${phase.toLowerCase()}`, s.phaseRecipe[phase]);
      });
    } else {
      p.set("rs", s.recipeSchedule);
    }
  }
  return p;
}
