# Changelog

All notable changes to this project are documented here.

## [2.0.9] - 2026-07-28

### Fixed

- Prevented the AnimePahe controller from initializing inside Cloudflare verification documents served at normal AnimePahe URLs.
- Stopped badge injection, storage access, history patching, listeners, timers, observers, and redirect/autoplay bootstraps during verification.
- Avoided false positives from a generic Turnstile widget unless it is paired with challenge-document signals.

### Added

- A full incident root-cause analysis and Cloudflare compatibility contract.
- Zero-side-effect regression coverage for Cloudflare challenge documents.
- Normal-page and kwik-page negative test cases.
- A dependency-free `npm test` release command.
- GitHub Actions checks for pull requests and pushes.

### Validation

- JavaScript syntax check for the distributed userscript.
- Automated Cloudflare guard tests.
- Manual signature verification against an observed `Just a moment...` AnimePahe challenge.

## [2.0.8]

- Locked homepage bootstrap to episode 1 and prevented bounce-back navigation.

## [2.0.7]

- Restored homepage show-to-episode-one bootstrap for `/play` links and corrected autoplay handoff behavior.
