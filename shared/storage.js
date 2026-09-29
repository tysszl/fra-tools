// @ts-check
// localStorage that never throws: private windows and blocked site data read as empty.

/** @param {string} key */
export function readStored(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

/** @param {string} key @param {string} value */
export function writeStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
