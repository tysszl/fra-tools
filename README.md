# fra-tools

Front Row Ag calculator tools, hosted on GitHub Pages at `tools.frontrowag.com`.

## Tools

- `index.html`: tool hub (English and Spanish)
- `feed-calc.html`: Feed Chart, 3-Part (stock concentrate and direct to reservoir; 2 or 3 dosers)
- `cplus-calc.html`: Feed Chart, Component Plus (C+ access code, or the team code)
- `team.html`: team portal (team code; noindex)
- `feed-calc-admin.html`: Feed Chart, team mode (custom stock strength; team code)
- `ph-up-calc.html`: pH Up dosing per feed-chart column
- `ph-down-calc.html`: phosphoric acid for source-water alkalinity
- `cal-hypo/`: calcium hypochlorite (DryTec) stock and direct dosing
- `usage-calc.html`: usage estimate (team code, noindex); Quick mode from flowering canopy, Advanced for the full chart; prices in `usage-prices.enc.json`, sealed with the team code
- `cost-calc.html`: retired stub; `cal-hypo-calc.html`: redirects to `cal-hypo/`

## Hosting

- GitHub Pages serves the `main` branch root; `CNAME` is `tools.frontrowag.com`.
- DNS: CNAME `tools` → `tysszl.github.io` (Squarespace).
- `phup.frontrowag.com` redirects here via the `fra-phup-calculator` repo.

## Working on it

See `AGENTS.md`. Pages need no build step; serve the repo root with any static server to try them.
