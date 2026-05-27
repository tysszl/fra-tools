# CLAUDE.md

Public GitHub Pages repo for Front Row Ag calculator tools at `tools.frontrowag.com`.

## Production

- This repo is public: do not add internal FRA docs, customer details, private notes, secrets, or unpublished strategy.
- GitHub Pages serves `main` from the repo root with `CNAME` set to `tools.frontrowag.com`.
- Pushing to `main` updates production, usually within about a minute.

## Local Context

- Internal FRA context lives at `/Users/tyler/claude-projects/FRA`.
- Read `/Users/tyler/claude-projects/FRA/docs/technical-standards.md` and `/Users/tyler/claude-projects/FRA/docs/feed-recipes.md` before changing calculator logic or feed/math assumptions.
- Read `/Users/tyler/claude-projects/FRA/docs/writing-voice.md` before changing customer-facing copy.

## Tooling

- Tools are single-file HTML with inline CSS/JS and no build step.
- Verify changed tools in a browser before pushing.
