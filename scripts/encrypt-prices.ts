// Seals the usage estimator price list with the team code and writes usage-prices.enc.json.
//
//   FRA_TEAM_CODE=<team code> bun scripts/encrypt-prices.ts ~/.local/state/fra/prices.json
//
// The plaintext stays outside the repo. Read the code into the environment from a script
// or vault; never type it on a command line or write it into a file here. Re-run after
// any price change or team-code rotation. Shape of the plaintext:
//   { "tiers": [{ "id", "label", "line": "3part" | "cplus", "additives": "<additive tier id>",
//                 "prices": { "<product>": <$ per package> } }],
//     "additiveTiers": [{ "id", "label", "prices": { "<product>": <$ per package> } }] }
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gateMatches } from "../shared/gate.js";
import { PRICE_FILE, normalizePriceList, openPrices, sealPrices } from "../src/pages/usage-prices.js";

const source = process.argv[2];
const code = process.env.FRA_TEAM_CODE ?? "";
if (!source) throw new Error("usage: FRA_TEAM_CODE=… bun scripts/encrypt-prices.ts <plaintext prices.json>");
if (!gateMatches("team", code)) throw new Error("FRA_TEAM_CODE does not match the team gate in shared/gate.js");

const root = resolve(import.meta.dir, "..");
const path = resolve(source);
if (path.startsWith(`${root}/`)) throw new Error("Keep the plaintext price list outside the repo");

const plain = JSON.parse(readFileSync(path, "utf8"));
const list = normalizePriceList(plain);
if (!list.tiers.length) throw new Error("No valid tiers in the plaintext");
const sealed = await sealPrices(list, code);
if (JSON.stringify(await openPrices(sealed, code)) !== JSON.stringify(list)) throw new Error("Round trip failed");
writeFileSync(resolve(root, PRICE_FILE), `${JSON.stringify(sealed, null, 2)}\n`);
console.log(`Wrote ${PRICE_FILE}: ${list.tiers.length} tiers, ${list.additiveTiers.length} additive tiers`);
