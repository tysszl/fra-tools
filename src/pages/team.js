// @ts-check
// Team portal: one team code opens the team tools (Feed Chart team mode, Component Plus,
// usage estimate). The code is stored, so each tool opens without asking again.
import { initTheme, toggleTheme } from "../../shared/theme.js";
import { gateFind, gateUnlock } from "../../shared/gate.js";
import { ICONS, barHtml, esc, footHtml } from "../../shared/chrome.js";

const TOOLS = [
  ["feed-calc-admin.html", "Feed Chart · Team mode", "3-Part charts with custom stock strength and tank size, for building a customer's chart."],
  ["cplus-calc.html", "Component Plus Feed Chart", "The C+ program chart. The team code adds custom stock strength and tank size; customers open it with the C+ access code from their rep."],
  ["usage-calc.html", "Usage Estimate", "Product per cycle for a customer's feed chart, column by column, with pH Up and additives."],
];

/** @param {HTMLElement} root */
export function mount(root) {
  const params = new URLSearchParams(window.location.search);
  initTheme(params);
  if (gateFind(["team"], params)) portal(); else gate();

  function gate() {
    root.innerHTML = `<main class="gate"><div class="card gate__card">
      <img class="bar__logo bar__logo--light" src="assets/feed-chart/logo-dark.png" alt="Front Row Ag"><img class="bar__logo bar__logo--dark" src="assets/feed-chart/logo-white.png" alt="Front Row Ag">
      <h1>Front Row Ag · Team Tools</h1>
      <p>Calculators for the Front Row Ag team. Enter the team code from the Notion Team Tools page.</p>
      <form data-gate><input class="input" name="code" placeholder="Team code" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Team code">
      <button class="btn btn--primary" type="submit">Open Team Tools</button></form>
      <p class="gate__err" hidden>That code didn't match. The team code is on the Notion Team Tools page.</p>
      <p class="gate__foot"><a href="./">Customer calculator tools</a></p>
    </div></main>`;
    const form = /** @type {HTMLFormElement} */ (root.querySelector("[data-gate]"));
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = /** @type {HTMLInputElement} */ (form.elements.namedItem("code")).value;
      if (gateUnlock(["team"], value)) portal();
      else /** @type {HTMLElement} */ (root.querySelector(".gate__err")).hidden = false;
    });
  }

  function portal() {
    const tool = ([href, name, desc]) => `<a class="card tool" href="${href}">
        <span class="tool__n">${esc(name)}</span><span class="tool__d">${esc(desc)}</span>
        <span class="tool__go" aria-hidden="true">${ICONS.arrow}</span></a>`;
    root.innerHTML = `<div class="app">`
      + barHtml({ root: "", home: "./" })
      + `<h1 class="title">Team Tools</h1><p class="lede">For the Front Row Ag team. Don't share this page or the team code with customers.</p>`
      + `<nav class="hub">${TOOLS.map(tool).join("")}</nav>`
      + `<p class="hub__k">Customer tools</p><p class="lede" style="margin-top:6px"><a href="./">tools.frontrowag.com</a>: Feed Chart, pH Up, pH Down, calcium hypochlorite.</p>`
      + footHtml({})
      + `</div>`;
  }

  root.addEventListener("click", event => {
    const act = /** @type {HTMLElement} */ (event.target).closest("[data-act]")?.getAttribute("data-act");
    if (act === "theme") { toggleTheme(); portal(); }
  });
}
