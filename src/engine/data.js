// @ts-check
// Every number and fixed value the Feed Chart and usage math use. Nothing here is
// computed at run time except values the current pages also derive (noted inline).
// Sources for each value live in ./sources.js; tests/engine.test.ts holds the
// approval snapshot.

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/** @typedef {"3part" | "cplus"} LineId */
/** @typedef {"partA" | "partB" | "bloom"} Role */
/** @typedef {"Veg" | "Stretch" | "Stack" | "Swell" | "Ripen"} Phase */
/** @typedef {"mL/gal" | "injection %" | "ratio" | "mL/L" | "g/gal" | "g/L"} FeedUnit */
/** @typedef {Record<Role, number>} RoleValues */

const GRAMS_PER_POUND = 454;
const MILLILITERS_PER_GALLON = 3785;
const LITERS_PER_GALLON = 3.785;

const PHOSZYME_EC_PER_GRAM = 0.220;
const PHOSZYME_DIRECT_G_PER_GAL = 0.4;

// 3-Part 2-doser Tank 2 charge per 50 gal (Tank 1 is the 3-2-2 Part A tank).
const THREE_PART_TWO_DOSER_TANK_GAL = 50;
const THREE_PART_TWO_DOSER_BLOOM_LB = 50;
const THREE_PART_TWO_DOSER_PART_B_LB = 28;

const COMMERCIAL_SCHEDULE = { Veg: "Veg", Stretch: "Stack", Stack: "Swell", Swell: "Swell", Ripen: "Ripen" };
const SWELL_FLOWER_SCHEDULE = { Veg: "Veg", Stretch: "Swell", Stack: "Swell", Swell: "Swell", Ripen: "Swell" };

