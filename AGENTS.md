# AGENTS.md

Public GitHub Pages repo for Front Row Ag calculator tools at `tools.frontrowag.com`.

## Production

- This repo is public: do not add internal FRA docs, customer or staff names, private notes, prices, secrets, or unpublished strategy. The one exception is `usage-prices.enc.json`: the usage price list sealed with the team code. Change prices by editing the plaintext outside the repo (`~/.local/state/fra/prices.json`) and running `FRA_TEAM_CODE=… bun scripts/encrypt-prices.ts <plaintext>`; re-run it whenever the team code rotates.
- GitHub Pages serves `main` from the repo root with `CNAME` set to `tools.frontrowag.com`. Pushing to `main` updates production in about a minute.

## Local Context

- Internal FRA context lives at `/Users/tyler/claude-projects/FRA`.
- Read `/Users/tyler/claude-projects/FRA/docs/technical-standards.md` and `/Users/tyler/claude-projects/FRA/docs/feed-recipes.md` before changing calculator logic or feed/math assumptions.
- Read `/Users/tyler/claude-projects/FRA/docs/writing-voice.md` before changing customer-facing copy.

## Tooling

- No build step. Each page is a small HTML shell that loads ES modules from `shared/` (styles, theme, i18n, print, share links) and `src/` (engine and page code).
- `src/engine/` holds every number and calculation; each number names its source in `sources.js`. Screen, copied summary and PDF render from the same computed rows.
- `src/feedchart/mixing-art.js` is generated from the internal diagram source (`output/diagram-svg/export-fra-tools.mjs` in the FRA repo); do not edit it here.
- `tests/fixtures/legacy/` are frozen copies of the pre-rebuild pages. `tests/engine-parity.test.ts` compares the engine against them and names every intended difference. `src/nutrition-core.js` and `scripts/sync-nutrition-core.ts` only maintain those fixtures.
- Access codes (C+ and team) live in `shared/gate.js` as hashes; the team code opens `team.html`, Feed Chart team mode, C+ and usage. C+ share links carry only the C+ code, never the team code.
- Old share links must keep opening the same chart: `src/feedchart/url.js` decodes them, and the usage page maps the old `ve`/`fe`/`fw`/`ai` fields.
- Run `bun test`, then `PLAYWRIGHT=<playwright install with chromium and webkit> CPLUS_KEY=<C+ code> bun scripts/check-pages.ts <out-dir>` and look at every screenshot and PDF page it writes before pushing.
- Print sheets fit Letter less .5in margins (at most 7.5 x 10in) and use no gradients and no dark tokens, because iOS Safari prints with its own margins and renders transparent gradient stops as black; `tests/print-css.test.ts` and the check-pages iPhone pass enforce this.
