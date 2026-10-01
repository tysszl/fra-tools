// @ts-check
// Everything the Feed Chart shows, as plain data in the chart's language: chart cells,
// setup chips, tanks, steps, notes, supplements, and the copy-summary text. The screen
// (app.js) and the printed sheets (print.js) render from this one model.
import { DATA, getLine, supplementRates, formatTargetEc, isMetricUnit, formatStockTankVolume, formatLbPerGal, customStockRates, cplusTwoDoserEqualRate } from "../engine/index.js";

/** @typedef {ReturnType<import("../engine/chart.js").computeFeedChart>} Chart */
/** @typedef {(key: string, vars?: Record<string, string | number>) => string} T */

/**
 * @typedef {object} ViewOptions
 * @property {string} facility
 * @property {{ phup: boolean, bf: boolean, tri: boolean }} show
 * @property {"en" | "es"} lang
 * @property {"customer" | "team"} mode
 */

const HIGHER_LOWER_ROWS = 8;

/** @param {string} key */
function rowClass(key) {
  return `k-${key.replace(/[^A-Za-z0-9]/g, "")}`;
}

/**
 * @param {Chart} chart
 * @param {T} t
 * @param {ViewOptions} options
 */
export function buildView(chart, t, options) {
  const s = chart.settings;
  const line = getLine(s.line);
  const stockMode = s.application === "stock";
  const twoDoser = s.doserCount === 2;
  const metric = isMetricUnit(s.unit);
  const names = line.stockNames;

  const lineLabel = t(`lines.${s.line}`);
  const applicationLabel = t(stockMode ? "chip.stock" : "chip.direct");

  // ── Setup chips ──
  /** @type {string[]} */
  const chips = [applicationLabel];
  if (stockMode) {
    if (twoDoser) {
      chips.push(t("chip.dosers2"));
      const vols = chart.tankVolumes;
      if (vols && (s.line === "3part" || s.line === "cplus")) chips.push(t("chip.tankGal", { vol: formatStockTankVolume(s.line, s.stockTankVolumeGal) }));
      if (s.line === "cplus") {
        chips.push(t("chip.caStock", { rate: s.cplusCaStockLbPerGal.toFixed(2) }));
        if (s.cplusFinalPhase === "near-ripen") chips.push(t("chip.nearRipen"));
      }
    } else if (s.line === "3part" && s.method === "custom") {
      const r = customStockRates(s.customLbs, s.stockTankVolumeGal);
      chips.push(`${t("chip.custom", { a: formatLbPerGal(r.partA), b: formatLbPerGal(r.partB), bl: formatLbPerGal(r.bloom) })} · ${t("chip.dosers3")}`);
      chips.push(t("chip.tankGal", { vol: formatStockTankVolume("3part", s.stockTankVolumeGal) }));
    } else {
      chips.push(`${s.method} · ${t("chip.dosers3")}`);
      if (s.line === "cplus") chips.push(t("chip.tankGal", { vol: formatStockTankVolume("cplus", s.stockTankVolumeGal) }));
    }
  }
  chips.push(t(`unit.${s.unit}`));
  chips.push(t(s.ecPreset === "high" ? "chip.high" : s.ecPreset === "standard" ? "chip.standard" : "chip.customEc"));
  chips.push(t(twoDoser ? "chip.schedule.locked" : `chip.schedule.${s.recipeSchedule}`));
  if (s.usePhoszyme) chips.push(t("chip.phz"));

  // ── Chart ──
  const phases = chart.phases.map((p, index) => {
    const ph = chart.ph.columns[index];
    return {
      index,
      phase: p.phase,
      short: t(`phase.short.${index}`),
      long: t(`phase.long.${index}`),
      recipe: p.recipeLabel,
      ec: formatTargetEc(p.targetEc),
      targetEc: Number(p.targetEc),
      served: !(twoDoser && index === 0),
      ph: ph ? { text: ph.text } : null,
    };
  });

  /** @param {string} key @param {string} label */
  const shortLabel = (key, label) => {
    if (key === "partA") return names.partA;
    if (key === "partB") return names.partB;
    if (key === "bloom") return names.bloom;
    if (key === "partB+phoszyme") return `${names.partB} + PhosZyme`;
    if (key === "tank2") return `${names.partB} + ${names.bloom}${s.usePhoszyme ? " + PhosZyme" : ""}`;
    return label;
  };
  const rows = chart.rows.map(row => ({
    key: row.key,
    cls: rowClass(row.key),
    label: row.label,
    short: shortLabel(row.key, row.label),
    cells: row.cells.map(cell => {
      if (!cell) return null;
      if (cell.display === "–") return { dash: true, display: "–", ecText: "", ec: 0 };
      return { dash: false, display: cell.display, ecText: cell.ec.toFixed(2), ec: cell.ec };
    }),
  }));

  const maxEc = Math.max(3, ...phases.map(p => p.targetEc || 0));
  const bars = phases.map((p, index) => {
    if (!p.served) return null;
    const segments = rows
      .map(row => ({ cls: row.cls, ec: row.cells[index] && !row.cells[index]?.dash ? /** @type {any} */ (row.cells[index]).ec : 0 }))
      .filter(seg => seg.ec > 0);
    return { widthPct: Math.max(4, Math.min(100, (p.targetEc / maxEc) * 100)), segments };
  });

  // ── Notes under the chart ──
  /** @type {Array<{ kind: "warn" | "info", text: string }>} */
  const chartNotes = [];
  if (twoDoser) {
    chartNotes.push({ kind: "info", text: t("twoDoser.veg", {
      combo: `${names.partB} + ${names.bloom}`, bloom: names.bloom, a: line.fullNames.partA, b: line.fullNames.partB,
    }) });
    if (s.line === "cplus" && cplusTwoDoserEqualRate(s)) chartNotes.push({ kind: "info", text: t("twoDoser.equal") });
    else chartNotes.push({ kind: "info", text: t("twoDoser.rates") });
  }
  if (chart.phoszymeWarning.text) chartNotes.push({ kind: "warn", text: phoszymeWarning(chart, t, options.lang) });

  const rates = supplementRates(metric);
  const phNote = {
    body: t("ph.body"),
    warm: t("ph.warm", { c: DATA.dripperPh.warmLineC, f: DATA.dripperPh.warmLineF }),
  };

  // ── Stock tanks ──
  const stock = chart.stock;
  const wtUnit = metric ? "kg" : "lb";
  const concUnit = metric ? "g/L" : "lb/gal";
  const volUnit = metric ? "L" : "gal";
  /** @param {string} key */
  const stockRow = key => stock ? stock.rows.find(r => r.key === key) : undefined;
  /** @type {Array<{ n: number, cls: string, name: string, weight: string, conc: string, validates: string, extra: string }>} */
  const tanks = [];
  if (stock) {
    const a = /** @type {any} */ (stockRow("partA"));
    const b = /** @type {any} */ (stockRow("partB"));
    const phz = /** @type {any} */ (stockRow("phz"));
    const bl = /** @type {any} */ (stockRow("bloom"));
    tanks.push({ n: 1, cls: rowClass("partA"), name: line.fullNames.partA, weight: `${a.wt} ${wtUnit}`, conc: `${a.conc} ${concUnit}`, validates: t("tank.validates", { ec: a.valEC.toFixed(2) }), extra: "" });
    if (twoDoser) {
      const items = [`${b.wt} ${wtUnit} ${line.fullNames.partB}`];
      if (s.usePhoszyme) items.push(`${phz.wt} ${wtUnit} PhosZyme`);
      items.push(`${bl.wt} ${wtUnit} ${line.fullNames.bloom}`);
      tanks.push({
        n: 2, cls: rowClass("tank2"), name: `${line.fullNames.partB} + ${line.fullNames.bloom}`,
        weight: items.join(" · "), conc: "", validates: t("tank.validatesTotal", { ec: /** @type {string} */ (stock.tank2Total) }), extra: "",
      });
    } else {
      tanks.push({
        n: 2, cls: rowClass("partB"), name: line.fullNames.partB, weight: `${b.wt} ${wtUnit}`, conc: `${b.conc} ${concUnit}`,
        validates: t("tank.validates", { ec: b.valEC.toFixed(2) }),
        extra: s.usePhoszyme ? `+ ${phz.wt} ${wtUnit} PhosZyme. ${t("tank.phzAdds", { ec: phz.valEC.toFixed(2) })}` : "",
      });
      tanks.push({ n: 3, cls: rowClass("bloom"), name: line.fullNames.bloom, weight: `${bl.wt} ${wtUnit}`, conc: `${bl.conc} ${concUnit}`, validates: t("tank.validates", { ec: bl.valEC.toFixed(2) }), extra: "" });
    }
  }
  const vols = chart.tankVolumes;
  const volText = stock && vols ? (stock.rows[0].vol === stock.rows[1].vol
    ? t("tanks.each", { vol: stock.rows[0].vol, unit: volUnit })
    : t("tanks.split", { a: stock.rows[0].vol, b: stock.rows[1].vol, unit: volUnit })) : "";

  const validation = metric ? DATA.validation.metric : DATA.validation.us;
  const water = t(metric ? "water.metric" : "water.us");
  const validationLine = t("tank.validation", { ml: validation.sampleMl, water });
  const validationSteps = [t("val.1", { ml: validation.sampleMl }), t("val.2", { water }), t("val.3"), t("val.4")];

  /** Stock table rows for print: Tank 2 sub-rows indent on 2 dosers; PhosZyme only when used. */
  const stockTableRows = stock ? stock.rows
    .filter(r => r.key !== "phz" || s.usePhoszyme)
    .map(r => ({
      key: r.key,
      cls: rowClass(r.key === "phz" ? "phoszyme" : r.key),
      tank: r.key === "phz" || (twoDoser && r.key === "bloom") ? "" : String(r.tank),
      part: r.key === "phz" ? "PhosZyme" : r.part,
      sub: r.key === "phz" || (twoDoser && r.key === "bloom"),
      vol: String(r.vol), wt: String(r.wt), conc: String(r.conc), sample: String(r.sample), ecG: String(r.ecG), valEC: r.valEC.toFixed(2),
    })) : [];
  const stockHead = {
    vol: volUnit, wt: wtUnit, conc: concUnit,
    sample: metric ? `mL / ${DATA.validation.metric.waterL} L` : `mL / ${DATA.validation.us.waterGal} gal`,
    ecG: t("ec.perUnit", { unit: metric ? "g/L" : "g/gal" }),
  };

  // ── Steps and notes ──
  /** @type {string[]} */
  let steps;
  /** @type {string[]} */
  let notes;
  if (stockMode && !twoDoser) {
    steps = [1, 2, 3, 4, 5].map(n => t(`step.stock.${n}`));
  } else if (stockMode) {
    const three = `step.two.${s.line}.3${s.usePhoszyme ? "" : ".nophz"}`;
    steps = [t("step.two.1"), t("step.two.2"), t(three), t("step.two.4"), t("step.two.5"), t("step.two.6")];
  } else {
    const n = line.fullNames;
    steps = [
      t("step.dtr.1"), t("step.dtr.2"),
      t("step.dtr.add", { product: n.partA }),
      t(s.usePhoszyme ? "step.dtr.addPhz" : "step.dtr.add", { product: n.partB }),
      t("step.dtr.add", { product: n.bloom }),
      t("step.dtr.6"), t("step.dtr.7"), t("step.dtr.8"),
    ];
  }
  if (stockMode && s.line === "3part") {
    notes = [
      t(twoDoser ? "note.stock.3part.2" : "note.stock.3part.1"),
      t("note.ro"),
      t(twoDoser ? "note.phz.3part.two" : "note.phz.3part"),
      t("note.oxidizers.stock"),
      t(twoDoser ? "note.injectors.two" : "note.injectors"),
    ];
  } else if (stockMode) {
    notes = [
      t("note.cplus.shelf"),
      t(twoDoser ? "note.cplus.separate.two" : "note.cplus.separate"),
      ...(s.usePhoszyme ? [t(twoDoser ? "note.phz.cplus.two" : "note.phz.cplus")] : []),
      t("note.cplus.validate"),
      t("note.oxidizers.stock"),
      t(twoDoser ? "note.injectors.two" : "note.injectors"),
    ];
  } else {
    const ref = DATA.reference;
    const gL = (ref.sterileReservoirCalHypoGPer100Gal / DATA.units.litersPerGallon).toFixed(2);
    notes = [
      t("note.dtr.days"),
      t(metric ? "note.dtr.oxidizers.metric" : "note.dtr.oxidizers.us", { g: ref.sterileReservoirCalHypoGPer100Gal, gL, ppm: ref.sterileReservoirCalHypoPpm }),
      t("note.ro"),
      ...(s.usePhoszyme || s.line === "3part" ? [t(`note.dtr.phz.${s.line}`)] : []),
    ];
  }

  // ── Supplements (all four; `shown` marks the ones picked for screen and summary) ──
  const supplements = [
    { id: "si", shown: true, name: t("supp.si.name"), rate: t("supp.si.rate", { rate: rates.siFoliar }), note: t("supp.si.note") },
    {
      id: "phup", shown: options.show.phup, name: t("supp.phup.name"),
      rate: t("supp.phup.rate", { max: rates.phUpMax, unit: rates.phUpUnit }),
      note: t("supp.phup.note", { inc: rates.phUpIncrement, unit: rates.phUpUnit, wait: rates.phUpWaitMinutes, stop: rates.phUpHighStrengthFlowerStop }),
    },
    {
      id: "bf", shown: options.show.bf, name: t("supp.bioflo.name"),
      rate: t("supp.bioflo.rate", { heavy: rates.biofloHeavy, maint: rates.biofloMaintenance }),
      note: t("supp.bioflo.note", { soak: rates.biofloSoakHours, weeks: rates.biofloMaintenanceEveryWeeks }),
    },
    {
      id: "tri", shown: options.show.tri, name: t("supp.tri.name"),
      rate: t("supp.tri.rate", { weekly: rates.triologicWeekly }),
      note: t("supp.tri.note", { max: rates.triologicMax }),
    },
  ];

  const higherLower = Array.from({ length: HIGHER_LOWER_ROWS }, (_, i) => [t(`hl.${i}.h`), t(`hl.${i}.l`)]);
  const ecContribution = [
    [line.fullNames.partA, line.ecPerGram.partA],
    [line.fullNames.partB, line.ecPerGram.partB],
    [line.fullNames.bloom, line.ecPerGram.bloom],
    ...(s.usePhoszyme ? [["PhosZyme", DATA.phoszyme.ecPerGram]] : []),
  ].map(([name, ec]) => [String(name), (metric ? Number(ec) * DATA.units.litersPerGallon : Number(ec)).toFixed(3)]);

  const view = {
    settings: s,
    lineLabel,
    applicationLabel,
    title: options.mode === "team" ? t("title.team") : t(`title.${s.line}`),
    lede: t(stockMode ? "lede.stock" : "lede.direct"),
    chips,
    unit: s.unit,
    unitLabel: t(`unit.${s.unit}`),
    unitCaption: t(`unitCaption.${s.unit}`),
    phases,
    rows,
    bars,
    chartNotes,
    phNote,
    tanks,
    tanksVolText: volText,
    validationLine,
    validationSteps,
    stockTableRows,
    stockHead,
    stockLabel: chart.stockConfigLabel,
    tank2Total: stock ? stock.tank2Total : null,
    steps,
    notes,
    supplements,
    higherLower,
    ecContribution,
    facility: options.facility,
    date: new Date().toLocaleDateString(options.lang === "es" ? "es-MX" : "en-US", { year: "numeric", month: "short", day: "numeric" }),
    carrier: line.fullNames.partB,
  };
  return view;
}

