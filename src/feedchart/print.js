// @ts-check
// The printed Feed Chart: two Letter pages. Page 1 is the chart and EC guidance;
// page 2 is the mixing procedure, stock table with validation, and additive rates.
import { DATA } from "../engine/index.js";
import { esc } from "./content.js";
import { doserArt, stepArt } from "./art.js";

/** @typedef {import("./content.js").View} View */
/** @typedef {(key: string, vars?: Record<string, string | number>) => string} T */

const FOOTER = "order@solsticeag.com · +1 844-420-6883 · frontrowag.com";

/**
 * @param {View} view
 * @param {T} t
 * @param {{ logo: string, qr: string }} assets
 */
export function renderPrint(view, t, assets) {
  const total = 2;
  return pageOne(view, t, assets, total) + pageTwo(view, t, assets, total);
}

/**
 * @param {View} view @param {T} t @param {{ logo: string, qr: string }} assets
 * @param {string} title @param {boolean} withQr
 */
function head(view, t, assets, title, withQr) {
  return `<header class="s-head">`
    + `<img class="logo" src="${assets.logo}" alt="Front Row Ag">`
    + `<div class="s-title"><div class="s-kicker">${esc(t("print.kicker", { line: view.lineLabel, application: view.applicationLabel }))}</div><h3>${esc(title)}</h3></div>`
    + `<div class="s-meta">${view.facility ? `${esc(t("print.preparedFor"))} <b>${esc(view.facility)}</b><br>` : ""}${esc(view.date)}<br>tools.frontrowag.com</div>`
    + (withQr ? `<img class="s-qr" src="${assets.qr}" alt="${esc(t("print.qr"))}">` : "")
    + `</header>`
    + `<div class="s-setup">${view.chips.map(chip => `<span>${esc(chip)}</span>`).join("")}</div>`;
}

/** @param {number} n @param {number} total @param {T} t */
function foot(n, total, t) {
  return `<footer class="s-foot"><div><b>Front Row Ag</b> · ${FOOTER}</div><div>${esc(t("print.page", { n, total }))}</div></footer>`;
}

/** @param {View} view @param {T} t @param {{ logo: string, qr: string }} assets @param {number} total */
function pageOne(view, t, assets, total) {
  const cols = view.phases;
  const headRow = `<tr><th></th>${cols.map(p => `<th>${esc(p.long)}</th>`).join("")}</tr>`;
  const recipeRow = `<tr class="rec"><th>${esc(t("chart.recipe"))}</th>${cols.map(p => `<td>${esc(p.recipe)}</td>`).join("")}</tr>`;
  const ecRow = `<tr class="ecr"><th>${esc(t("chart.targetEc"))}</th>${cols.map(p => `<td class="num">${p.served ? esc(p.ec) : "–"}</td>`).join("")}</tr>`;
  const partRows = view.rows.map(row => `<tr class="part ${row.cls}"><th class="pc">${esc(row.label)}</th>${row.cells.map(cell => {
    if (!cell) return `<td class="dash">–</td>`;
    if (cell.dash) return `<td class="dash">–</td>`;
    return `<td class="pc"><div class="v num">${esc(cell.display)}</div><div class="s num">${esc(cell.ecText)} EC</div></td>`;
  }).join("")}</tr>`).join("");
  const phRow = `<tr class="phrow"><th>${esc(t("chart.dripperPh"))}</th>${cols.map(p => `<td class="num">${p.ph ? esc(p.ph.text) : "–"}</td>`).join("")}</tr>`;

  const notes = [
    `${t("chart.valuesAre", { caption: view.unitCaption })} ${t("chart.subEc")}`,
    view.phNote.warm,
    ...view.chartNotes.filter(n => n.kind === "info").map(n => n.text),
  ];
  const warns = [...view.chartNotes.filter(n => n.kind === "warn").map(n => n.text)];

  const hl = `<table class="s-mini"><thead><tr><th>${esc(t("ec.higher"))}</th><th>${esc(t("ec.lower"))}</th></tr></thead><tbody>${view.higherLower.map(([h, l]) => `<tr><td>${esc(h)}</td><td>${esc(l)}</td></tr>`).join("")}</tbody></table>`;
  const direct = view.settings.application === "direct";
  const contribution = direct
    ? `<div class="s-block"><div class="s-h">${esc(t("ec.contribution"))}</div><table class="s-mini"><tbody>${view.ecContribution.map(([name, ec]) => `<tr><td>${esc(name)}</td><td class="r num">${esc(ec)}</td></tr>`).join("")}</tbody></table><p class="s-note">${esc(t("ec.perUnit", { unit: view.unit === "g/L" ? "g/L" : "g/gal" }))}</p></div>`
    : "";
  const line = !direct && view.settings.doserCount === 2
    ? `<div class="s-block"><div class="s-h">${esc(t("print.artTitle.line"))}</div>${doserArt({ cplus: view.settings.line === "cplus" })}</div>`
    : "";
  const key = line
    ? `<div class="s-block"><div class="s-h">${esc(t("print.tankKey"))}</div><ul class="s-key">${view.tanks.map(tank => `<li class="${tank.cls}"><i></i><b>${esc(t("tank.n", { n: tank.n }))}</b> ${esc(tank.name)}</li>`).join("")}<li class="s-key--opt"><i></i>${esc(t("print.phUpDoser"))}</li></ul></div>`
    : "";

  return `<section class="sheet">`
    + head(view, t, assets, t("print.feedChart"), true)
    + `<table class="s-table"><thead>${headRow}</thead><tbody>${recipeRow}${ecRow}${partRows}${phRow}</tbody></table>`
    + notes.map(n => `<p class="s-note">${esc(n)}</p>`).join("")
    + warns.map(n => `<p class="s-warn">${esc(n)}</p>`).join("")
    + `<p class="s-note"><i>${esc(t("chart.disclaimer"))}</i></p>`
    + `<div class="s-two"><div><div class="s-h">${esc(t("ec.higherLower"))}</div>${hl}${key}</div>`
    + `<div><div class="s-h">${esc(t("ec.considerations"))}</div><p class="s-p">${esc(t("ec.considerationsBody"))}</p>${contribution}${line}</div></div>`
    + `<div class="s-notes"><div class="s-h">${esc(t("print.notes"))}</div><div class="s-lines"></div></div>`
    + foot(1, total, t)
    + `</section>`;
}

