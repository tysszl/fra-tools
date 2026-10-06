// Browser check for every page: phone (390) and desktop (1280) screenshots in light and
// dark, Edit sheets open, and exported PDFs, rasterized page by page with pdftoppm for
// review.
//
//   PLAYWRIGHT=<path to a playwright install> bun scripts/check-pages.ts <out-dir>
//
// The team gate is served with a test-only team code, so the check never needs the real one;
// the sealed price list then stays closed and the usage page shows typed prices.
//
// Fails on page errors, console errors, horizontal scroll at phone width, a code screen
// where a tool was expected, or a PDF that is blank or has the wrong page count
// (Feed Chart two, the other tools one), also when printed with .25in margins.
//
// iPhone pass (WebKit, iPhone 15, light and dark): every exported sheet must fit Letter
// minus .5in margins (iOS Safari adds its own print margins), clip no content, and draw
// its notes lines in light gray. WebKit cannot write PDFs, so this measures the print
// layout; it writes a PNG of each dark-mode sheet.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const out = resolve(process.argv[2] ?? "check-pages-out");
mkdirSync(out, { recursive: true });
const { chromium, webkit, devices } = await import(process.env.PLAYWRIGHT ?? "playwright");
const root = resolve(import.meta.dir, "..");
const teamKey = "check-pages";
const djb2 = (s: string) => { let h = 5381; for (const c of s) h = (((h << 5) + h) + c.charCodeAt(0)) >>> 0; return h.toString(16); };

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    const file = Bun.file(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    if (path === "/shared/gate.js") {
      const js = (await file.text()).replace(/team: \{ hash: "[0-9a-f]+"/, `team: { hash: "${djb2(teamKey)}"`);
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
    if (m.type() === "error") problems.push(`${url} ${width} ${scheme}: console ${m.text()}`);
  });
  await page.goto(`${base}/${url}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const withKey = (url: string) => {
  const team = ["usage-calc.html", "feed-calc-admin.html", "team.html", "cplus-calc.html"].some(page => url.startsWith(page));
  return team ? `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(teamKey)}` : url;
};

// Screens
const SCREENS: Array<[string, string]> = [
  ["feed", "feed-calc.html"],
  ["feed-2doser", "feed-calc.html?d=2&phz=yes"],
  ["cplus", "cplus-calc.html"],
  ["admin", "feed-calc-admin.html?m=custom&pa=100&pb=60&pbl=40"],
  ["feed-es", "feed-calc.html?lang=es&phup=yes&bf=yes&tri=yes"],
  ["hub", "index.html"],
  ["team", "team.html"],
  ["cplus-team-custom", "cplus-calc.html?m=custom&pa=150&pb=75&pbl=100&tv=75"],
  ["hub-es", "index.html?lang=es"],
  ["phup", "ph-up-calc.html"],
  ["phup-cplus-stock", "ph-up-calc.html?line=cplus&mode=stock&alk=25&warm=1"],
  ["phdown", "ph-down-calc.html"],
  ["usage", "usage-calc.html"],
  ["usage-quick-addons", "usage-calc.html?m=q&ft=24000&phz=1&tri=1&si=1&b=cplus"],
  ["usage-advanced", "usage-calc.html?m=a"],
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
for (const [name, url] of [["cplus-gate", "cplus-calc.html"], ["usage-gate", "usage-calc.html"], ["admin-gate", "feed-calc-admin.html"], ["team-gate", "team.html"]]) {
  const { page, context } = await open(url, 390, "light");
  if (!(await page.locator("[data-gate]").count())) problems.push(`${name}: opened without a code`);
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
  ["cplus-team-custom", "cplus-calc.html?m=custom&pa=150&pb=75&pbl=100&tv=75"],
  ["spanish", "feed-calc.html?lang=es&m=1-1-1&p=standard&fac=Granja%20Norte"],
  ["phup-dtr", "ph-up-calc.html", 1],
  ["phup-cplus-stock", "ph-up-calc.html?line=cplus&mode=stock&conc=100&unit=pct&alk=25&warm=1", 1],
  ["phdown", "ph-down-calc.html?alk=140&target=20&vol=500", 1],
  ["usage", "usage-calc.html?tri=1&tvg=1000&tfg=5000&phz=1", 1],
  ["usage-quick-customer", "usage-calc.html?m=q&pm=customer&ft=10000&phz=1&tri=1&si=1&fac=Green%20Valley%20Farms&rep=Sample%20Rep", 1],
  ["usage-quick-internal", "usage-calc.html?m=q&ft=10000", 1],
  ["usage-customer", "usage-calc.html?pm=customer&tri=1&tvg=1000&tfg=5000&phz=1&si=1&sig=200&alk=10&fac=Northern%20California%20Cultivation%20Cooperative%20%26%20Partners%20Greenhouse%20Range%20B&rep=Sample%20Rep", 1],
  ["usage-customer-cplus-metric", "usage-calc.html?pm=customer&b=cplus&u=metric&p=standard&rs=swell-flower&phz=1&tri=1&tvg=1000&tfg=5000", 1],
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
  // A printer or phone that adds its own margins must not push a sheet onto a second page.
  await page.addStyleTag({ content: "@page { size: letter; margin: .25in !important; }" });
  const narrow = join(out, `${name}-margin25.pdf`);
  await page.pdf({ path: narrow, preferCSSPageSize: true, printBackground: true });
  const narrowPages = Number((spawnSync("pdfinfo", [narrow]).stdout?.toString() ?? "").match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  if (narrowPages !== expected) problems.push(`${name}: PDF with .25in margins has ${narrowPages} pages, expected ${expected}`);
  await context.close();
}

await browser.close();

// iPhone print layout
const phone = await webkit.launch();
for (const [name, url, , setup] of PDFS) for (const scheme of ["light", "dark"] as const) {
  const context = await phone.newContext({ ...devices["iPhone 15"], colorScheme: scheme });
  const page = await context.newPage();
  page.on("pageerror", (e: Error) => problems.push(`iphone ${name} ${scheme}: ${e.message}`));
  await page.goto(`${base}/${withKey(url)}`, { waitUntil: "networkidle" });
  if (setup) await setup(page);
  await page.emulateMedia({ media: "print", colorScheme: scheme });
  await page.setViewportSize({ width: 720, height: 960 }); // Letter's width less .5in margins
  await page.waitForTimeout(150);
  const sheets = await page.evaluate(() => [...document.querySelectorAll(".print-root .sheet")].map(sheet => {
    const box = sheet.getBoundingClientRect();
    let clipped = 0;
    sheet.querySelectorAll("*").forEach(el => {
      if (el.closest(".s-lines")) return; // spare ruled rows are clipped by design
      const r = el.getBoundingClientRect();
      if (r.height) clipped = Math.max(clipped, r.bottom - box.bottom, r.right - box.right);
    });
    const rule = sheet.querySelector(".s-lines i");
    return { w: box.width / 96, h: box.height / 96, clipped, rule: rule ? getComputedStyle(rule).borderBottomColor : "" };
  }));
  if (!sheets.length) problems.push(`iphone ${name} ${scheme}: no print sheets`);
  sheets.forEach((s, i) => {
    const at = `iphone ${name} ${scheme} sheet ${i + 1}`;
    if (s.w > 7.5 || s.h > 10) problems.push(`${at}: ${s.w.toFixed(2)} x ${s.h.toFixed(2)} in does not fit Letter less .5in margins`);
    if (s.clipped > 0.5) problems.push(`${at}: content runs ${Math.round(s.clipped)}px past the sheet`);
    if (s.rule && s.rule !== "rgb(227, 230, 228)") problems.push(`${at}: notes lines print as ${s.rule}`);
  });
  if (scheme === "dark") {
    await page.setViewportSize({ width: 1000, height: 1400 });
    const count = await page.locator(".print-root .sheet").count();
    for (let i = 0; i < count; i++) await page.locator(".print-root .sheet").nth(i).screenshot({ path: join(out, `iphone-${name}-dark-${i + 1}.png`) });
  }
  await context.close();
}
await phone.close();
server.stop();
console.log(`Wrote ${out}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
