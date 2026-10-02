// @ts-check
// pH Down calculator: 70% phosphoric acid to bring source-water alkalinity to a target.
import { DATA, phDownDose, phDownReference } from "../engine/index.js";
import { initTheme, toggleTheme } from "../../shared/theme.js";
import { replaceUrl, shareUrl } from "../../shared/share.js";
import { printDocument } from "../../shared/print.js";
import { ICONS, backLinkHtml, barHtml, esc, footHtml, sheetFootHtml, sheetHeadHtml, sheetLinesHtml, toast } from "../../shared/chrome.js";

const L_PER_GAL = DATA.units.litersPerGallon;
const HOW_IT_WORKS = [
  "Each ppm of alkalinity (as CaCO3) takes about 0.0069 mL/gal of 70% phosphoric acid to neutralize. The calculator doses the difference between your water and the target.",
  "About 20 ppm is a screening trigger: above it, review your water treatment. It is not a safe band. Where the finished feed lands depends on the recipe and its EC. At 20 ppm, standard-strength Veg can land above its pH range while high-strength flower recipes can land under 5.5, and some feeds need an adjustment even below 20 ppm.",
  "Confirm the stabilized pH at the dripper with a calibrated meter. A fresh tank can read lower than the lines until its dissolved CO2 gasses off, so measure at the dripper rather than applying a fixed correction.",
  "Inject acid ahead of the fertilizer injectors so calcium never meets phosphate at high pH. RO or blending is another option. Phosphoric acid adds about 0.6 ppm P for each ppm of alkalinity it neutralizes.",
];
const TARGET_NOTE = "Leave 20 ppm for flower and Ripen recipes on either line, and 15 ppm for Veg. At these targets some flower recipes land a little under 5.5; add a small amount of pH Up last to correct that rather than leaving more alkalinity in the water. Always confirm at the dripper with a calibrated meter, and run the low end of your recipe's range on lines above 25 °C.";

/** @param {string | null} value @param {number} fallback @param {number} max */
function num(value, fallback, max) {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
}

/** @param {number} ml */
function formatMl(ml) {
  return ml >= 1000 ? `${(ml / 1000).toFixed(2)} L` : `${ml.toFixed(2)} mL`;
}

