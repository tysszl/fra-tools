// @ts-check
// Public tool hub: the customer tools, light/dark, English/Spanish.
import { initTheme, toggleTheme } from "../../shared/theme.js";
import { initialLang, saveLang, translator } from "../../shared/i18n.js";
import { ICONS, barHtml, esc, footHtml } from "../../shared/chrome.js";

const STRINGS = {
  en: {
    "title": "Calculator Tools",
    "lede": "Feed charts and pH dosing for Front Row Ag nutrients.",
    "feed.n": "Feed Chart",
    "feed.tag": "3-Part",
    "feed.d": "Stock tank recipes, injection rates and mixing steps for every phase. Print it or save a PDF.",
    "phup.n": "pH Up",
    "phup.d": "Target pH and pH Up dose for each column of your feed chart, with a credit for source-water alkalinity.",
    "phdown.n": "pH Down",
    "phdown.d": "Phosphoric acid needed to bring source-water alkalinity down to the target before feeding.",
    "cplus.k": "For C+ program customers",
    "cplus.n": "Component Plus Feed Chart",
    "cplus.tag": "Access code",
    "cplus.d": "The feed chart for the Component Plus line. Your rep gives you the access code.",
    "foot.contact": "Questions about your chart? Contact your Sales Rep or retailer.",
    "lang.label": "Ver en español",
    "theme.label": "Switch light or dark theme",
    "doc.title": "Calculator Tools · Front Row Ag",
  },
  es: {
    "title": "Herramientas de cálculo",
    "lede": "Tablas de alimentación y dosificación de pH para los nutrientes de Front Row Ag.",
    "feed.n": "Tabla de alimentación",
    "feed.tag": "3-Part",
    "feed.d": "Recetas de tanques de stock, tasas de inyección y pasos de mezcla para cada fase. Imprímala o guárdela en PDF.",
    "phup.n": "pH Up",
    "phup.d": "pH objetivo y dosis de pH Up para cada columna de su tabla, con un crédito por la alcalinidad del agua de origen. (En inglés)",
    "phdown.n": "pH Down",
    "phdown.d": "Ácido fosfórico necesario para bajar la alcalinidad del agua de origen al objetivo antes de alimentar. (En inglés)",
    "cplus.k": "Para clientes del programa C+",
    "cplus.n": "Tabla de alimentación Component Plus",
    "cplus.tag": "Código de acceso",
    "cplus.d": "La tabla de alimentación de la línea Component Plus. Su representante le da el código de acceso.",
    "foot.contact": "¿Preguntas sobre su tabla? Contacte a su representante de ventas o distribuidor.",
    "lang.label": "View in English",
    "theme.label": "Cambiar tema claro u oscuro",
    "doc.title": "Herramientas de cálculo · Front Row Ag",
  },
};

/** @param {HTMLElement} root */
export function mount(root) {
  const params = new URLSearchParams(window.location.search);
  initTheme(params);
  let lang = initialLang(params);

  function render() {
    const t = translator(STRINGS, lang);
    document.documentElement.lang = lang;
    document.title = t("doc.title");
    /** @param {string} href @param {string} key @param {boolean} [tag] */
    const tool = (href, key, tag = false) => `<a class="card tool" href="${href}">
        <span class="tool__n">${esc(t(`${key}.n`))}${tag ? `<span class="tool__tag">${esc(t(`${key}.tag`))}</span>` : ""}</span>
        <span class="tool__d">${esc(t(`${key}.d`))}</span>
        <span class="tool__go" aria-hidden="true">${ICONS.arrow}</span></a>`;
    root.innerHTML = `<div class="app">`
      + barHtml({ root: "", lang: { lang, label: t("lang.label") }, themeLabel: t("theme.label") })
      + `<h1 class="title">${esc(t("title"))}</h1><p class="lede">${esc(t("lede"))}</p>`
      + `<nav class="hub">${tool("feed-calc.html", "feed", true)}${tool("ph-up-calc.html", "phup")}${tool("ph-down-calc.html", "phdown")}</nav>`
      + `<p class="hub__k">${esc(t("cplus.k"))}</p>`
      + `<nav class="hub" style="margin-top:10px">${tool("cplus-calc.html", "cplus", true)}</nav>`
      + footHtml({ contact: t("foot.contact") })
      + `</div>`;
  }

  root.addEventListener("click", event => {
    const target = /** @type {HTMLElement} */ (event.target);
    const act = target.closest("[data-act]")?.getAttribute("data-act");
    if (act === "theme") { toggleTheme(); render(); }
    if (act === "lang") { lang = lang === "en" ? "es" : "en"; saveLang(lang); render(); }
  });
  render();
}
