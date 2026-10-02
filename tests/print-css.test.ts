// Print sheets must fit one Letter page on iPhone. iOS Safari prints with its own margins
// (up to about .5in), so a sheet sized to the full 8.5 x 11in paper spills onto a blank
// page; and it renders a gradient's transparent stops as black, so ruled lines must be
// borders. Print also always uses the light tokens, whatever the phone's theme.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sheetLinesHtml } from "../shared/chrome.js";

const css = readFileSync(join(import.meta.dir, "../shared/fra.css"), "utf8");
const printStart = css.indexOf("/* ================= print: Letter sheets");
const printCss = css.slice(printStart);

/** @returns {Record<string, string>} declarations of the first rule with exactly this selector */
function rule(selector: string, source = css) {
  const match = source.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`));
  if (!match) throw new Error(`no rule ${selector}`);
  return Object.fromEntries(match[2].split(";").map(d => d.split(":").map(s => s.trim())).filter(d => d[0]).map(([k, ...v]) => [k, v.join(":")]));
}
const inches = (value: string) => {
  const m = value.match(/^([\d.]+)in$/);
  if (!m) throw new Error(`not inches: ${value}`);
  return Number(m[1]);
};

describe("print sheet", () => {
  test("print CSS block is found", () => {
    expect(printStart).toBeGreaterThan(0);
  });

  test("a sheet fits Letter minus .5in margins on every side", () => {
    const sheet = rule(".sheet");
    expect(inches(sheet.width)).toBeLessThanOrEqual(7.5);
    expect(inches(sheet.height)).toBeLessThan(10);
    expect(sheet["max-width"]).toBe("100%");
  });

  test("no full-paper or viewport heights in print styles", () => {
    expect(printCss).not.toMatch(/\b11in\b/);
    expect(printCss).not.toMatch(/\b8\.5in\b/);
    expect(printCss).not.toMatch(/\d+vh\b/);
  });

  test("@page keeps .5in margins rather than full bleed", () => {
    expect(printCss).toMatch(/@page \{ size: letter; margin: \.5in; \}/);
  });

  test("print sheets use no gradients", () => {
    expect(printCss).not.toMatch(/gradient\(/);
  });

  test("ruled notes lines are bordered rows, not a background", () => {
    expect(sheetLinesHtml()).toMatch(/^<div class="s-lines">(<i><\/i>)+<\/div>$/);
    expect(rule(".s-lines i", printCss)["border-bottom"]).toBe("1px solid #e3e6e4");
  });

  test("dark tokens apply on screen only", () => {
    const at = css.indexOf(':root[data-theme="dark"] {');
    expect(css.lastIndexOf("@media not print {", at)).toBeGreaterThan(-1);
    expect(css.slice(css.lastIndexOf("@media not print {", at), at)).not.toContain("}");
  });
});