/** @param {View} view @param {T} t @param {{ logo: string, qr: string }} assets @param {number} total */
function pageTwo(view, t, assets, total) {
  const stockMode = view.settings.application === "stock";
  const cplus = view.settings.line === "cplus";
  const metric = view.unit === "mL/L" || view.unit === "g/L";
  const ref = DATA.reference;
  const validation = metric ? DATA.validation.metric : DATA.validation.us;
  const captions = stockMode
    ? [
      t("art.stock.1", { pct: ref.stockFillPercentBeforeProduct }),
      t("art.stock.2", { min: ref.stockAddProductMinutes }),
      t("art.stock.3", { min: ref.stockMixAfterTopOffMinutes }),
      t("art.stock.4", { ml: validation.sampleMl, water: t(metric ? "water.metric" : "water.us") }),
    ]
    : [
      t("art.dtr.1", { pct: ref.dtrFillPercent }),
      t("art.dtr.2", { min: `${ref.dtrAgitateMinutes[0]}–${ref.dtrAgitateMinutes[1]}` }),
      t("art.dtr.3"),
      t("art.dtr.4"),
    ];

  const steps = `<div><div class="s-h">${esc(t("print.mixing"))}</div><ol class="s-list">${view.steps.map(step => `<li>${esc(step)}</li>`).join("")}</ol></div>`;
  const notes = `<div><div class="s-h">${esc(t(stockMode ? "sec.notes.stock" : "sec.notes.direct"))}</div><ul class="s-list">${view.notes.map(note => `<li>${esc(note)}</li>`).join("")}</ul></div>`;
  const art = `<div class="s-block"><div class="s-h">${esc(t(stockMode ? "print.artTitle.stock" : "print.artTitle.direct"))}</div>${stepArt(stockMode ? "stock" : "direct", captions.map(esc), { cplus })}</div>`;

  let stock = "";
  if (stockMode) {
    const h = view.stockHead;
    const body = view.stockTableRows.map(r => `<tr class="${r.sub ? "sub" : ""}"><td class="num">${esc(r.tank)}</td><td>${r.sub ? "+ " : ""}${esc(r.part)}</td><td class="r num">${esc(r.vol)}</td><td class="r num">${esc(r.wt)}</td><td class="r num">${esc(r.conc)}</td><td class="r num">${esc(r.sample)}</td><td class="r num">${esc(r.ecG)}</td><td class="r num"><b>${esc(r.valEC)}</b></td></tr>`).join("")
      + (view.tank2Total ? `<tr class="total"><td></td><td>${esc(t("stock.tank2Total"))}</td><td></td><td></td><td></td><td></td><td></td><td class="r num">${esc(view.tank2Total)}</td></tr>` : "");
    const table = `<table class="s-mini"><thead><tr><th>${esc(t("stock.tank"))}</th><th>${esc(t("stock.part"))}</th><th class="r">${esc(h.vol)}</th><th class="r">${esc(h.wt)}</th><th class="r">${esc(h.conc)}</th><th class="r">${esc(h.sample)}</th><th class="r">${esc(h.ecG)}</th><th class="r">${esc(t("stock.validEc"))}</th></tr></thead><tbody>${body}</tbody></table>`;
    const phz = view.settings.usePhoszyme ? `<p class="s-note">${esc(t("val.phz", { carrier: view.carrier }))}</p>` : "";
    stock = `<div class="s-two s-two--stock"><div><div class="s-h">${esc(t("stock.title", { label: view.stockLabel }))}</div>${table}</div>`
      + `<div><div class="s-h">${esc(t("sec.validation"))}</div><ol class="s-list">${view.validationSteps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>${phz}</div></div>`;
  }

  const additives = `<div class="s-block"><div class="s-h">${esc(t("supp.title"))}</div><table class="s-mini"><thead><tr><th>${esc(t("supp.additive"))}</th><th>${esc(t("supp.rate"))}</th><th>${esc(t("supp.notes"))}</th></tr></thead><tbody>${view.supplements.map(sup => `<tr><td class="nowrap"><b>${esc(sup.name)}</b></td><td class="nowrap">${esc(sup.rate)}</td><td>${esc(sup.note)}</td></tr>`).join("")}</tbody></table></div>`;

  return `<section class="sheet">`
    + head(view, t, assets, t("print.mixing"), false)
    + `<div class="s-two s-two--even">${steps}${notes}</div>`
    + art
    + stock
    + additives
    + `<div class="s-notes s-notes--fill"><div class="s-h">${esc(t("print.notes"))}</div><div class="s-lines"></div></div>`
    + foot(2, total, t)
    + `</section>`;
}
