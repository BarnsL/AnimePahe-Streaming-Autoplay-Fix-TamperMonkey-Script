# AnimePahe Homepage -> Episode 1 Redirect Fix - Completion Report

## Addendum: Background Playback for Discord Streaming (v2.0.2)

New request addressed: keep playback running when focus/visibility changes during Discord streaming.

Implemented in `animepahe-autonext-v2.user.js`:

1. Bumped userscript version from `2.0.1` to `2.0.2`.
2. Added `BACKGROUND_PLAYBACK_GUARD` toggle constant.
3. Added kwik-side `ensureBackgroundPlayback(reason)` helper.
4. Added listeners on `pause`, `visibilitychange`, and `blur` to auto-resume only for background-triggered pauses.
5. Preserved manual pause behavior while focused (`userPausedManually` guard).

README updates:

1. Version updated to `2.0.2`.
2. Added "Background Playback Guard (Discord Streaming)" section with behavior and limitations.

## Task Summary
Implemented and documented a routing fix so homepage series clicks that land on series pages or episode article pages are redirected to Episode 1 of that same series.

Target scenario provided by user:

- Homepage URL: https://animepahe.ch/
- Example clicked item: https://animepahe.ch/needy-girl-overdose-episode-6-english-subbed/
- Expected behavior: resolve and navigate to Episode 1 for that series.

## Root Cause

Homepage card links on current animepahe.ch often use episode article routes (`/<slug>-episode-<n>-.../`) instead of legacy `/anime/<slug>/` routes.

The previous logic:

1. Captured episode-1 intent only for `/anime/<slug>` destinations.
2. Matched episode-1 intent only by exact destination path.
3. Looked for episode-1 links mostly through `/play/`-style anchors.

Result: clicks from homepage "Latest Release" cards did not trigger episode-1 redirect intent reliably.

## Code Changes

### File: animepahe-autonext-v2.user.js

1. Version bump:
   - `@version` changed from `2.0.0` to `2.0.1`.

2. New storage key:
   - Added `animepahe_autonext_open_episode_one_target_series`.
   - Stores normalized series slug for broader intent matching.

3. New helpers:
   - `extractSeriesSlugFromPath(pathLike)`
     - Supports `/series/<slug>`, `/anime/<slug>`, and `/<slug>-episode-<n>-...` patterns.
   - `getCurrentSeriesSlug()`
     - Derives series slug from current path, with fallback to `/series/` links in DOM.

4. Intent marking changes:
   - `markEpisodeOneIntent(targetPath)` now stores:
     - normalized destination path
     - normalized destination series slug

5. Intent matching changes:
   - `hasEpisodeOneIntentForCurrentPage()` now succeeds when either:
     - current path equals stored target path, or
     - current page series slug equals stored target series slug.

6. Referral bootstrap changes:
   - `shouldBootstrapEpisodeOneFromHomepageReferral()` now recognizes:
     - `/series/<slug>`
     - `/anime/<slug>`
     - `/play/...`
     - `/<slug>-episode-<n>-...`

7. Homepage click capture changes:
   - `captureEpisodeOneIntentFromHomepageClick()` now accepts destinations for:
     - `/series/<slug>`
     - `/anime/<slug>`
     - `/<slug>-episode-<n>-...`

8. Episode-1 resolution changes:
   - `findEpisodeOneLink()` now scans both:
     - `/play/` episode links
     - `-episode-` article links
   - Candidate links are filtered to the active series slug when available.
   - Exact Episode 1 is preferred; otherwise lowest detected episode number is used.

9. Intent cleanup changes:
   - `clearEpisodeOneIntent()` now clears series-slug key in addition to previous keys.

## Documentation Updates

### File: README.md

Updated with:

1. Current script version (`2.0.1`).
2. Expanded "Homepage Click -> Episode 1 Behavior" section describing modern route support.
3. Added "2026-05-10 reliability fix" section with concrete behavioral changes.
4. Added storage key docs for the episode-1 intent keys, including the new series-slug key.

## Verification Performed

### Browser structure validation

Validated current site routing patterns in the provided scenario:

1. Homepage cards include episode article URLs (example Needy Girl Overdose Episode 6).
2. Episode article page includes per-series episode list with Episode 1 present.
3. Series routes use `/series/<slug>/` paths.

### Script syntax validation

Executed:

- `node --check animepahe-autonext-v2.user.js`

Result:

- No syntax errors reported.

### Authorship verification

- Git local config in this repo resolves to: `mikutellyourworld <mikutellyourworld@github.com>`.

## Expected Behavior After Update

From homepage clicks (including `...-episode-6-...` style links):

1. Script stores episode-1 intent keyed by both path and series slug.
2. On landing page load, script resolves Episode 1 candidate links for that same series.
3. Script navigates to Episode 1.
4. Existing autoplay handoff logic continues as before.

## Deployment Status

Code and docs updated locally, ready for git commit and push.
