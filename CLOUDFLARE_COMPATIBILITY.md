# Cloudflare Verification RCA and Compatibility Contract

## Executive summary

AnimePahe AutoNext version 2.0.8 initialized on Cloudflare's verification document because the challenge was served at the same `https://animepahe.pw/` URL covered by the userscript's `@match` rule.

The visible `AutoNext ON` badge on the verification page was direct evidence that the controller reached its normal AnimePahe initialization path. That path patches browser history, installs listeners, starts timers, reads redirect/autoplay state, and mutates the DOM. These actions are appropriate on AnimePahe, but they violate the isolation expected by a Cloudflare challenge and can contribute to a stalled or repeated verification flow.

Version 2.0.9 fixes the defect by classifying the document before `main()` runs. A recognized challenge causes an immediate no-op return. The fix does not automate, solve, or bypass Cloudflare; it leaves the verification document under Cloudflare's exclusive control.

## Incident evidence

Observed on 2026-07-28:

- URL: `https://animepahe.pw/`
- Browser title: `Just a moment...`
- Visible copy: `Verifying you are human`
- Visible footer attribution: `Performance and Security by Cloudflare`
- Unexpected userscript UI: `AutoNext ON`
- Installed userscript: `AnimePahe - Auto-Next & Autoplay Fix v2`, version 2.0.8

The repository's version 2.0.8 source matched the installed script metadata and initialization behavior.

## User impact

Confirmed impact:

- The userscript modified a security verification page that it did not own.
- The AutoNext badge appeared over the verification UI.
- AnimePahe remained at the verification step instead of reaching the site.

Plausible mechanisms for the observed instability:

- persistent DOM mutation through initial and delayed badge injection;
- patched `history.pushState` and `history.replaceState`;
- a permanent one-second URL polling interval;
- autoplay and episode-one bootstrap timers when short-lived state survived a prior page;
- message and navigation listeners attached to the challenge document.

The badge proves controller initialization, but it does not by itself identify which individual side effect caused Cloudflare to remain on the challenge. The root defect is broader and deterministic: none of those side effects should exist on the challenge document.

## Root cause

### Direct cause

Version 2.0.8 routed by hostname only:

1. Tampermonkey matched `https://animepahe.pw/*`.
2. The script rejected non-AnimePahe hosts.
3. Because the Cloudflare page still used `animepahe.pw`, the host check passed.
4. The full AnimePahe controller initialized.

### Why metadata exclusions were insufficient

An `@exclude` rule can filter a distinct URL such as `/cdn-cgi/*`, but Cloudflare can serve the challenge shell at the requested root or episode URL. The security document and the real site can therefore have the same origin, path, and query-independent match pattern.

Document classification is required in addition to URL matching.

### Contributing factors

- The initialization contract assumed every supported AnimePahe hostname represented the AnimePahe application.
- Badge injection was used as a normal availability signal on every matching page.
- Bootstrap logic used persisted one-shot state and could start before page ownership was proven.
- There was no automated test asserting zero side effects on third-party interstitial documents.
- Error reporting itself could inject a fatal panel if initialization failed on an interstitial.

## Five-whys summary

1. Why did AutoNext appear on Cloudflare? The full controller ran on the verification document.
2. Why did the controller run? The document hostname matched a supported AnimePahe domain.
3. Why was hostname matching insufficient? Cloudflare served the challenge at the requested AnimePahe URL.
4. Why did the script not distinguish the documents? Version 2.0.8 had no pre-initialization document classifier.
5. Why was this not caught earlier? Tests covered playback and redirect behavior, but not interstitial ownership and zero-side-effect behavior.

## Corrective action in version 2.0.9

The userscript now calls `isCloudflareChallengeDocument()` before entering the `try` block and before calling `main()`.

The classifier is restricted to supported AnimePahe hosts and evaluates signals in this order:

1. `/cdn-cgi` path: always treated as Cloudflare-owned.
2. Strong challenge shell markers:
   - `#challenge-running`
   - `#challenge-stage`
   - `#cf-challenge-running`
   - `form#challenge-form`
   - `#cf-error-details`
3. Challenge title plus challenge copy:
   - titles such as `Just a moment...`, `Attention Required`, or `Security Verification`;
   - body copy mentioning Cloudflare, human verification, browser checking, security verification, or a Ray ID.
4. Challenge title plus supporting Turnstile/challenge-platform assets.

Generic Turnstile markup alone does not suppress AutoNext. This prevents false positives on a legitimate AnimePahe page that might embed a normal Turnstile widget.

## No-op guarantee

When a challenge is detected, version 2.0.9 returns before:

- `GM_getValue` or `GM_setValue`;
- local storage fallback access;
- DOM creation, mutation, or badge injection;
- fatal-error panel installation;
- history API patching;
- page, message, or navigation listeners;
- timeout or interval creation;
- `MutationObserver` creation;
- autoplay, server-selection, episode-one, or next-episode logic; and
- kwik bridge initialization.

After verification succeeds, Cloudflare loads the real AnimePahe document. Tampermonkey evaluates the userscript again for that document, the classifier returns false, and normal initialization proceeds.

## Verification

Run the release checks:

```powershell
npm test
```

The regression suite verifies:

- root-URL challenge detection from title and body copy;
- `/cdn-cgi` path detection;
- strong challenge-shell marker detection;
- challenge-title plus challenge-asset detection;
- a normal AnimePahe page is not classified as a challenge;
- a normal page with only a Turnstile field is not classified as a challenge;
- kwik bridge pages are not classified as AnimePahe challenges;
- the guard call remains before `main()`; and
- end-to-end challenge execution performs none of the forbidden side effects.

CI runs the same command on every pull request and push.

## Manual acceptance criteria

1. Install or update to version 2.0.9.
2. Open AnimePahe and allow Cloudflare to show its normal verification page.
3. Confirm the `AutoNext ON` badge is absent during verification.
4. Confirm the verification page completes without userscript interaction.
5. Confirm the badge appears after the real AnimePahe page loads.
6. Open an episode and confirm the kwik player bridge still loads.
7. Confirm AutoNext navigation, one-time autoplay, and audio restoration still behave normally.

## Rollout

1. Merge version 2.0.9 to the canonical `main` branch.
2. Confirm the raw userscript URL returns metadata version 2.0.9.
3. In Tampermonkey, run the script's update check or reinstall from the raw URL.
4. Perform the manual acceptance checks above.

## Rollback

If version 2.0.9 causes a false positive on a legitimate AnimePahe document:

1. Disable AutoNext temporarily for that tab.
2. Capture the page title, URL path, and which challenge marker matched.
3. Narrow the classifier and add the captured case to the regression suite.
4. Publish a patch release.

Do not roll back to version 2.0.8 as a normal remedy because it restores the known interstitial-isolation defect.

## Residual risk

Cloudflare may change its markup or wording. The classifier therefore uses multiple independent signals and a title/body fallback. Future changes should preserve two invariants:

- strong Cloudflare-owned challenge shells fail closed; and
- generic challenge assets embedded in a normal AnimePahe page do not disable the script by themselves.
