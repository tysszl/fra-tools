// @ts-check
// Where each number in DATA comes from. Keys are dot paths into DATA; the longest
// matching prefix applies. Values name a section of FRA's internal standards
// (TS = technical-standards.md, FR = feed-recipes.md, ALK =
// alkalinity-ph-and-calcium-phosphate.md), "undocumented", or "differs from docs:
// audit N<n>" (the 2026-09-29 calculator number audit, Differences table).
// Where the current pages disagree with each other, the value is kept per line and
// the entry says "page-specific".

export const SOURCES = Object.freeze({
  "units": "FR § Calculation Procedure (454 g/lb, 3785 mL/gal, 3.785 L/gal field conversions)",
  "feedUnits.stock": "FR § Delivery methods › Stock concentrate (mL/gal, injection %, ratio, mL/L)",
  "feedUnits.direct": "FR § Delivery methods › DTR (g/gal, g/L)",
  "feedUnits.metric": "FR § Delivery methods",
  "feedUnits.defaultStock": "undocumented (page default)",
  "feedUnits.defaultDirect": "undocumented (page default)",
  "feedUnits.decimals": "undocumented (page display rounding)",
  "feedUnits.factors": "FR § Calculation Procedure › Stock concentrate mode (unit conversions)",

  "phoszyme.ecPerGram": "TS § EC Contributions; FR § PhosZyme Handling",
  "phoszyme.directGramsPerGallon": "TS § Product Usage › PhosZyme; FR § PhosZyme Handling › DTR setups",
  "phoszyme.stockCarrierRatio": "TS § Product Usage › PhosZyme (10% of carrier); FR § PhosZyme Handling › Stock concentrate setups",
  "phoszyme.directEc": "FR § PhosZyme Handling › EC scaling rule (0.088 = 0.4 × 0.220)",
  "phoszyme.directDecimals": "undocumented (page display rounding)",

  "phaseLabels": "TS § EC Ranges by Feed Chart Recipe (weeks); labels undocumented",
  "ecPresets": "TS § EC Ranges by Feed Chart Recipe; FR § 3-Part Line › Recipe EC targets",
  "defaultEcPreset": "undocumented (page default)",
  "customEc": "undocumented (page input limits)",
  "recipeSchedules": "FR § 3-Part Line › Recipe EC targets (commercial chart); Standard Progression retired 2026-09-29 (FR still lists it)",

  "validation.us": "TS § Stock Concentrate Methods (250 mL in 5 gal RO)",
  "validation.metric": "Tyler 2026-09-29 ruling N18 (250 mL of stock in 20 L RO; validation EC computed for that sample)",
  "validation.displayDecimals": "undocumented (page display rounding)",

  "lines.3part.label": "undocumented (page label)",
  "lines.3part.ecPerGram": "TS § EC Contributions; FR § 3-Part Line › Products & EC per gram per gallon",
  "lines.3part.recipes": "FR § 3-Part Line › Per-recipe EC contribution % by part",
  "lines.3part.schedules": "FR § 3-Part Line › Recipe EC targets (commercial chart; Swell default)",
  "lines.3part.defaultMethod": "TS § Stock Concentrate Methods (3-2-2 standard)",
  "lines.3part.stockMethods.4-3-3": "TS § Stock Concentrate Methods › Alternative methods; FR § 3-Part Line › Stock concentrate",
  "lines.3part.stockMethods.3-2-2": "TS § 3-2-2 method; FR § 3-Part Line › Stock concentrate",
  "lines.3part.stockMethods.1-1-1": "TS § Alternative methods; FR § 3-Part Line › Stock concentrate",
  "lines.3part.stockMethods.2-doser": "FR § 2-doser stock concentrate (3-Part); derived Tank 2 validation 2.08 / 2.15 with PhosZyme differs from TS 2.06 / 2.13: audit N2",
  "lines.3part.twoDoser": "FR § 2-doser stock concentrate (3-Part); TS § 3-Part 2-doser method (validation differs: audit N2)",
  "lines.3part.twoDoser.tank2VolumeFactor": "undocumented (both tanks the same size)",
  "lines.3part.stockTankVolume.minGal": "FR § 2-doser stock concentrate (3-Part); TS § 3-Part 2-doser method (10 gal minimum)",
  "lines.3part.stockTankVolume": "undocumented (page input limits; 50 gal default matches the 50 gal builds)",
  "lines.3part.customStock.maxLbPerGal": "TS § Stock Concentrate Methods › Custom stock ceiling (6-4-4 in 50 gal)",
  "lines.3part.customStock": "undocumented (team-mode defaults and rounding)",
  "lines.3part.phCeilingFit": "chemistry-model PHREEQC fit 2026-09-29, 22 °C RO brushite; rule approved Tyler 2026-09-29",

  "lines.cplus.label": "undocumented (page label)",
  "lines.cplus.ecPerGram": "FR § Component Plus Line › Products & EC per gram per gallon",
  "lines.cplus.recipes": "FR § Component Plus Line › Per-recipe EC contribution % by part",
  "lines.cplus.schedules": "FR § Component Plus Line (no Stretch recipe; Stack ratios at Stretch EC)",
  "lines.cplus.defaultMethod": "FR § Component Plus Line › Stock concentrate (1 lb/gal each)",
  "lines.cplus.stockMethods.1-1-1": "FR § Component Plus Line › Stock concentrate",
  "lines.cplus.stockMethods.2-doser": "FR § 2-doser stock concentrate (C+)",
  "lines.cplus.twoDoser": "FR § 2-doser stock concentrate (C+) (CaNO3 0.75 / 1.00; Near Ripen 31.5%)",
  "lines.cplus.stockTankVolume": "undocumented (page input limits)",
  "lines.cplus.stockTankVolume.minGal": "FR § 2-doser stock concentrate (C+): 10 gal minimum (Tyler 2026-09-29)",
  "lines.cplus.customStock.maxLbPerGal": "Tyler 2026-10-02 (team-mode C+ custom ceiling: CaNO3 2.0, C+ 2.0, MKP 1.333 lb/gal, MKP near room-temperature solubility); not yet in TS/FR",
  "lines.cplus.customStock": "undocumented (team-mode defaults 1 lb/gal in 50 gal, matching FR § Component Plus Line › Stock concentrate; rounding as 3-Part)",
  "lines.cplus.phCeilingFit": "chemistry-model PHREEQC fit 2026-09-29, 22 °C RO brushite; rule approved Tyler 2026-09-29",

  "supplements.si": "TS § Product Usage › Front Row Si (foliar 0.5-2 mL/gal); metric values hand-rounded, undocumented",
  "supplements.phUp.maxGPerGal": "TS § pH Management (0.2-0.25 g/gal max)",
  "supplements.phUp.highStrengthFlowerStopGPerGal": "TS § pH Management (~0.15-0.2 g/gal on high-strength flower); both lines (CL 2026-09-25)",
  "dripperPh": "Tyler 2026-09-29 ruling N12 (nearest 0.1, floor 5.5, cap 6.0; at-the-line note under 5.55); TS § pH Management (5.5 floor, warm lines > 25 °C)",
  "supplements.phUp.metricDecimals": "undocumented (page display rounding)",
  "supplements.phUp.incrementGPerGal": "TS § Mixing Order (0.05 g/gal increments)",
  "supplements.phUp.waitMinutes": "TS § Mixing Order (wait 5-15 min)",
  "supplements.bioflo": "TS § Product Usage › BioFlo (30 heavy / 15 maintenance, soak 8-24 h); metric values hand-rounded, undocumented",
  "supplements.bioflo.maintenanceEveryWeeks": "TS § Product Usage › BioFlo (periodic maintenance 1-2 weeks)",
  "supplements.triologic.weeklyMlPerGal": "TS § Product Usage › Triologic (1 mL/gal weekly)",
  "supplements.triologic.weeklyMlPerL": "undocumented (hand-rounded metric of 1 mL/gal)",
  "supplements.triologic.maxMlPerGal": "TS § Product Usage › Triologic (up to 2 mL/gal, Tyler 2026-09-29)",
  "supplements.triologic.maxMlPerL": "undocumented (hand-rounded metric of 2 mL/gal)",

  "reference.stockFillPercentBeforeProduct": "TS § Mixing Order (stock prep: fill to 50%)",
  "reference.stockAddProductMinutes": "undocumented",
  "reference.stockMixAfterTopOffMinutes": "undocumented",
  "reference.dtrFillPercent": "TS § Mixing Order › DTR fill method (~90%)",
  "reference.dtrAgitateMinutes": "TS § Mixing Order (agitate 3-5 min)",
  "reference.reservoirUseWithinDays": "undocumented",
  "reference.sterileReservoirCalHypoGPer100Gal": "TS § Water Quality (~1.2 g/100 gal gives 2 ppm)",
  "reference.sterileReservoirCalHypoPpm": "TS (2 ppm target)",
  "reference.typicalFeedEc": "undocumented",
  "reference.cplusStockUseWithinDays": "FR § Component Plus Line › Stock concentrate (use within 14 days)",
  "reference.threePartTank2EmptiesFasterApprox": "undocumented",
  "reference.injectorBandPercent": "undocumented",

  "phUp.curves": "chemistry-model PHREEQC refit 2026-09-29 (calculator-fits-2026-09-29/powfit.json; dose to pH 5.9, RO, 25 °C, air CO2); anchors Stack 3.0 = 0.200 and Swell 3.0 = 0.250 g/gal match the trials (ALK § Level 3); audit N15",
  "phUp.curves.cplus": "chemistry-model PHREEQC refit 2026-09-29 (powfit.json); no bench check yet (ALK § 3e)",
  "phUp.fitEc": "chemistry-model PHREEQC refit 2026-09-29 (fit range EC 1.0–3.5)",
  "phUp.targetMultiplier": "chemistry-model PHREEQC refit 2026-09-29 (median dose(target)/dose(5.9) over nine recipes, EC 1.4–3.5; ±0.02)",
  "phUp.defaultTargetMax": "refit memo 2026-09-29 § 3 (target = printed ceiling − 0.1, never above 5.9 or below 5.5; TS § pH Management: 0.2–0.25 g/gal brings 3 EC flower to ~5.9)",
  "phUp.targetBelowCeiling": "refit memo 2026-09-29 § 3 (target = printed ceiling − 0.1)",
  "phUp.warmLimitOffset": "ALK § 3b (30 °C limit 0.07–0.09 lower); TS § pH Management",
  "phUp.maxGPerGal": "TS § pH Management (0.2–0.25 g/gal max)",
  "phUp.alkPpmPerGPerGal": "TS § pH Management (0.1 g/gal K2CO3 ≈ 19 ppm alkalinity); ALK § Level 3",
  "phUp.stockPresets": "undocumented (pH Up page presets: 20 g/gal for D14MZ2, 100 g/gal for D14MZ3000)",
  "phUp.customStock": "undocumented (page input default and limits)",
  "phUp.defaultReservoirGal": "undocumented (page default)",
  "phUp.doseDecimals": "undocumented (page display rounding)",

  "phDown.mlPerGalPerPpm": "arithmetic from the acid's composition (70% H3PO4, density 1.526, one proton); audit matches",
  "phDown.defaultTargetPpm": "CL 2026-09-25 (20 ppm default target); TS § pH Management (20 ppm review trigger)",
  "phDown.vegTargetPpm": "CL 2026-09-25 (15 ppm for Veg)",
  "phDown.reviewAbovePpm": "TS § pH Management (review water treatment above ~20 ppm); ALK § 3a",
  "phDown.defaultStartPpm": "undocumented (page example value)",
  "phDown.defaultVolumeGal": "undocumented (page default)",
  "phDown.referencePpm": "undocumented (quick-reference rows)",

  "usage.triologicMlPerTreatedGal": "TS § Product Usage › Triologic",
  "usage.siFoliarMlPerGal": "TS § Product Usage › Front Row Si (foliar 0.5–2 mL/gal; budgets at the top of the range); Si is foliar-only per CL 09-29",
  "usage.bagRoundUpDecimals": "undocumented (page rounding)",
  "usage.productDefaults": "undocumented (package sizes)",
  "usage.additiveDefaults": "undocumented (package sizes)",
  "usage.defaults": "refit memo 2026-09-29 § 3 worked example (veg 2 wk × 1,000 gal; flower 2/3/3/1 wk × 10,000 gal); cycles per year undocumented",
  "usage.quick": "TS § Feed Volume for Usage Estimates (flower one plant per 2 ft² at 2 L/plant/day; veg 10% more plants at 0.25 L/plant/day for 2 weeks; mothers excluded)",
  "usage.quick.canopyFt2": "undocumented (page example value; TS § Feed Volume example)",
  "usage.quick.harvestsPerYear": "Tyler 2026-10-02 (quick-mode default 5 harvests per year)",
  "usage.quick.alkPpm": "Tyler 2026-10-02 (quick mode prices pH Up for 10 ppm source alkalinity)",
  "usage.quick.triologicTreatedDaysPerWeek": "TS § Product Usage › Triologic (1x per week); one day's feed treated per TS § Feed Volume for Usage Estimates",
  "usage.quick.siSprayGalPer100Ft2": "TS § Feed Volume for Usage Estimates (1 gal spray per 100 ft²)",
  "usage.quick.siMlPerGal": "TS § Product Usage › Front Row Si (midpoint of 0.5-2 ml/gal)",
  "usage.quick.siSpraysPerCycle": "TS § Product Usage › Front Row Si (1x weekly up to day 21 of flower)",
});

/**
 * Longest-prefix source lookup for a DATA path.
 * @param {string} path
 * @returns {string | undefined}
 */
export function sourceFor(path) {
  let best;
  for (const key of Object.keys(SOURCES)) {
    if ((path === key || path.startsWith(`${key}.`)) && (!best || key.length > best.length)) best = key;
  }
  return best ? SOURCES[/** @type {keyof typeof SOURCES} */ (best)] : undefined;
}
