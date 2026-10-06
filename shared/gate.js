// @ts-check
// Access codes: friction, not security. The site is public static HTML; a code keeps a page
// out of casual view. Each code is kept only as the djb2 hash of its trimmed, lowercased text.
// To rotate one, hash the new code with gateHash(), replace its hash here, and update the
// Notion Team Tools page.
import { readStored, writeStored } from "./storage.js";

/** @typedef {"team"} GateName */

/** team: the team portal, Feed Chart team mode, Component Plus and usage. */
export const GATES = {
  team: { hash: "d1c47d4d", storage: "fra-team-key" },
};

/** @param {string | null | undefined} value */
export function gateNorm(value) { return (value || "").trim().toLowerCase(); }

/** @param {string} value */
export function gateHash(value) {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = (((h << 5) + h) + value.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** @param {GateName} name @param {string | null | undefined} code */
export function gateMatches(name, code) { return Boolean(code) && gateHash(gateNorm(code)) === GATES[name].hash; }

/**
 * Checks a typed code against the named gates and stores it under the first it opens.
 * @param {GateName[]} names
 * @param {string | null | undefined} code
 * @returns {{ name: GateName, code: string } | null}
 */
export function gateUnlock(names, code) {
  const name = names.find(n => gateMatches(n, code));
  if (!name) return null;
  writeStored(GATES[name].storage, gateNorm(code));
  return { name, code: gateNorm(code) };
}

/**
 * The code that opens this page, from ?key= first, then from storage.
 * @param {GateName[]} names
 * @param {URLSearchParams} params
 * @returns {{ name: GateName, code: string } | null}
 */
export function gateFind(names, params) {
  const fromUrl = gateUnlock(names, params.get("key"));
  if (fromUrl) return fromUrl;
  for (const name of names) {
    const saved = readStored(GATES[name].storage);
    if (gateMatches(name, saved)) return { name, code: gateNorm(saved) };
  }
  return null;
}
