// @ts-check
// Usage estimator price list, sealed with the team code. The repo holds only
// usage-prices.enc.json: AES-GCM ciphertext under a key derived from the team code with
// PBKDF2 (SHA-256, random salt). scripts/encrypt-prices.ts writes it from a plaintext
// list kept outside the repo. Without the team code the page falls back to typed prices.
import { gateNorm } from "../../shared/gate.js";

export const PRICE_FILE = "usage-prices.enc.json";
export const PBKDF2_ITERATIONS = 310000;

/**
 * @typedef {object} PriceTier
 * @property {string} id
 * @property {string} label
 * @property {"3part" | "cplus"} line
 * @property {string} additives      Default additive tier id for this tier.
 * @property {Record<string, number>} prices
 */
/**
 * @typedef {object} PriceList
 * @property {PriceTier[]} tiers
 * @property {Array<{ id: string, label: string, prices: Record<string, number> }>} additiveTiers
 */
/**
 * @typedef {object} SealedPrices
 * @property {1} v
 * @property {string} kdf
 * @property {number} iterations
 * @property {string} salt   base64
 * @property {string} iv     base64
 * @property {string} data   base64 ciphertext with the GCM tag
 */

/** @param {Uint8Array} bytes */
function toB64(bytes) {
  let s = "";
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}
/** @param {string} b64 */
function fromB64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/** @param {string} code @param {Uint8Array} salt @param {number} iterations */
async function deriveKey(code, salt, iterations) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(gateNorm(code)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/**
 * @param {unknown} value
 * @param {string} code
 * @param {number} [iterations]
 * @returns {Promise<SealedPrices>}
 */
export async function sealPrices(value, code, iterations = PBKDF2_ITERATIONS) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt, iterations);
  const data = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value))));
  return { v: 1, kdf: "PBKDF2-SHA256/AES-256-GCM", iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

/**
 * The decrypted value, or null when the code is wrong or the payload is damaged.
 * @param {SealedPrices} sealed
 * @param {string} code
 * @returns {Promise<unknown>}
 */
export async function openPrices(sealed, code) {
  try {
    const key = await deriveKey(code, fromB64(sealed.salt), sealed.iterations);
    const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv) }, key, fromB64(sealed.data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

/** @param {unknown} map @returns {Record<string, number>} */
function priceMap(map) {
  /** @type {Record<string, number>} */
  const out = {};
  if (map && typeof map === "object") {
    for (const [name, value] of Object.entries(map)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) out[name] = n;
    }
  }
  return out;
}

/**
 * Validates a decrypted price list; anything malformed is dropped.
 * @param {any} data
 * @returns {PriceList}
 */
export function normalizePriceList(data) {
  const tiers = (Array.isArray(data?.tiers) ? data.tiers : [])
    .filter((/** @type {any} */ t) => t && typeof t.id === "string" && typeof t.label === "string" && (t.line === "3part" || t.line === "cplus"))
    .map((/** @type {any} */ t) => ({ id: t.id, label: t.label, line: t.line, additives: typeof t.additives === "string" ? t.additives : "", prices: priceMap(t.prices) }));
  const additiveTiers = (Array.isArray(data?.additiveTiers) ? data.additiveTiers : [])
    .filter((/** @type {any} */ t) => t && typeof t.id === "string" && typeof t.label === "string")
    .map((/** @type {any} */ t) => ({ id: t.id, label: t.label, prices: priceMap(t.prices) }));
  return { tiers, additiveTiers };
}

/**
 * Fetches and opens the sealed price list. Any failure (missing file, wrong code)
 * returns an empty list, and the page keeps typed prices.
 * @param {string} code
 * @param {(url: string) => Promise<{ ok: boolean, json(): Promise<any> }>} [fetcher]
 * @returns {Promise<PriceList>}
 */
export async function loadPriceList(code, fetcher = url => fetch(url, { cache: "no-cache" })) {
  try {
    const res = await fetcher(PRICE_FILE);
    if (!res.ok) return { tiers: [], additiveTiers: [] };
    return normalizePriceList(await openPrices(await res.json(), code));
  } catch {
    return { tiers: [], additiveTiers: [] };
  }
}

/**
 * Prices by product name for a base tier plus an additive tier. Products the tiers
 * don't price (pH Up) are null. An empty list gives no prices.
 * @param {PriceList} list
 * @param {string} tierId
 * @param {string} additiveTierId
 * @param {string[]} productNames
 * @returns {Record<string, number | null> | null}  null when the tier is unknown.
 */
export function tierPrices(list, tierId, additiveTierId, productNames) {
  const tier = list.tiers.find(t => t.id === tierId);
  if (!tier) return null;
  const adds = list.additiveTiers.find(t => t.id === additiveTierId)?.prices ?? {};
  return Object.fromEntries(productNames.map(name => [name, tier.prices[name] ?? adds[name] ?? null]));
}
