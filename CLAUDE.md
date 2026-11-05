# Slabby 2.0 — project instructions

Slabby is an iOS app for Pokémon graded-card collectors who buy slabs as holds and sell at conventions. Read this file first, then PRODUCT.md, DESIGN.md, TECH.md, and SLAB_ASSET_BRIEF.md. The reference-screens/ folder holds the approved concept screens; match them.

## What we are building (one line)

A premium, minimal vault for graded cards that tells you, before you walk up to a table, what to ask and the lowest you'll go — with a real PSA slab render as the hero of every screen.

## Non-negotiables

- Light mode is the default. White canvas, black buttons, hairlines. No boxes-on-boxes, no borders on cards, no gradients, no uppercase tracked labels, no emoji.
- One decision per screen. One primary button. Secondary actions are quiet text or live in a `…` menu.
- Quick information first; detail behind a tap ("More stats", "6 eBay sales ›").
- Numbers are tabular (`font-variant-numeric: tabular-nums`). Green/red only on numbers, never on chrome.
- The slab is the user's real slab (PSA/BGS/CGC), never a Slabby-branded slab. Label text comes from PSA data, never baked into an image.
- Prices come from real comps (eBay sold for graded, TCGplayer market for raw). Never from Collectr.
- Pricing rules (ask, floor, buy target, max buy) are user settings with per-card overrides. "Never sell at a loss" is on by default.

## Stack

Expo (React Native, TypeScript), Expo Router, Supabase (Postgres, Auth, Storage), react-native-skia for slab compositing, react-native-reanimated for motion, expo-camera for QR. See TECH.md.

## How to work in this project

- Build screen by screen in the order in PRODUCT.md. Ship Phase 1 (con-weekend MVP) before touching Phase 2.
- Before writing a screen, open its PNG in reference-screens/ and match spacing, type sizes, and hierarchy from DESIGN.md.
- Keep all design tokens in `src/theme/tokens.ts`. No hardcoded colors or sizes in components.
- Pricing math lives in `src/pricing/rules.ts` and is pure and unit-tested. Screens never compute prices.
- PSA lookups go through `src/services/psa.ts` with cache-first behavior (see TECH.md). Never call PSA from a screen.
- Mock data lives in `src/mocks/`; every screen must render with mocks before any network code.
- Commit small. One screen or one service per PR.

## Out of scope for v1

Android, social features, marketplace listings, multi-user vaults, raw-card condition grading, BGS/CGC scanning (PSA QR only in v1; others added manually).