export const DATA = deepFreeze({
  units: {
    gramsPerPound: GRAMS_PER_POUND,
    millilitersPerGallon: MILLILITERS_PER_GALLON,
    litersPerGallon: LITERS_PER_GALLON,
  },

  feedUnits: {
    stock: ["mL/gal", "injection %", "ratio", "mL/L"],
    direct: ["g/gal", "g/L"],
    metric: ["g/L", "mL/L"],
    defaultStock: "mL/gal",
    defaultDirect: "g/gal",
    // Display decimals per unit; "ratio" displays as 1:N with N = round(100 / injection %).
    decimals: { "mL/gal": 0, "mL/L": 1, "g/gal": 1, "g/L": 1, "injection %": 2 },
    // Conversion from g/gal of final feed at a 1 lb/gal stock. Derived exactly as the pages do.
    factors: {
      "g/gal": 1,
      "mL/gal": MILLILITERS_PER_GALLON / GRAMS_PER_POUND,
      "injection %": 100 / GRAMS_PER_POUND,
      ratio: null,
      "g/L": 1 / LITERS_PER_GALLON,
      "mL/L": (MILLILITERS_PER_GALLON / GRAMS_PER_POUND) / LITERS_PER_GALLON,
    },
  },

  phoszyme: {
    ecPerGram: PHOSZYME_EC_PER_GRAM,
    directGramsPerGallon: PHOSZYME_DIRECT_G_PER_GAL,
    stockCarrierRatio: 0.10,
    // Derived as the pages do: Number((0.4 * 0.220).toFixed(3)).
    directEc: Number((PHOSZYME_DIRECT_G_PER_GAL * PHOSZYME_EC_PER_GRAM).toFixed(3)),
    directDecimals: { "g/gal": 1, "g/L": 3 },
  },

  phases: ["Veg", "Stretch", "Stack", "Swell", "Ripen"],
  phaseLabels: {
    print: ["Veg / Moms", "Week 1–2", "Week 3–5", "Week 6–8/9", "Final 1–2 Wks"],
    summary: ["Veg / Moms", "Wk 1–2", "Wk 3–5", "Wk 6–8/9", "Final 1–2 Wks"],
  },

  // Keyed by phase. Both feed pages use the same presets for both lines.
  ecPresets: {
    high: { Veg: 3.0, Stretch: 3.0, Stack: 2.7, Swell: 2.4, Ripen: 1.8 },
    standard: { Veg: 2.6, Stretch: 2.4, Stack: 2.2, Swell: 2.0, Ripen: 1.4 },
  },
  defaultEcPreset: "high",
  customEc: { minExclusive: 0, max: 10, step: 0.1, displayDecimals: 1 },

  // Dripper pH ceiling per chart column: the modeled 22 °C calcium-phosphate (brushite)
  // limit for the column's recipe at its EC, limit = c0 + c1·x + c2·x² with x = log10(EC),
  // rounded to the nearest 0.1 and held within [floor, cap]. Below a recipe's fit floor
  // `lo` the limit is above the cap. A column whose unrounded limit is under `atLineBelow`
  // carries the at-the-line note.
  dripperPh: {
    floor: 5.5,
    cap: 6.0,
    decimals: 1,
    atLineBelow: 5.55,
    // Lines warmer than this run the low end of the range.
    warmLineC: 25,
    warmLineF: 77,
  },

  recipeSchedules: {
    defaultSchedule: "commercial",
    retired: ["standard", "stack-flower"],
    options: {
      commercial: { label: "Commercial (Stack → Swell)", selectable: true },
      "swell-flower": { label: "Swell Through Flower", selectable: true },
      custom: { label: "Custom", printLabel: "Custom Recipe Schedule", selectable: false },
      "locked-swell": { label: "Swell Recipe Locked", selectable: false, lockedOnly: true },
    },
  },

  // Stock validation dilution. Metric is not the same dilution as US (1:80 vs ~1:75.7);
  // each prints the validation EC for its own sample.
  validation: {
    us: { sampleMl: 250, waterGal: 5 },
    metric: { sampleMl: 250, waterL: 20 },
    displayDecimals: 2,
  },

  lines: {
    "3part": {
      label: "3-Part",
      productsByRole: { partA: "Part A", partB: "Part B", bloom: "Bloom" },
      stockNames: { partA: "A", partB: "B", bloom: "Bloom" },
      fullNames: { partA: "Part A", partB: "Part B", bloom: "Bloom" },
      phzComboLabel: "B + PhosZyme",
      twoDoserComboLabel: "B + Bloom",
      twoDoserComboPhzLabel: "B + Bloom + PhosZyme",
      ecPerGram: { partA: 0.306, partB: 0.255, bloom: 0.204 },
      recipes: {
        Veg: { partA: 0.6428571428571, partB: 0.3571428571429, bloom: 0 },
        Stretch: { partA: 0.55, partB: 0.29, bloom: 0.16 },
        Stack: { partA: 0.5, partB: 0.2777778, bloom: 0.2222222 },
        Swell: { partA: 0.441, partB: 0.234, bloom: 0.325 },
        Ripen: { partA: 0.35, partB: 0.30, bloom: 0.35 },
      },
      recipeNames: ["Veg", "Stretch", "Stack", "Swell", "Ripen"],
      schedules: { commercial: COMMERCIAL_SCHEDULE, "swell-flower": SWELL_FLOWER_SCHEDULE },
      defaultMethod: "3-2-2",
      methods: ["4-3-3", "3-2-2", "1-1-1"],
      stockMethods: {
        "4-3-3": { rates: { partA: 1.87, partB: 1.25, bloom: 1.25 }, tankVolumes: { tankA: 53.5, tankB: 60 } },
        "3-2-2": { rates: { partA: 1.50, partB: 1.00, bloom: 1.00 }, tankVolumes: { tankA: 50, tankB: 50 } },
        "1-1-1": { rates: { partA: 1.00, partB: 1.00, bloom: 1.00 }, tankVolumes: { tankA: 50, tankB: 50 } },
        "2-doser": {
          rates: {
            partA: 1.50,
            partB: THREE_PART_TWO_DOSER_PART_B_LB / THREE_PART_TWO_DOSER_TANK_GAL,
            bloom: THREE_PART_TWO_DOSER_BLOOM_LB / THREE_PART_TWO_DOSER_TANK_GAL,
          },
          tankVolumes: { tankA: THREE_PART_TWO_DOSER_TANK_GAL, tankB: THREE_PART_TWO_DOSER_TANK_GAL },
        },
      },
      twoDoser: {
        recipe: "Swell",
        tankGal: THREE_PART_TWO_DOSER_TANK_GAL,
        bloomLb: THREE_PART_TWO_DOSER_BLOOM_LB,
        partBLb: THREE_PART_TWO_DOSER_PART_B_LB,
        tank2VolumeFactor: 1.0,
      },
      // 2-doser tank size (and team-mode custom tank size). 3-doser methods use fixed volumes.
      stockTankVolume: { defaultGal: 50, minGal: 10, maxGal: 100000, decimals: 1 },
      // Team mode only (feed-calc-admin.html).
      customStock: {
        maxLbPerGal: { partA: 3, partB: 2, bloom: 2 },
        minLbPerGal: 0.1,
        defaultLbs: { partA: 75, partB: 50, bloom: 50 },
        lbDecimals: 1,
        rateDecimals: 3,
        labelDecimals: 2,
      },
      // Keyed by recipe.
      phCeilingFit: {
        Veg: { lo: 2.3, c: [7.2754554135017475, -2.821564782902578, 0.9055741934386606] },
        Stretch: { lo: 1.5, c: [6.7563304679419725, -2.3289980543769833, 0.6124490176655443] },
        Stack: { lo: 1.4, c: [6.689279781888666, -2.2837510566099475, 0.5899482694086496] },
        Swell: { lo: 1.3, c: [6.617828481237748, -2.2407948693743553, 0.5712834147678515] },
        Ripen: { lo: 1.4, c: [6.715615284238963, -2.3255474802579412, 0.6366971708160895] },
      },
    },

    cplus: {
      label: "Component Plus",
      productsByRole: { partA: "CaNO3", partB: "C+", bloom: "MKP" },
      stockNames: { partA: "CaNO3", partB: "C+", bloom: "MKP" },
      fullNames: { partA: "Calcium Nitrate", partB: "Component Plus", bloom: "MKP" },
      phzComboLabel: "C+ + PhosZyme",
      twoDoserComboLabel: "C+ + MKP",
      twoDoserComboPhzLabel: "C+ + MKP + PhosZyme",
      ecPerGram: { partA: 0.317, partB: 0.283, bloom: 0.195 },
      recipes: {
        Veg: { partA: 0.60, partB: 0.40, bloom: 0 },
        Stack: { partA: 0.496, partB: 0.32, bloom: 0.184 },
        Swell: { partA: 0.3684, partB: 0.3294, bloom: 0.3022 },
        Ripen: { partA: 0.315, partB: 0.30, bloom: 0.385 },
      },
      recipeNames: ["Veg", "Stack", "Swell", "Ripen"],
      schedules: { commercial: COMMERCIAL_SCHEDULE, "swell-flower": SWELL_FLOWER_SCHEDULE },
      defaultMethod: "1-1-1",
      methods: ["1-1-1"],
      stockMethods: {
        "1-1-1": { rates: { partA: 1.00, partB: 1.00, bloom: 1.00 } },
        "2-doser": { rates: { partA: 0.75, partB: 0.75, bloom: 1.00 } },
      },
      twoDoser: {
        recipe: "Swell",
        caStockOptions: [0.75, 1.00],
        defaultCaStock: 0.75,
        finalPhaseOptions: ["swell", "near-ripen"],
        defaultFinalPhase: "swell",
        nearRipenCaEcShare: 0.315,
      },
      // Applies to every C+ stock tank, 3-doser and 2-doser.
      stockTankVolume: { defaultGal: 50, minGal: 10, maxGal: 100000, decimals: 1 },
      // Team mode only, 3 dosers. MKP stops at 1.333 lb/gal, near its room-temperature solubility.
      customStock: {
        maxLbPerGal: { partA: 2, partB: 2, bloom: 1.333 },
        minLbPerGal: 0.1,
        defaultLbs: { partA: 50, partB: 50, bloom: 50 },
        lbDecimals: 1,
        rateDecimals: 3,
        labelDecimals: 2,
      },
      // Keyed by recipe.
      phCeilingFit: {
        Veg: { lo: 1.8, c: [7.0009713130620606, -2.5680272736835663, 0.7809889063496724] },
        Stack: { lo: 1.1, c: [6.405986120360533, -2.0952469890808003, 0.473432462845578] },
        Swell: { lo: 1.0, c: [6.369377076383701, -2.0998578582025647, 0.5002124440639382] },
        Ripen: { lo: 1.0, c: [6.357212616177188, -2.102221064814537, 0.5080831498384406] },
      },
    },
  },

  // Supplement rates as the feed pages print them. Metric values are hand-rounded
  // literals on the pages, not conversions, except pH Up (converted, 2 decimals).
  supplements: {
    si: {
      foliarMlPerGal: [0.5, 2],
      foliarMlPerL: [0.13, 0.53],
    },
    phUp: {
      maxGPerGal: [0.2, 0.25],
      highStrengthFlowerStopGPerGal: [0.15, 0.2],
      metricDecimals: 2,
      incrementGPerGal: 0.05,
      waitMinutes: [5, 15],
    },
    bioflo: {
      heavyMlPerGal: 30,
      heavyMlPerL: 8,
      maintenanceMlPerGal: 15,
      maintenanceMlPerL: 4,
      soakHours: [8, 24],
      maintenanceEveryWeeks: [1, 2],
    },
    triologic: {
      weeklyMlPerGal: 1,
      weeklyMlPerL: 0.25,
      // Up to 2 mL/gal is fine, for example at transplant.
      maxMlPerGal: 2,
      maxMlPerL: 0.5,
    },
  },

  // Numbers that appear only in instructions, notes, and help text on the feed pages.
  reference: {
    stockFillPercentBeforeProduct: 50,
    stockAddProductMinutes: 5,
    stockMixAfterTopOffMinutes: 10,
    dtrFillPercent: 90,
    dtrAgitateMinutes: [3, 5],
    reservoirUseWithinDays: [5, 7],
    typicalFeedEc: [2.0, 3.0],
    cplusStockUseWithinDays: 14,
    sterileReservoirCalHypoGPer100Gal: 1.2,
    sterileReservoirCalHypoPpm: 2,
    threePartTank2EmptiesFasterApprox: 1.7,
    injectorBandPercent: [0.2, 2.0],
  },

  // pH Up (K2CO3). Dose to pH 5.9 on RO water = k·EC^n g/gal per recipe, [k, n].
  // Other targets scale the 5.9 dose by one multiplier per target (linear between
  // points, clamped to the ends). Source alkalinity credits 1 g/gal per 190 ppm CaCO3.
  phUp: {
    curves: {
      "3part": {
        Veg: [0.018323, 1.28918],
        Stretch: [0.040147, 1.29133],
        Stack: [0.048763, 1.28618],
        Swell: [0.061424, 1.27704],
        Ripen: [0.067746, 1.27110],
      },
      cplus: {
        Veg: [0.024306, 1.29953],
        Stack: [0.065128, 1.29144],
        Swell: [0.090494, 1.27285],
        Ripen: [0.104776, 1.26103],
      },
    },
    fitEc: [1.0, 3.5],
    targetMultiplier: [[5.5, 0.42], [5.6, 0.53], [5.7, 0.66], [5.8, 0.81], [5.9, 1.00], [6.0, 1.22]],
    // Default target: the column's printed ceiling minus 0.1, never above 5.9 or below 5.5.
    defaultTargetMax: 5.9,
    targetBelowCeiling: 0.1,
    // Warm lines: the ceiling is taken from the limit minus this offset.
    warmLimitOffset: 0.08,
    maxGPerGal: 0.25,
    alkPpmPerGPerGal: 190,
    // Stock concentrations, g of pH Up per gal of stock.
    stockPresets: { mz2: 20, mz3000: 100 },
    customStock: { defaultGPerGal: 50, min: 1, max: 200 },
    defaultReservoirGal: 100,
    doseDecimals: 3,
  },

  // pH Down (70% phosphoric acid). mL of acid per gal of water per ppm of alkalinity
  // (as CaCO3) neutralized: (ppm / 50) × 98 / 1068.2 × 3.785, where 50 = eq wt CaCO3,
  // 98 = MW H3PO4 (one proton), 1068.2 = mg H3PO4 per mL of 70% acid (density 1.526).
  phDown: {
    mlPerGalPerPpm: 0.006946,
    defaultStartPpm: 140,
    defaultTargetPpm: 20,
    vegTargetPpm: 15,
    defaultVolumeGal: 1,
    reviewAbovePpm: 20,
    referencePpm: [20, 40, 60, 80, 100, 120, 150, 200, 250, 300],
  },

  // Usage estimate for one cycle, column by column on the customer's feed schedule.
  // Prices are inputs (an optional untracked prices.json), never stored here.
  usage: {
    triologicMlPerTreatedGal: 1,
    siFoliarMlPerGal: 2,
    bagRoundUpDecimals: 1,
    productDefaults: {
      "3part": {
        "Part A": { unitSize: 25, unitType: "lbs" },
        "Part B": { unitSize: 25, unitType: "lbs" },
        Bloom: { unitSize: 25, unitType: "lbs" },
      },
      cplus: {
        CaNO3: { unitSize: 50, unitType: "lbs" },
        "C+": { unitSize: 25, unitType: "lbs" },
        MKP: { unitSize: 50, unitType: "lbs" },
      },
    },
    additiveDefaults: [
      { name: "PhosZyme", unitSize: 25, unitType: "lbs" },
      { name: "pH Up", unitSize: 25, unitType: "lbs" },
      { name: "Triologic", unitSize: 1, unitType: "gal" },
      { name: "Si", unitSize: 1, unitType: "gal" },
    ],
    defaults: {
      vegWeeks: 2,
      vegGalPerWeek: 1000,
      // Flower weeks per chart column: Wk 1–2, Wk 3–5, Wk 6–8/9, Final.
      flowerWeeks: { Stretch: 2, Stack: 3, Swell: 3, Ripen: 1 },
      flowerGalPerWeek: 10000,
      cyclesPerYear: 5,
    },
  },
});

/**
 * @param {LineId} lineId
 */
export function getLine(lineId) {
  const line = DATA.lines[lineId];
  if (!line) throw new Error(`Unknown FRA nutrition line: ${lineId}`);
  return line;
}