/** @param {HTMLElement} root */
export function mount(root) {
  const params = new URLSearchParams(window.location.search);
  initTheme(params);
  const rule = DATA.phDown;
  const state = {
    start: num(params.get("alk"), rule.defaultStartPpm, 999),
    target: num(params.get("target"), rule.defaultTargetPpm, 999),
    volume: num(params.get("vol"), rule.defaultVolumeGal, 1e7),
    unit: params.get("u") === "L" ? "L" : "gal",
  };

  function calc() {
    const gallons = state.unit === "L" ? state.volume / L_PER_GAL : state.volume;
    return phDownDose({ startPpm: state.start, targetPpm: state.target, volumeGal: gallons });
  }

  function syncUrl() {
    const p = new URLSearchParams();
    p.set("alk", String(state.start));
    p.set("target", String(state.target));
    p.set("vol", String(state.volume));
    if (state.unit === "L") p.set("u", "L");
    replaceUrl(p);
  }

  function detail() {
    const d = calc();
    return d.neutralizePpm > 0
      ? `Neutralizing ${d.neutralizePpm} ppm alkalinity (${d.startPpm} → ${d.targetPpm} ppm)`
      : "Nothing to neutralize: the water is at or below the target.";
  }

  function refRows() {
    const d = calc();
    const rows = phDownReference();
    const closest = rows.reduce((a, b) => (Math.abs(b.ppm - d.neutralizePpm) < Math.abs(a.ppm - d.neutralizePpm) ? b : a));
    const on = d.neutralizePpm > 0 && Math.abs(closest.ppm - d.neutralizePpm) <= 10 ? closest.ppm : -1;
    return rows.map(r => ({ ...r, on: r.ppm === on }));
  }

  function resultHtml() {
    const d = calc();
    return `<div class="result__k">pH Down rate</div>
      <div class="result__v">${d.mlPerGal.toFixed(2)}<small>mL/gal</small></div>
      <div class="result__row"><span>Per liter</span><span class="num">${d.mlPerL.toFixed(3)} mL/L</span></div>
      <div class="result__row"><span>Total for ${esc(state.volume)} ${state.unit}</span><span class="num">${formatMl(d.totalMl)}</span></div>
      <p class="result__d">${esc(detail())}</p>`;
  }

  function refHtml() {
    return `<table class="ref"><thead><tr><th>Neutralize</th><th>mL / gal</th><th>mL / L</th></tr></thead><tbody>${refRows().map(r =>
      `<tr${r.on ? ' class="on"' : ""}><td class="num">${r.ppm} ppm</td><td class="num">${r.mlPerGal.toFixed(2)}</td><td class="num">${r.mlPerL.toFixed(3)}</td></tr>`).join("")}</tbody></table>`;
  }

  function render() {
    root.innerHTML = `<div class="app">`
      + barHtml({ root: "", tool: "pH Down", home: "./" })
      + backLinkHtml("All tools")
      + `<h1 class="title">pH Down Calculator</h1><p class="lede">70% phosphoric acid to neutralize source-water alkalinity before feeding.</p>`
      + `<section class="card form">
          <div class="field"><label class="field__label" for="alk">Starting alkalinity</label><span class="input-row"><input class="input" id="alk" data-input="start" type="number" inputmode="decimal" min="0" max="999" step="1" value="${state.start}"><span>ppm</span></span></div>
          <div class="field field--stack"><div class="input-row" style="justify-content:space-between"><label class="field__label" for="target">Target alkalinity</label><span class="input-row"><input class="input" id="target" data-input="target" type="number" inputmode="decimal" min="0" max="999" step="1" value="${state.target}"><span>ppm</span></span></div>
            <div class="seg" style="margin-top:10px" role="group" aria-label="Target presets">
              <button data-target="${rule.defaultTargetPpm}" aria-pressed="${state.target === rule.defaultTargetPpm}">${rule.defaultTargetPpm} ppm · Flower, Ripen</button>
              <button data-target="${rule.vegTargetPpm}" aria-pressed="${state.target === rule.vegTargetPpm}">${rule.vegTargetPpm} ppm · Veg</button>
            </div></div>
          <div class="field"><label class="field__label" for="vol">Batch volume</label><span class="input-row"><input class="input" id="vol" data-input="volume" type="number" inputmode="decimal" min="0" step="1" value="${state.volume}">
            <span class="seg" role="group" aria-label="Volume unit" style="padding:2px"><button data-unit="gal" aria-pressed="${state.unit === "gal"}" style="min-height:30px;padding:2px 10px">gal</button><button data-unit="L" aria-pressed="${state.unit === "L"}" style="min-height:30px;padding:2px 10px">L</button></span></span></div>
        </section>`
      + `<section class="card result" data-result aria-live="polite">${resultHtml()}</section>`
      + `<div class="card note"><span class="note__ic">i</span><div><b>Which target?</b> ${esc(TARGET_NOTE)}</div></div>`
      + `<div class="actions">
          <button class="btn btn--primary" data-act="pdf">${ICONS.pdf}Export PDF</button>
          <button class="btn" data-act="share" aria-label="Share link">${ICONS.link}<span class="btn__label">Share link</span></button>
          <button class="btn" data-act="copy" aria-label="Copy summary">${ICONS.copy}<span class="btn__label">Copy summary</span></button>
        </div>`
      + `<div class="sec"><h2>Quick reference</h2><span class="sec__u">70% phosphoric acid</span></div>`
      + `<section class="card" data-ref>${refHtml()}</section>`
      + `<div class="sec"><h2>How it works</h2></div>`
      + `<section class="card prose">${HOW_IT_WORKS.map(p => `<p>${esc(p)}</p>`).join("")}</section>`
      + footHtml({ contact: "Questions? Contact your Sales Rep or retailer.", back: "All calculator tools" })
      + `</div><div class="print-root" data-print>${sheet()}</div>`;
  }

  // Update results in place so typing keeps focus.
  function update() {
    const result = root.querySelector("[data-result]");
    if (result) result.innerHTML = resultHtml();
    const ref = root.querySelector("[data-ref]");
    if (ref) ref.innerHTML = refHtml();
    root.querySelectorAll("[data-target]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-target")) === state.target)));
    /** @type {HTMLElement} */ (root.querySelector("[data-print]")).innerHTML = sheet();
    syncUrl();
  }

  function sheet() {
    const d = calc();
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const chips = [`Start ${d.startPpm} ppm`, `Target ${d.targetPpm} ppm`, `Batch ${state.volume} ${state.unit}`, "70% phosphoric acid"];
    return `<section class="sheet">`
      + sheetHeadHtml({ root: "", kicker: "pH Down · 70% phosphoric acid", title: "pH Down Dosing", date, chips })
      + `<div class="s-two s-two--even" style="margin-top:14px">
          <div><div class="s-h">Dose</div><table class="s-mini"><tbody>
            <tr><td>Neutralize</td><td class="r num"><b>${d.neutralizePpm} ppm</b></td></tr>
            <tr><td>Rate</td><td class="r num"><b>${d.mlPerGal.toFixed(2)} mL/gal</b></td></tr>
            <tr><td>Per liter</td><td class="r num">${d.mlPerL.toFixed(3)} mL/L</td></tr>
            <tr class="total"><td>Total for ${esc(state.volume)} ${state.unit}</td><td class="r num">${formatMl(d.totalMl)}</td></tr>
          </tbody></table>
          <div class="s-h" style="margin-top:16px">Which target?</div><p class="s-p">${esc(TARGET_NOTE)}</p></div>
          <div><div class="s-h">Quick reference</div><table class="s-mini"><thead><tr><th>Neutralize</th><th class="r">mL / gal</th><th class="r">mL / L</th></tr></thead><tbody>${refRows().map(r =>
            `<tr><td class="num">${r.ppm} ppm</td><td class="r num">${r.mlPerGal.toFixed(2)}</td><td class="r num">${r.mlPerL.toFixed(3)}</td></tr>`).join("")}</tbody></table></div>
        </div>`
      + `<div class="s-block"><div class="s-h">How it works</div>${HOW_IT_WORKS.map(p => `<p class="s-p">${esc(p)}</p>`).join("")}</div>`
      + `<div class="s-notes"><div class="s-h">Notes</div>${sheetLinesHtml()}</div>`
      + sheetFootHtml("tools.frontrowag.com/ph-down-calc.html")
      + `</section>`;
  }

  function summary() {
    const d = calc();
    return [
      "Front Row Ag · pH Down (70% phosphoric acid)",
      `Alkalinity: ${d.startPpm} → ${d.targetPpm} ppm (neutralize ${d.neutralizePpm} ppm)`,
      `Rate: ${d.mlPerGal.toFixed(2)} mL/gal (${d.mlPerL.toFixed(3)} mL/L)`,
      `Total for ${state.volume} ${state.unit}: ${formatMl(d.totalMl)}`,
      "Inject ahead of the fertilizer injectors. Confirm pH at the dripper with a calibrated meter.",
      window.location.href,
    ].join("\n");
  }

  root.addEventListener("input", event => {
    const el = /** @type {HTMLInputElement} */ (event.target);
    const key = el.getAttribute("data-input");
    if (!key) return;
    const n = Number(el.value);
    /** @type {any} */ (state)[key] = Number.isFinite(n) && n >= 0 ? n : 0;
    update();
  });

  root.addEventListener("click", async event => {
    const el = /** @type {HTMLElement} */ (event.target).closest("button");
    if (!el) return;
    const act = el.getAttribute("data-act");
    if (el.hasAttribute("data-target")) {
      state.target = Number(el.getAttribute("data-target"));
      /** @type {HTMLInputElement} */ (root.querySelector("#target")).value = String(state.target);
      update();
    } else if (el.hasAttribute("data-unit")) {
      state.unit = el.getAttribute("data-unit") === "L" ? "L" : "gal";
      render();
      syncUrl();
    } else if (act === "theme") {
      toggleTheme();
      render();
    } else if (act === "pdf") {
      printDocument(`FRA pH Down ${state.start} to ${state.target} ppm`, () => {
        /** @type {HTMLElement} */ (root.querySelector("[data-print]")).innerHTML = sheet();
      });
    } else if (act === "share") {
      const r = await shareUrl(window.location.href, "FRA pH Down");
      if (r === "copied") toast("Link copied");
      else if (r === "failed") toast("Couldn't copy the link");
    } else if (act === "copy") {
      const { copyText } = await import("../../shared/clipboard.js");
      toast((await copyText(summary())) ? "Summary copied" : "Couldn't copy");
    }
  });

  render();
  syncUrl();
}
