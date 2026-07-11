import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const sourcePath = join(root, "src/nutrition-core.js");
const targets = ["feed-calc.html", "cplus-calc.html", "usage-calc.html", "cost-calc.html"];
const startMarker = "// BEGIN GENERATED: nutrition-core";
const endMarker = "// END GENERATED: nutrition-core";
const source = readFileSync(sourcePath, "utf8").trimEnd();
const generatedBlock = `${startMarker}\n${source}\n${endMarker}`;

const writeMode = process.argv.includes("--write");
const checkMode = process.argv.includes("--check");
if (writeMode === checkMode) {
  throw new Error("Use exactly one mode: --write or --check");
}

function replaceGeneratedBlock(fileName: string, html: string) {
  const startCount = html.split(startMarker).length - 1;
  const endCount = html.split(endMarker).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(`${fileName} must contain exactly one nutrition-core marker pair`);
  }
  const start = html.indexOf(startMarker);
  const endStart = html.indexOf(endMarker);
  if (start < 0 || endStart <= start + startMarker.length) {
    throw new Error(`${fileName} has malformed or reversed nutrition-core markers`);
  }
  const end = endStart + endMarker.length;
  return `${html.slice(0, start)}${generatedBlock}${html.slice(end)}`;
}

const drifted: string[] = [];
for (const fileName of targets) {
  const path = join(root, fileName);
  const current = readFileSync(path, "utf8");
  const expected = replaceGeneratedBlock(fileName, current);
  if (current === expected) continue;
  drifted.push(fileName);
  if (writeMode) writeFileSync(path, expected);
}

if (checkMode && drifted.length) {
  console.error(`Nutrition core is out of sync: ${drifted.join(", ")}`);
  process.exitCode = 1;
} else if (writeMode) {
  console.log(drifted.length ? `Updated: ${drifted.join(", ")}` : "Nutrition core already synchronized");
}
