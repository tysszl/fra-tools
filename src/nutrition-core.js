const FRA_NUTRITION_CORE = (() => {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const fieldUnits = deepFreeze({
    gramsPerPound: 454,
    millilitersPerGallon: 3785,
    litersPerGallon: 3.785,
  });

  const feedUnitFactors = deepFreeze({
    "g/gal": 1,
    "mL/gal": fieldUnits.millilitersPerGallon / fieldUnits.gramsPerPound,
    "injection %": 100 / fieldUnits.gramsPerPound,
    ratio: null,
    "g/L": 1 / fieldUnits.litersPerGallon,
    "mL/L": (fieldUnits.millilitersPerGallon / fieldUnits.gramsPerPound) / fieldUnits.litersPerGallon,
  });

  const phoszymeInputs = {
    ecPerGram: 0.220,
    directGramsPerGallon: 0.4,
    stockCarrierRatio: 0.10,
  };
  const phoszyme = deepFreeze({
    ...phoszymeInputs,
    directEc: Number((phoszymeInputs.directGramsPerGallon * phoszymeInputs.ecPerGram).toFixed(3)),
  });

  const lines = deepFreeze({
    "3part": {
      productsByRole: { partA: "Part A", partB: "Part B", bloom: "Bloom" },
      ecPerGram: { "Part A": 0.306, "Part B": 0.255, Bloom: 0.200 },
      recipes: {
        Veg: { "Part A": 0.6428571428571, "Part B": 0.3571428571429, Bloom: 0 },
        Stretch: { "Part A": 0.55, "Part B": 0.29, Bloom: 0.16 },
        Stack: { "Part A": 0.5021882, "Part B": 0.2789934, Bloom: 0.2188184 },
        Swell: { "Part A": 0.441, "Part B": 0.234, Bloom: 0.325 },
        Ripen: { "Part A": 0.35, "Part B": 0.30, Bloom: 0.35 },
      },
    },
    cplus: {
      productsByRole: { partA: "CaNO3", partB: "C+", bloom: "MKP" },
      ecPerGram: { CaNO3: 0.317, "C+": 0.283, MKP: 0.195 },
      recipes: {
        Veg: { CaNO3: 0.60, "C+": 0.40, MKP: 0 },
        Stack: { CaNO3: 0.496, "C+": 0.32, MKP: 0.184 },
        Swell: { CaNO3: 0.3684, "C+": 0.3294, MKP: 0.3022 },
        Ripen: { CaNO3: 0.315, "C+": 0.30, MKP: 0.385 },
      },
    },
  });

  const roleLineCache = {};

  function getLine(lineId) {
    const line = lines[lineId];
    if (!line) throw new Error(`Unknown FRA nutrition line: ${lineId}`);
    return line;
  }

  function getRecipe(lineId, recipeName) {
    const recipe = getLine(lineId).recipes[recipeName];
    if (!recipe) throw new Error(`Unknown ${lineId} recipe: ${recipeName}`);
    return recipe;
  }

  function getRoleLine(lineId) {
    if (roleLineCache[lineId]) return roleLineCache[lineId];
    const line = getLine(lineId);
    const roles = Object.keys(line.productsByRole);
    const ecPerGram = Object.fromEntries(
      roles.map(role => [role, line.ecPerGram[line.productsByRole[role]]]),
    );
    ecPerGram.phoszyme = phoszyme.ecPerGram;
    const recipes = Object.fromEntries(
      Object.entries(line.recipes).map(([recipeName, recipe]) => [
        recipeName,
        Object.fromEntries(roles.map(role => [role, recipe[line.productsByRole[role]]])),
      ]),
    );
    roleLineCache[lineId] = deepFreeze({
      productsByRole: line.productsByRole,
      ecPerGram,
      recipes,
      recipeNames: Object.keys(line.recipes),
    });
    return roleLineCache[lineId];
  }

  function doseGramsPerGallon(lineId, recipeName, productName, targetEc) {
    const line = getLine(lineId);
    const recipe = getRecipe(lineId, recipeName);
    if (!(productName in line.ecPerGram)) {
      throw new Error(`Unknown ${lineId} product: ${productName}`);
    }
    const normalizedTarget = Math.max(0, Number(targetEc) || 0);
    return normalizedTarget * recipe[productName] / line.ecPerGram[productName];
  }

  function doseRoleGramsPerGallon(lineId, recipeName, role, targetEc) {
    const productName = getLine(lineId).productsByRole[role];
    if (!productName) throw new Error(`Unknown ${lineId} role: ${role}`);
    return doseGramsPerGallon(lineId, recipeName, productName, targetEc);
  }

  function getPhoszymeAdjustment({ lineId, recipeName, targetEc, application, included = true }) {
    const normalizedTarget = Math.max(0, Number(targetEc) || 0);
    if (!included) {
      return { baseTargetEc: normalizedTarget, phoszymeEc: 0, achievable: true, minimumFinalEc: 0 };
    }

    if (application === "direct") {
      return {
        baseTargetEc: Math.max(0, normalizedTarget - phoszyme.directEc),
        phoszymeEc: phoszyme.directEc,
        achievable: normalizedTarget >= phoszyme.directEc,
        minimumFinalEc: phoszyme.directEc,
      };
    }

    if (application !== "stock") throw new Error(`Unknown PhosZyme application: ${application}`);
    const line = getLine(lineId);
    const recipe = getRecipe(lineId, recipeName);
    const carrier = line.productsByRole.partB;
    const overheadFraction = recipe[carrier]
      * phoszyme.stockCarrierRatio
      * (phoszyme.ecPerGram / line.ecPerGram[carrier]);
    const baseTargetEc = normalizedTarget / (1 + overheadFraction);
    return {
      baseTargetEc,
      phoszymeEc: baseTargetEc * overheadFraction,
      achievable: true,
      minimumFinalEc: 0,
    };
  }

  function formatDirectPhoszymeWarning(phases) {
    if (!phases.length) return "";
    return `PhosZyme contributes ${phoszyme.directEc.toFixed(3)} EC by itself. ${phases.join(", ")} cannot reach the selected target at the fixed ${phoszyme.directGramsPerGallon.toFixed(1)} g/gal rate; minimum final EC is ${phoszyme.directEc.toFixed(3)}.`;
  }

  function getFeedUnitDecimals(unit) {
    if (unit === "mL/gal") return 0;
    if (unit === "mL/L" || unit === "g/gal" || unit === "g/L") return 1;
    return 2;
  }

  function createFeedMathAdapter({
    lineId,
    getRecipeName,
    getApplication,
    isPhoszymeIncluded,
    getStockConcentration,
  }) {
    function getPhoszymeAdjustmentForPhase(phase, targetEc) {
      return getPhoszymeAdjustment({
        lineId,
        recipeName: getRecipeName(phase),
        targetEc,
        application: getApplication(),
        included: isPhoszymeIncluded(),
      });
    }

    function getAdjustedTargetEc(phase, targetEc) {
      return getPhoszymeAdjustmentForPhase(phase, targetEc).baseTargetEc;
    }

    function getPhoszymeEc(phase, targetEc) {
      return getPhoszymeAdjustmentForPhase(phase, targetEc).phoszymeEc;
    }

    function calculateEcContribution(phase, role, targetEc) {
      const normalizedTarget = Math.max(0, Number(targetEc) || 0);
      return getRoleLine(lineId).recipes[getRecipeName(phase)][role] * normalizedTarget;
    }

    function calculateDosage(phase, role, method, unit, targetEc) {
      const ec = calculateEcContribution(phase, role, targetEc);
      if (ec === 0) return { dosage: 0, ec: 0, display: "–" };

      const gramsPerGallon = doseRoleGramsPerGallon(
        lineId,
        getRecipeName(phase),
        role,
        targetEc,
      );
      const stockConcentration = getStockConcentration(method, role);
      if (unit === "ratio") {
        const injectionPercent = gramsPerGallon / stockConcentration
          * (100 / fieldUnits.gramsPerPound);
        if (!(injectionPercent > 0)) return { dosage: 0, ec: 0, display: "–" };
        const ratio = Math.round(100 / injectionPercent);
        return { dosage: ratio, ec, display: `1:${ratio}` };
      }

      const dosage = gramsPerGallon / stockConcentration * feedUnitFactors[unit];
      const decimals = getFeedUnitDecimals(unit);
      return { dosage: +dosage.toFixed(decimals), ec, display: dosage.toFixed(decimals) };
    }

    function calculatePhoszymeDosage(phase, method, unit, finalTargetEc) {
      const adjustment = getPhoszymeAdjustmentForPhase(phase, finalTargetEc);
      if (!isPhoszymeIncluded()) return { dosage: 0, ec: 0, display: "–" };

      if (getApplication() === "direct" && (unit === "g/gal" || unit === "g/L")) {
        const dosage = unit === "g/L"
          ? phoszyme.directGramsPerGallon / fieldUnits.litersPerGallon
          : phoszyme.directGramsPerGallon;
        const decimals = unit === "g/L" ? 3 : 1;
        return {
          dosage: +dosage.toFixed(decimals),
          ec: phoszyme.directEc,
          display: dosage.toFixed(decimals),
        };
      }

      const carrier = calculateDosage(
        phase,
        "partB",
        method,
        unit,
        adjustment.baseTargetEc,
      );
      if (carrier.dosage === 0) return { dosage: 0, ec: 0, display: "–" };
      return { dosage: carrier.dosage, ec: adjustment.phoszymeEc, display: carrier.display };
    }

    return deepFreeze({
      getPhoszymeAdjustment: getPhoszymeAdjustmentForPhase,
      getAdjustedTargetEc,
      getPhoszymeEc,
      calculateEcContribution,
      calculateDosage,
      calculatePhoszymeDosage,
    });
  }

  return deepFreeze({
    fieldUnits,
    feedUnitFactors,
    phoszyme,
    lines,
    getLine,
    getRecipe,
    getRoleLine,
    doseGramsPerGallon,
    doseRoleGramsPerGallon,
    getPhoszymeAdjustment,
    formatDirectPhoszymeWarning,
    createFeedMathAdapter,
  });
})();
