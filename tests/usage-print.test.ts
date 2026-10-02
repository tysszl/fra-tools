// Usage estimate PDF: customer mode keeps prices and model internals off the page unless
// prices are turned on; both modes print engine numbers in the chosen units.
import { describe, expect, test } from "bun:test";
import { DATA, usageCost, usageEstimate, usagePurchase } from "../src/engine/index.js";
import { assumptions, renderUsagePrint } from "../src/pages/usage-print.js";

const inputs = {
  vegWeeks: 2, vegGalPerWeek: 1000, flowerGalPerWeek: 10000, phoszyme: true, phUp: true, alk: 10,
  triologic: true, triVeg: 1000, triFlower: 5000, si: true, siGal: 200, siRate: 2,
};
function view(over: Record<string, any> = {}) {
  const lineId = over.lineId ?? "3part";
  const est = usageEstimate({
    lineId, ec: DATA.ecPresets.high, vegWeeks: 2, vegGalPerWeek: 1000, flowerWeeks: DATA.usage.defaults.flowerWeeks, flowerGalPerWeek: 10000,
    phoszyme: true, phUp: true, alkPpm: 10, triologic: true, triologicVegGalPerWeek: 1000, triologicFlowerGalPerWeek: 5000, si: true, siFoliarGal: 200, siMlPerGal: 2,
  });
  const prices = { "Part A": 111.11, "Part B": 111.11, Bloom: 99.99, CaNO3: 33.33, "C+": 88.88, MKP: 44.44 };
  return {
    mode: "customer" as const, root: "", est, cost: usageCost(est, prices, 5), purchase: usagePurchase(est, 5), metric: false, showPrices: false, prices,
    lineLabel: lineId === "cplus" ? "Component Plus" : "3-Part", lineId, strengthLabel: "High strength", strengthPhrase: "high strength",
    scheduleLabel: "Commercial (Stack → Swell)", facility: "Green Valley Farms", preparedBy: "Alex Rep", date: "Oct 2, 2026", notes: "Line 1\nLine 2 <b>",
    inputs, ...over,
  };
}

describe("usage PDF", () => {
  test("customer mode: no prices, no pH Up model internals, contact line and assumptions", () => {
    const html = renderUsagePrint(view());
    expect(html).not.toContain("$");
    expect(html).not.toContain("111.11");
    expect(html).not.toMatch(/refit|bench check|g\/gal<\/th>|Internal/);
    expect(html).toContain("Prepared for <b>Green Valley Farms</b>");
    expect(html).toContain("Prepared by <b>Alex Rep</b>");
    expect(html).toContain("order@solsticeag.com");
    expect(html).toContain("Line 2 &lt;b&gt;");
    expect(html).toContain("Annual product order");
    const v = view();
    for (const p of v.purchase.products) expect(html).toContain(`${p.perYearWholeUnits} ${p.liquid ? "jug" : "bag"}`);
    expect(html).toContain("460,000 gal");
  });

  test("customer mode with prices turned on prints price and cost per year from the engine", () => {
    const v = view({ showPrices: true });
    const html = renderUsagePrint(v);
    expect(html).toContain("$111.11");
    expect(html).toContain(`$${v.cost.perYear.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  });

  test("internal mode keeps cost, pH Up by stage and the model notes", () => {
    const html = renderUsagePrint(view({ mode: "internal", lineId: "cplus" }));
    expect(html).toContain("pH Up g/gal");
    expect(html).toContain("C+ pH Up curves are modeled only");
    expect(html).toContain("$88.88");
    expect(html).toContain("not for customers");
  });

  test("metric prints liters and kilograms from the engine's unit constants", () => {
    const v = view({ metric: true });
    const html = renderUsagePrint(v);
    expect(html).toContain(`${(92000 * 3.785).toLocaleString("en-US", { maximumFractionDigits: 0 })} L`);
    expect(html).toContain("25 lb bag (11.35 kg)");
    expect(html).toMatch(/\d kg</);
    expect(html).not.toMatch(/\d gal</);
  });

  test("assumptions name every included additive at its documented rate", () => {
    const a = assumptions(view()).join(" ");
    expect(a).toContain(`PhosZyme at ${DATA.phoszyme.directGramsPerGallon} g/gal`);
    expect(a).toContain(`Triologic at ${DATA.usage.triologicMlPerTreatedGal} mL/gal, once a week`);
    expect(a).toContain("foliar spray only");
    expect(a).toContain("10 ppm alkalinity as CaCO3");
    const off = assumptions(view({ inputs: { ...inputs, phoszyme: false, phUp: false, triologic: false, si: false } })).join(" ");
    expect(off).not.toMatch(/PhosZyme|pH Up|Triologic|Si /);
  });

  test("a long facility name stays one escaped string", () => {
    const long = "Northern California Cultivation Cooperative & Partners — Greenhouse Range B";
    const html = renderUsagePrint(view({ facility: long }));
    expect(html).toContain("Cooperative &amp; Partners");
  });
});
