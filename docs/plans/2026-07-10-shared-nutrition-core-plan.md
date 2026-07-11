---
title: Shared Nutrition Core - Plan
type: refactor
date: 2026-07-10
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Shared Nutrition Core - Plan

## Goal Capsule

Move FRA's line constants, recipe fractions, dosage equation, and PhosZyme target adjustment into one canonical source while preserving each calculator as a deployable single-file HTML page.

FRA's internal `docs/feed-recipes.md` and `docs/technical-standards.md` authorize nutrient values. `src/nutrition-core.js` is the sole implementation source for those approved values across the web calculators. An approved standards change must update the internal documents, the core, and the approval-snapshot tests together before synchronization. Existing calculator-specific presentation, pricing, scheduling, and stock-tank configuration remain local.

Stop if the migration requires a runtime network dependency, a deployment build step, or a change to approved recipe values beyond correcting direct-to-reservoir PhosZyme to its documented fixed 0.4 g/gal and 0.088 EC contribution.

## Product Contract

### Summary

Add a maintenance-time nutrition core that is mechanically embedded in all four nutrition calculators. Add executable parity checks so drift is detected before a calculator can be shipped.

### Requirements

- R1. `src/nutrition-core.js` is the only manually edited implementation source for shared 3-Part and Component Plus EC-per-gram values, recipe fractions, field dosing conversions, dosage math, and PhosZyme target adjustment.
- R2. `feed-calc.html`, `cplus-calc.html`, `usage-calc.html`, and `cost-calc.html` remain self-contained HTML files with an identical generated copy of the core and no runtime external dependency.
- R3. A deterministic sync command updates generated blocks in all four calculators, and check mode exits nonzero when any embedded copy differs from the canonical source.
- R4. Shared calculator behavior calls the embedded core instead of maintaining local copies of covered constants or formulas.
- R5. Direct-to-reservoir PhosZyme uses a fixed 0.4 g/gal rate, contributes 0.088 EC, and reduces the base-fertilizer target by 0.088 EC without going below zero.
- R6. Stock-injected PhosZyme remains proportional to the carrier part and scales the base-fertilizer target so the final EC equals the requested target.
- R7. Automated tests execute the real inline scripts and prove source parity and behavioral parity across applicable calculators.
- R8. Approval-snapshot tests enumerate the values authorized by `docs/feed-recipes.md` and `docs/technical-standards.md`, so changing a shared nutrient value requires a deliberate test-contract update rather than passing through synchronization alone.
- R9. Both feed calculators preserve the PhosZyme selection when switching between stock and direct application, immediately recompute all visible and generated outputs with the correct application equation, and warn when fixed-dose PhosZyme makes a requested DTR target below 0.088 EC unattainable.

### Acceptance Examples

- AE1. Given a 3.0 EC Swell direct-to-reservoir target with PhosZyme enabled, the 3-Part and C+ feed calculators calculate base fertilizer against 2.912 EC and report PhosZyme as 0.4 g/gal contributing 0.088 EC.
- AE2. Given an approved Swell-fraction change recorded in the FRA standards, updating the core and approval snapshot and then running `bun scripts/sync-nutrition-core.ts --write` updates every embedded copy; changing only one HTML copy makes sync check fail.
- AE3. Given the same line, recipe, product, and target EC, feed-chart dosage and usage-estimator dosage resolve through the same pure dose equation.
- AE4. Given DTR application, PhosZyme enabled, and a target below 0.088 EC, both feed calculators show zero base-fertilizer target, a minimum achievable final EC of 0.088, and a warning that the requested target cannot be met at the fixed rate.

### Scope Boundaries

- Keep pricing, exact package/pricing conversions (`453.592 g/lb`, `3785.41 mL/gal`), UI state, color metadata, product package defaults, schedules, tank concentrations, and competitor recipes local to their calculator. Shared field dosing conversions remain `454 g/lb`, `3785 mL/gal`, and `3.785 L/gal`.
- Do not convert the site to modules, add bundling, or change GitHub Pages deployment.
- Do not merge or publish to `main` as part of this plan; push the reviewed feature branch for explicit landing approval.

## Planning Contract

### Key Technical Decisions

- KTD1. The canonical core is a browser-safe IIFE assigned to `FRA_NUTRITION_CORE`; this lets the same source execute directly in Bun tests and inside classic inline browser scripts.
- KTD2. Generated blocks are delimited by stable comments. `bun scripts/sync-nutrition-core.ts --write` replaces the complete block, `--check` verifies it, and the script performs no other HTML transformation.
- KTD3. The core stores deeply frozen field-facing line data and exposes cached, deeply frozen role adapters where feed calculators use `partA`, `partB`, and `bloom`; calculators may compose new local configuration objects but never mutate canonical or adapter data.
- KTD4. PhosZyme adjustment is application-aware: direct application subtracts the fixed contribution, while stock application uses the existing proportional carrier equation.
- KTD5. Generated HTML is committed. The sync tool is a maintenance guard, not a production build requirement.

