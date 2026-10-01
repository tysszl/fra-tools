// @ts-check
// Light/dark theme. A `?t=` param wins, then the saved choice, then the system setting.
import { readStored, writeStored } from "./storage.js";

const KEY = "fra-theme";
// Pre-rebuild feed pages saved here; read once so a returning user keeps their choice.
const LEGACY_KEY = "fra-feed-theme";

/** @returns {"light" | "dark"} */
function systemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** @param {unknown} value @returns {"light" | "dark" | null} */
function valid(value) {
  return value === "light" || value === "dark" ? value : null;
}

/** @returns {"light" | "dark"} */
export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** @param {"light" | "dark"} theme */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0c0e0e" : "#f6f7f6");
}

/** @param {URLSearchParams} [params] */
export function initTheme(params = new URLSearchParams(window.location.search)) {
  const theme = valid(params.get("t")) ?? valid(readStored(KEY)) ?? valid(readStored(LEGACY_KEY)) ?? systemTheme();
  applyTheme(theme);
  return theme;
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  writeStored(KEY, next);
  return next;
}
