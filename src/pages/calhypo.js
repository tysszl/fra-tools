// @ts-check
// Chrome for cal-hypo/index.html: shared theme and a Letter print sheet built from the
// calculator's current readouts. The calculation and its UI live in the page's inline
// script (CAL_HYPO_API), unchanged.
import { currentTheme, initTheme, toggleTheme } from "../../shared/theme.js";
import { printDocument } from "../../shared/print.js";
import { ICONS, esc, sheetFootHtml, sheetHeadHtml, sheetLinesHtml } from "../../shared/chrome.js";

initTheme();
const themeButton = /** @type {HTMLElement} */ (document.getElementById("theme-toggle"));
const setIcon = () => { themeButton.innerHTML = currentTheme() === "dark" ? ICONS.sun : ICONS.moon; };
setIcon();
themeButton.addEventListener("click", () => { toggleTheme(); setIcon(); });

/** @param {string} id */
function text(id) {
  const el = document.getElementById(id);
  return el && !el.closest("[hidden]") ? (el.textContent || "").trim() : "";
}

/** @param {string} id */
function value(id) {
  const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
  if (!el) return "";
  if (el instanceof HTMLSelectElement) return el.options[el.selectedIndex]?.text ?? "";
  return el.value;
}

/** @param {Array<[string, string]>} rows */
function mini(rows) {
  return `<table class="s-mini"><tbody>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r num"><b>${esc(v)}</b></td></tr>`).join("")}</tbody></table>`;
}

function sheet() {
  const stock = !document.getElementById("panel-stock-solution")?.hidden;
  const us = document.querySelector('[data-unit-system="us"]')?.getAttribute("aria-pressed") === "true";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const chips = ["DryTec · 65% available chlorine", us ? "US units" : "Metric", stock ? "Stock solution" : "Powder added directly"];
  // Fertilizer stock concentrate: carry the on-screen restrictions onto the sheet and flag a dose over the 2 ppm limit.
  const fert = /** @type {HTMLSelectElement | null} */ (document.getElementById("treatment-point"))?.value === "fertilizer-concentrate";
  if (fert) chips.push("Fertilizer stock concentrate");
  const target = parseFloat(value(stock ? "stock-target" : "direct-target"));
  const restricted = fert
    ? `<div class="s-block"><div class="s-h">Fertilizer stock concentrate</div>`
      + (target > 2 ? `<p class="s-warn">This dose is ${esc(String(target))} ppm. Keep the applied dose at or below 2 ppm of the final fertilizer-stock volume.</p>` : "")
      + [...document.querySelectorAll("#restricted-state p")].map(el => `<p class="s-p">${esc((el.textContent || "").trim())}</p>`).join("")
      + `</div>`
    : "";
  let body;
  if (stock) {
    body = `<div class="s-two s-two--even" style="margin-top:12px">
      <div><div class="s-h">1 · Mix the stock solution</div>${mini([
        ["Stock recipe", value("stock-preset")],
        ["Stock concentration", text("prep-rate-result")],
        ["Final stock volume", `${value("prep-volume")} ${text("prep-volume-unit")}`],
        ["DryTec required", text("prep-mass-result")],
      ])}<p class="s-p" style="margin-top:6px">${esc(text("stock-recipe-result"))}</p><p class="s-note">${esc(text("solubility-note"))}</p></div>
      <div><div class="s-h">2 · How much stock to use</div>${mini([
        ["Target applied chlorine", `${value("stock-target")} ppm`],
        ["Treated water", `${value("stock-treated-volume")} ${text("stock-volume-unit")}`],
        [text("stock-primary-label") || "Usage rate", text("stock-primary-result")],
        [text("stock-alternate-label"), text("stock-alternate-result")],
        [text("stock-batch-label"), text("stock-batch-total")],
      ])}<p class="s-p" style="margin-top:6px">${esc(text("stock-action"))}</p>${text("equipment-note") ? `<p class="s-note">${esc(text("equipment-note"))}</p>` : ""}</div>
    </div>`;
  } else {
    body = `<div style="margin-top:12px"><div class="s-h">Add powder directly</div>${mini([
      ["Treated water", `${value("direct-volume")} ${text("direct-volume-unit")}`],
      ["Target applied chlorine", `${value("direct-target")} ppm`],
      ["DryTec required", text("direct-result")],
    ])}<p class="s-p" style="margin-top:6px">${esc(text("direct-action"))}</p></div>`;
  }
  const table = document.getElementById("direct-reference-table");
  // For fertilizer stock only the rows within its 2 ppm limit apply; that also keeps the sheet on one page.
  const rows = table ? (fert
    ? [table.querySelector("thead"), table.querySelector("tbody.recommended")].map(el => el?.outerHTML ?? "").join("")
    : table.innerHTML) : "";
  const quick = table ? `<div class="s-block"><div class="s-h">Direct-dose quick table</div><table class="s-mini">${rows}</table>
    <p class="s-note">The 0.5–2 ppm rows are FRA's continuous-use residual range at the farthest dripper.${fert ? "" : " Elevated cleaning references are not continuous-use plant targets."}</p></div>` : "";
  // Verify and Avoid come from the page's field-check cards so the sheet says what the screen says.
  const verify = [...document.querySelectorAll(".field-check:not(.avoid) p")].map(p => `<p class="s-p">${esc((p.textContent || "").trim())}</p>`).join("");
  const avoid = [...document.querySelectorAll(".field-check.avoid li")].map(li => `<li>${esc((li.textContent || "").trim())}</li>`).join("");
  const safety = [...document.querySelectorAll(".safety li")].map(li => `<li>${esc(li.textContent)}</li>`).join("");
  return `<section class="sheet">`
    + sheetHeadHtml({ root: "../", kicker: "Water sanitation · DryTec", title: "Calcium Hypochlorite", date, chips })
    + body + restricted + quick
    + `<div class="s-two s-two--even" style="margin-top:14px"><div><div class="s-h">Verify at the dripper</div>${verify}${avoid ? `<div class="s-h" style="margin-top:10px">Avoid</div><ul class="s-list">${avoid}</ul>` : ""}</div>`
    + `<div><div class="s-h">Handling and mixing</div><ul class="s-list">${safety}</ul></div></div>`
    + `<div class="s-notes"><div class="s-h">Notes</div>${sheetLinesHtml()}</div>`
    + sheetFootHtml("tools.frontrowag.com/cal-hypo/")
    + `</section>`;
}

const printRoot = /** @type {HTMLElement} */ (document.querySelector("[data-print]"));
const renderSheet = () => { printRoot.innerHTML = sheet(); };
// The inline script updates the readouts first; build the sheet after it.
["input", "change", "click"].forEach(type => document.addEventListener(type, () => setTimeout(renderSheet, 0)));
document.querySelector("[data-act=pdf]")?.addEventListener("click", () => printDocument("FRA calcium hypochlorite", renderSheet));
if (document.readyState === "complete") renderSheet();
else window.addEventListener("load", () => setTimeout(renderSheet, 0));
