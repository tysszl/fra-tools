// @ts-check
// Key-based strings. Each page passes its dictionaries: { en: {...}, es: {...} }.
// Values may hold {name} placeholders.
import { readStored, writeStored } from "./storage.js";

export const LANGS = /** @type {const} */ (["en", "es"]);
const KEY = "fra-feed-lang";

/** @typedef {"en" | "es"} Lang */
/** @typedef {Record<string, string>} Dictionary */

/** @param {unknown} value @returns {Lang | null} */
export function validLang(value) {
  return value === "en" || value === "es" ? value : null;
}

/** `?lang=` wins, then the saved choice, then English. */
/** @param {URLSearchParams} [params] @returns {Lang} */
export function initialLang(params = new URLSearchParams(window.location.search)) {
  return validLang(params.get("lang")) ?? validLang(readStored(KEY)) ?? "en";
}

/** @param {Lang} lang */
export function saveLang(lang) {
  writeStored(KEY, lang);
}

/**
 * @param {Record<Lang, Dictionary>} dictionaries
 * @param {Lang} lang
 */
export function translator(dictionaries, lang) {
  const dict = dictionaries[lang];
  const fallback = dictionaries.en;
  /**
   * @param {string} key
   * @param {Record<string, string | number>} [vars]
   */
  return function t(key, vars) {
    let text = dict[key] ?? fallback[key];
    if (text === undefined) throw new Error(`Missing string: ${key}`);
    if (vars) text = text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
    return text;
  };
}

/**
 * Keys present in one language and missing in another.
 * @param {Record<string, Dictionary>} dictionaries
 */
export function missingKeys(dictionaries) {
  const langs = Object.keys(dictionaries);
  const all = new Set(langs.flatMap(lang => Object.keys(dictionaries[lang])));
  /** @type {string[]} */
  const missing = [];
  all.forEach(key => langs.forEach(lang => {
    if (!(key in dictionaries[lang])) missing.push(`${lang}:${key}`);
  }));
  return missing;
}
