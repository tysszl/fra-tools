# fra-tools

Front Row Ag calculator tools, hosted on GitHub Pages at `tools.frontrowag.com`.

## Tools

- `index.html`: tool hub (English and Spanish)
- `feed-calc.html`: Feed Chart, 3-Part (stock concentrate and direct to reservoir; 2 or 3 dosers)
- `cplus-calc.html`: Feed Chart, Component Plus (access code)
- `feed-calc-admin.html`: Feed Chart, team mode (custom stock strength)
- `ph-up-calc.html`: pH Up dosing per feed-chart column
- `ph-down-calc.html`: phosphoric acid for source-water alkalinity
- `cal-hypo/`: calcium hypochlorite (DryTec) stock and direct dosing
- `usage-calc.html`: usage estimate for the team (team code, noindex)
- `cost-calc.html`, `cal-hypo-calc.html`: retired stubs that redirect

## Hosting

- GitHub Pages serves the `main` branch root; `CNAME` is `tools.frontrowag.com`.
- DNS: CNAME `tools` → `tysszl.github.io` (Squarespace).
- `phup.frontrowag.com` redirects here via the `fra-phup-calculator` repo.

## Working on it

See `AGENTS.md`. Pages need no build step; serve the repo root with any static server to try them.