/**
 * The engine's PhosZyme warning, in the chart's language.
 * @param {Chart} chart
 * @param {T} t
 * @param {"en" | "es"} lang
 */
function phoszymeWarning(chart, t, lang) {
  if (lang === "en") return chart.phoszymeWarning.text;
  const phz = DATA.phoszyme;
  return `PhosZyme aporta ${phz.directEc.toFixed(3)} EC por sí solo. ${chart.phoszymeWarning.phases.join(", ")} no puede alcanzar la EC objetivo con la dosis fija de ${phz.directGramsPerGallon.toFixed(1)} g/gal; la EC final mínima es ${phz.directEc.toFixed(3)}.`;
}

/** @typedef {ReturnType<typeof buildView>} View */

/**
 * Copy Summary: plain text, and an HTML table for email and docs.
 * @param {View} view
 * @param {T} t
 * @param {string} url
 */
export function buildSummary(view, t, url) {
  const title = `${t("summary.title")} · ${view.lineLabel}`;
  const setup = view.chips.join(" · ");
  const header = [t("chart.phase"), ...view.phases.map(p => p.short)];
  const recipe = [t("chart.recipe"), ...view.phases.map(p => p.recipe)];
  const ec = [t("chart.targetEc"), ...view.phases.map(p => p.ec)];
  const body = view.rows.map(row => [row.label, ...row.cells.map(cell => (cell ? cell.display : "–"))]);
  const ph = [t("chart.dripperPh"), ...view.phases.map(p => (p.ph ? p.ph.text : "–"))];
  const table = [header, recipe, ec, ...body, ph];
  const shown = view.supplements.filter(sup => sup.shown);

  const plain = [
    title,
    setup,
    ...(view.facility ? [t("summary.facility", { name: view.facility })] : []),
    "",
    `${t("sec.schedule")} (${view.unitLabel})`,
    ...table.map(r => r.join(" | ")),
    ...view.chartNotes.map(n => n.text),
    ...(view.tanks.length ? ["", `${t("sec.tanks")} (${view.tanksVolText})`, ...view.tanks.map(tank =>
      `${t("tank.n", { n: tank.n })} · ${tank.name}: ${tank.weight}${tank.conc ? ` (${tank.conc})` : ""}. ${tank.validates}.`), view.validationLine] : []),
    "",
    t("sec.supps"),
    ...shown.map(sup => `${sup.name}: ${sup.rate}. ${sup.note}`),
    "",
    t("summary.link", { url }),
  ].join("\n");

  const cellStyle = 'style="border:1px solid #d9dddb;padding:6px 10px;text-align:center"';
  const headStyle = 'style="border:1px solid #d9dddb;padding:6px 10px;text-align:center;background:#f1f3f2;font-weight:600"';
  const labelStyle = 'style="border:1px solid #d9dddb;padding:6px 10px;text-align:left;font-weight:600"';
  const html = [
    `<h3 style="margin:0 0 4px">${esc(title)}</h3>`,
    `<p style="margin:0 0 10px;color:#626a67">${esc(setup)}${view.facility ? ` · ${esc(view.facility)}` : ""}</p>`,
    `<table style="border-collapse:collapse;font-size:14px">`,
    `<tr>${header.map(h => `<th ${headStyle}>${esc(h)}</th>`).join("")}</tr>`,
    ...table.slice(1).map(r => `<tr><td ${labelStyle}>${esc(r[0])}</td>${r.slice(1).map(c => `<td ${cellStyle}>${esc(c)}</td>`).join("")}</tr>`),
    `</table>`,
    `<p style="margin:6px 0;color:#626a67">${esc(`${t("chart.valuesAre", { caption: view.unitCaption })}`)}</p>`,
    ...view.chartNotes.map(n => `<p style="margin:4px 0">${esc(n.text)}</p>`),
    ...(view.tanks.length ? [`<p style="margin:12px 0 4px;font-weight:600">${esc(`${t("sec.tanks")} (${view.tanksVolText})`)}</p>`,
      ...view.tanks.map(tank => `<p style="margin:2px 0">${esc(`${t("tank.n", { n: tank.n })} · ${tank.name}: ${tank.weight}${tank.conc ? ` (${tank.conc})` : ""}. ${tank.validates}.`)}</p>`),
      `<p style="margin:2px 0;color:#626a67">${esc(view.validationLine)}</p>`] : []),
    `<p style="margin:12px 0 4px;font-weight:600">${esc(t("sec.supps"))}</p>`,
    ...shown.map(sup => `<p style="margin:2px 0"><b>${esc(sup.name)}</b>: ${esc(sup.rate)}. ${esc(sup.note)}</p>`),
    `<p style="margin:12px 0 0"><a href="${esc(url)}">${esc(t("summary.link", { url: "" }).replace(/:\s*$/, ""))}</a></p>`,
  ].join("");
  return { plain, html };
}

/** @param {unknown} value */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, ch => /** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
