// Browser check for the Feed Chart pages: phone (390) and desktop (1280) screenshots in
// light and dark, the Edit sheet open, and exported PDFs for a matrix of charts,
// rasterized page by page with pdftoppm for review.
//
//   PLAYWRIGHT=<path to a playwright install> CPLUS_KEY=<access code> \
//     bun scripts/check-pages.ts <out-dir>
//
// Fails on page errors, console errors, horizontal scroll at phone width, or a PDF
// that is not exactly two pages.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const out = resolve(process.argv[2] ?? "check-pages-out");
mkdirSync(out, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const root = resolve(import.meta.dir, "..");
const key = process.env.CPLUS_KEY ?? "";

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    const file = Bun.file(join(root, path === "/" ? "index.html" : path));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});
const base = `http://localhost:${server.port}`;
const problems: string[] = [];
const browser = await chromium.launch();

async function open(url: string, width: number, scheme: "light" | "dark") {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await context.newPage();
  page.on("pageerror", (e: Error) => problems.push(`${url} ${width} ${scheme}: ${e.message}`));
  page.on("console", (m: any) => { if (m.type() === "error") problems.push(`${url} ${width} ${scheme}: console ${m.text()}`); });
  await page.goto(`${base}/${url}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const withKey = (url: string) => (url.startsWith("cplus-calc.html") && key ? `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}` : url);

// Screens
const SCREENS: Array<[string, string]> = [
  ["feed", "feed-calc.html"],
  ["feed-2doser", "feed-calc.html?d=2&phz=yes"],
  ["cplus", "cplus-calc.html"],
  ["admin", "feed-calc-admin.html?m=custom&pa=100&pb=60&pbl=40"],
  ["feed-es", "feed-calc.html?lang=es&phup=yes&bf=yes&tri=yes"],
];
for (const [name, url] of SCREENS) {
  for (const width of [390, 1280]) for (const scheme of ["light", "dark"] as const) {
    const { page, context } = await open(withKey(url), width, scheme);
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
{
  const { page, context } = await open("cplus-calc.html", 390, "light");
  await page.screenshot({ path: join(out, "cplus-gate-390.png") });
  await context.close();
}

// PDFs
const PDFS: Array<[string, string]> = [
  ["3part-stock-high", "feed-calc.html?fac=Green%20Valley%20Farms"],
  ["3part-2doser", "feed-calc.html?d=2&phz=yes"],
  ["3part-dtr-metric", "feed-calc.html?a=direct&u=g%2FL&phz=yes"],
  ["cplus-stock", "cplus-calc.html?fac=Green%20Valley%20Farms"],
  ["cplus-2doser", "cplus-calc.html?d=2&phz=yes&fp=near-ripen"],
  ["admin-custom", "feed-calc-admin.html?m=custom&pa=100&pb=60&pbl=40&tv=40&u=mL%2FL"],
  ["spanish", "feed-calc.html?lang=es&m=1-1-1&p=standard&fac=Granja%20Norte"],
];
for (const [name, url] of PDFS) {
  const { page, context } = await open(withKey(url), 1280, "light");
  await page.emulateMedia({ media: "print" });
  const pdf = join(out, `${name}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const info = spawnSync("pdfinfo", [pdf]).stdout?.toString() ?? "";
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  if (pages !== 2) problems.push(`${name}: PDF has ${pages} pages`);
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
