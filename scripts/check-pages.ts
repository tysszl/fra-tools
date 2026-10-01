// Browser check for every page: phone (390) and desktop (1280) screenshots in light and
// dark, Edit sheets open, and exported PDFs, rasterized page by page with pdftoppm for
// review.
//
//   PLAYWRIGHT=<path to a playwright install> CPLUS_KEY=<C+ code> bun scripts/check-pages.ts <out-dir>
//
// The usage page is served with a test-only team code, so the check never needs the real one.
//
// Fails on page errors, console errors, horizontal scroll at phone width, a code screen
// where a tool was expected, or a PDF that is blank or has the wrong page count
// (Feed Chart two, the other tools one).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const out = resolve(process.argv[2] ?? "check-pages-out");
mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const root = resolve(import.meta.dir, "..");
const key = process.env.CPLUS_KEY ?? "";
const teamKey = "check-pages";
const djb2 = (s: string) => { let h = 5381; for (const c of s) h = (((h << 5) + h) + c.charCodeAt(0)) >>> 0; return h.toString(16); };

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    const file = Bun.file(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    if (path === "/src/pages/usage.js") {
      const js = (await file.text()).replace(/const GATE_HASH = "[0-9a-f]+";/, `const GATE_HASH = "${djb2(teamKey)}";`);
      return new Response(js, { headers: { "content-type": "text/javascript" } });
    }
    return new Response(file);
  },
});
const base = `http://localhost:${server.port}`;
const problems: string[] = [];
const browser = await chromium.launch();

async function open(url: string, width: number, scheme: "light" | "dark") {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await context.newPage();
  page.on("pageerror", (e: Error) => problems.push(`${url} ${width} ${scheme}: ${e.message}`));
  page.on("console", (m: any) => {
    // The usage page probes for an optional, untracked prices.json.
    if (m.type() === "error" && !String(m.location()?.url ?? "").endsWith("/prices.json")) problems.push(`${url} ${width} ${scheme}: console ${m.text()}`);
  });
  await page.goto(`${base}/${url}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const withKey = (url: string) => {
  const code = url.startsWith("cplus-calc.html") ? key : url.startsWith("usage-calc.html") ? teamKey : "";
  return code ? `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(code)}` : url;
};

// Screens
const SCREENS: Array<[string, string]> = [
  ["feed", "feed-calc.html"],
  ["feed-2doser", "feed-calc.html?d=2&phz=yes"],
  ["cplus", "cplus-calc.html"],
  ["admin", "feed-calc-admin.html?m=custom&pa=100&pb=60&pbl=40"],
  ["feed-es", "feed-calc.html?lang=es&phup=yes&bf=yes&tri=yes"],
  ["hub", "index.html"],
  ["hub-es", "index.html?lang=es"],
  ["phup", "ph-up-calc.html"],
  ["phup-cplus-stock", "ph-up-calc.html?line=cplus&mode=stock&alk=25&warm=1"],
  ["phdown", "ph-down-calc.html"],
  ["usage", "usage-calc.html"],
  ["usage-cplus", "usage-calc.html?b=cplus&phz=1&tri=1&tvg=1000&tfg=5000&si=1&sig=200&alk=10"],
  ["calhypo", "cal-hypo/"],
];
for (const [name, url] of SCREENS) {
  for (const width of [390, 1280]) for (const scheme of ["light", "dark"] as const) {
    const { page, context } = await open(withKey(url), width, scheme);
    if (await page.locator("[data-gate]").count()) problems.push(`${name} ${width} ${scheme}: stopped at the access-code screen`);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (scroll > 0) problems.push(`${name} ${width} ${scheme}: horizontal scroll ${scroll}px`);
    await page.screenshot({ path: join(out, `${name}-${width}-${scheme}.png`), fullPage: true });
    if (scheme === "light" || width === 390) {
      const edit = page.locator("[data-act=edit]");
      if (await edit.count()) {
        await edit.click();
        await page.waitForTimeout(350);
        await page.screenshot({ path: join(out, `${name}-${width}-${scheme}-edit.png`) });
      }
    }
    await context.close();
  }
}
for (const [name, url] of [["cplus-gate", "cplus-calc.html"], ["usage-gate", "usage-calc.html"]]) {
  const { page, context } = await open(url, 390, "light");
  await page.screenshot({ path: join(out, `${name}-390.png`) });
  await context.close();
}

// PDFs
const PDFS: Array<[string, string, number?, ((page: any) => Promise<void>)?]> = [
  ["3part-stock-high", "feed-calc.html?fac=Green%20Valley%20Farms"],
  ["3part-2doser", "feed-calc.html?d=2&phz=yes"],
  ["3part-dtr-metric", "feed-calc.html?a=direct&u=g%2FL&phz=yes"],
  ["cplus-stock", "cplus-calc.html?fac=Green%20Valley%20Farms"],
  ["cplus-2doser", "cplus-calc.html?d=2&phz=yes&fp=near-ripen"],
  ["admin-custom", "feed-calc-admin.html?m=custom&pa=100&pb=60&pbl=40&tv=40&u=mL%2FL"],
  ["spanish", "feed-calc.html?lang=es&m=1-1-1&p=standard&fac=Granja%20Norte"],
  ["phup-dtr", "ph-up-calc.html", 1],
  ["phup-cplus-stock", "ph-up-calc.html?line=cplus&mode=stock&conc=100&unit=pct&alk=25&warm=1", 1],
  ["phdown", "ph-down-calc.html?alk=140&target=20&vol=500", 1],
  ["usage", "usage-calc.html?tri=1&tvg=1000&tfg=5000&phz=1", 1],
  ["calhypo", "cal-hypo/", 1],
  ["usage-legacy", "usage-calc.html?b=fra&ve=2&vw=2&vg=1000&fe=2&fw=4&fg=10000&ai=1111&tvg=100&tfg=500", 1],
  ["calhypo-fert", "cal-hypo/", 1, async page => {
    await page.locator("details:has(#treatment-point) > summary").click();
    await page.selectOption("#treatment-point", "fertilizer-concentrate");
    const target = (await page.locator("#direct-target").isVisible()) ? "#direct-target" : "#stock-target";
    await page.fill(target, "5");
    await page.locator(target).dispatchEvent("input");
    await page.waitForTimeout(100);
  }],
];
for (const [name, url, expected = 2, setup] of PDFS) {
  const { page, context } = await open(withKey(url), 1280, "light");
  if (setup) await setup(page);
  await page.emulateMedia({ media: "print" });
  const pdf = join(out, `${name}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const info = spawnSync("pdfinfo", [pdf]).stdout?.toString() ?? "";
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  const words = (spawnSync("pdftotext", [pdf, "-"]).stdout?.toString() ?? "").split(/\s+/).filter(Boolean).length;
  if (words < 80) problems.push(`${name}: PDF has only ${words} words of text`);
  if (pages !== expected) problems.push(`${name}: PDF has ${pages} pages, expected ${expected}`);
  spawnSync("pdftoppm", ["-png", "-r", "110", pdf, join(out, name)]);
  await context.close();
}

await browser.close();
server.stop();
console.log(`Wrote ${out}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
