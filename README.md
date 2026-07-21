# fra-tools

Internal repo for Front Row Ag customer-facing calculator tools. Hosted via GitHub Pages at `tools.frontrowag.com`.

## Tools

- **feed-calc.html** — Feed calculator (stock concentrate + direct-to-reservoir modes)
- **ph-up-calc.html** — pH Up dosing calculator (consolidated from separate repo)
- **ph-down-calc.html** — pH Down dosing calculator
- **cost-calc.html** — Cost comparison calculator (internal, not yet customer-facing)
- **usage-calc.html** — Usage/consumption calculator (internal, not yet customer-facing)
- **cal-hypo/** — Unlisted internal calcium hypochlorite stock and direct-dose calculator

## Hosting

- GitHub Pages serves from `main` branch root
- CNAME: `tools.frontrowag.com`
- DNS: CNAME record `tools` → `tysszl.github.io` (managed in Squarespace)
- Old `phup.frontrowag.com` redirects here via the `fra-phup-calculator` repo

## Publishing

For ordinary page changes, edit the HTML file, commit, and push. For shared nutrition math, edit `src/nutrition-core.js` and use the sync workflow below. Changes pushed to `main` go live in ~1 minute.

## Conventions

- **Single-file HTML.** Inline CSS and JS, no build steps. Each tool is self-contained.
- **Recipe tool UX.** When Tyler asks for "custom inputs" on recipes, he means selecting from fixed presets per phase — not editing raw percentages.

## Shared nutrition math

`src/nutrition-core.js` is the only implementation source for shared 3-Part and Component Plus recipes, EC-per-gram values, field dosing conversions, dose math, and PhosZyme EC adjustment. The approved values originate in FRA's internal `docs/feed-recipes.md` and `docs/technical-standards.md`; update those standards, the core, and the approval snapshot in `tests/calculator-math.test.ts` together.

The calculator pages stay self-contained. After changing the core, embed it into all four nutrition calculators and verify parity:

```bash
bun scripts/sync-nutrition-core.ts --write
bun scripts/sync-nutrition-core.ts --check
bun test
```

Do not hand-edit content between the `BEGIN GENERATED: nutrition-core` and `END GENERATED: nutrition-core` markers. Exact package conversions used only for pricing remain local to `cost-calc.html`; the shared core uses FRA's documented field conversions.

## Assets

- **logo.png** — Used in print/PDF header
