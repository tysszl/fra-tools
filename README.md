# fra-tools

Internal repo for Front Row Ag customer-facing calculator tools. Hosted via GitHub Pages at `tools.frontrowag.com`.

## Tools

- **feed-calc.html** — Feed calculator (stock concentrate + direct-to-reservoir modes)
- **ph-up-calc.html** — pH Up dosing calculator (consolidated from separate repo)
- **ph-down-calc.html** — pH Down dosing calculator
- **cost-calc.html** — Cost comparison calculator (internal, not yet customer-facing)
- **usage-calc.html** — Usage/consumption calculator (internal, not yet customer-facing)

## Hosting

- GitHub Pages serves from `main` branch root
- CNAME: `tools.frontrowag.com`
- DNS: CNAME record `tools` → `tysszl.github.io` (managed in Squarespace)
- Old `phup.frontrowag.com` redirects here via the `fra-phup-calculator` repo

## Publishing

Edit the HTML file, commit, and push. Changes go live in ~1 minute.

## Conventions

- **Single-file HTML.** Inline CSS and JS, no build steps. Each tool is self-contained.
- **Recipe tool UX.** When Tyler asks for "custom inputs" on recipes, he means selecting from fixed presets per phase — not editing raw percentages.

## Assets

- **logo.png** — Used in print/PDF header