### High-Level Technical Design

```text
src/nutrition-core.js
        |
        v
scripts/sync-nutrition-core.ts --write/--check
        |
        +--> feed-calc.html
        +--> cplus-calc.html
        +--> usage-calc.html
        +--> cost-calc.html
                    |
                    v
         tests execute inline scripts and compare contracts
```

### Risks and Mitigations

- A source copy can be manually edited in HTML; `--check` and the test suite fail on that drift.
- A shared object can be mutated by calculator state; the core deeply freezes canonical data and role adapters, while calculators compose separate local objects around those references.
- DTR and stock PhosZyme have intentionally different equations; test both applications separately in both feed calculators.
- A synchronized core can still carry the wrong approved value; approval-snapshot tests independently enumerate the standards-authorized constants and recipes.

## Implementation Units

### U1. Canonical core and synchronization contract

- **Goal:** Establish the manually maintained source and deterministic embedding workflow.
- **Requirements:** R1, R2, R3, R8
- **Files:** `src/nutrition-core.js`, `scripts/sync-nutrition-core.ts`, `tests/calculator-math.test.ts`
- **Approach:** Add source-parity tests first and observe failure, then add the browser-safe core and marker replacement tool.
- **Test scenarios:** Check mode passes after sync; editing one generated byte causes check mode to fail; every target has exactly one generated block; the core matches the standards-authorized approval snapshot.
- **Verification:** `bun scripts/sync-nutrition-core.ts --check`; `bun test tests/calculator-math.test.ts`

### U2. Calculator migration and PhosZyme correction

- **Goal:** Make all applicable nutrition math consume the embedded core and correct DTR PhosZyme semantics.
- **Requirements:** R4, R5, R6, R9
- **Files:** `feed-calc.html`, `cplus-calc.html`, `usage-calc.html`, `cost-calc.html`, `src/nutrition-core.js`
- **Dependencies:** U1
- **Approach:** Replace covered local data and formulas with core references while retaining calculator-specific configuration. Use one application-aware base-target helper at all existing PhosZyme-adjusted dose call sites. Derive both the FRA Swell and `C+ SWELL (Pallet)` cost entries from the core at 3.0 EC, retaining local display names and a `Calcium` to `CaNO3` adapter.
- **Test scenarios:** 3-Part and C+ DTR at 3.0 EC use 2.912 base EC plus 0.088 PhosZyme EC; a DTR target below 0.088 reports an unattainable target consistently; stock mode retains proportional final-EC correction; 3-Part cost and usage Swell doses match `feed-calc.html`; C+ cost and usage Swell doses match `cplus-calc.html`.
- **Verification:** `bun test tests/calculator-math.test.ts`

### U3. Durable parity gates and operator documentation

- **Goal:** Make future drift easy to detect and the update procedure obvious.
- **Requirements:** R3, R7, R8, R9
- **Files:** `tests/calculator-math.test.ts`, `README.md`
- **Dependencies:** U1, U2
- **Approach:** Expand runtime extraction to all four calculators, assert the complete line × recipe × product parity matrix through each calculator's live calculation path, statically reject covered local numeric tables/formulas outside the generated block, and document approve-then-edit-then-sync-then-test workflow.
- **Test scenarios:** Inline blocks equal canonical source; all shared dose results and role mappings match across applicable calculators; malformed or missing generated markers fail clearly; covered constants and equations cannot be redeclared locally; all calculator scripts parse and execute in the test harness.
- **Verification:** `bun scripts/sync-nutrition-core.ts --check`; `bun test`

## Verification Contract

- Run `bun scripts/sync-nutrition-core.ts --check` to prove generated source parity.
- Run `bun test` to prove math, URL behavior, DTR/stock PhosZyme behavior, and cross-calculator parity.
- Verify the current official Excel master uses the documented 0.4 g/gal and 0.088 EC DTR rule for both lines; if it differs, stop and scope that counterpart update before claiming cross-surface parity.
- Parse every HTML script with the existing runtime harness. In a browser at desktop and mobile widths, verify all four initial renders and calculations; in both feed calculators, verify recipe changes and the stock → DTR → stock round trip with PhosZyme already enabled, including rates, EC totals, warnings, instructions, print/copy output, and no console errors; in usage and cost calculators, verify both line/recipe selections where available.
- Run `git diff --check` and confirm only plan-scoped files changed.
- Run the Compound Engineering code-review pass and resolve all applicable findings before push.

## Definition of Done

- U1 is done when one canonical core can deterministically populate and verify all four calculators.
- U2 is done when covered math no longer has independent editable copies and DTR/stock PhosZyme each match FRA's documented equation.
- U3 is done when tests fail on source or behavior drift and README documents the maintenance workflow.
- All verification gates pass, browser checks show no regression, abandoned approaches are absent from the diff, and the feature branch is committed and pushed without merging to `main`.
