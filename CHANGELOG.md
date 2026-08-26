# Changelog

All notable changes to Stage Timer are documented here.

## [1.0.5] - 2026-08-26

### Fixed

- Hardened timer persistence writes so restricted or unavailable localStorage environments do not crash the application.
- Synchronized rapid Bold and Caps Lock updates to the visible Output message immediately.

### Improved

- Replaced message formatting text labels with custom SVG icons and improved the Size editor overlay positioning.
- Refined message-card width and formatting-control alignment while preserving the trash/delete control.
- Cleaned up Next.js ESLint configuration and synchronized the package lockfile.

## [1.0.4] - 2026-08-26

### Fixed

- Adjusted the dedicated Output timer position upward without changing Dashboard behavior or timer calculations.

### Improved

- Bumped the application version to `1.0.4` and the PWA cache-busting marker to `v86`.

## [1.0.3]

### Fixed

- Clamped Countup adjustments and displayed values at zero when subtracting time while the timer was running.

### Improved

- Advanced the PWA cache-busting marker to `v85`.

## [1.0.2] - 2026-08-24

### Fixed

- Prevented a timer-row actions menu from flashing above settings opened from another row.
- Coordinated timer settings and quick-settings overlays through parent-level state.
- Rendered settings overlays through a top-level body portal so they remain above row-level stacking contexts.

### Improved

- Updated the PWA and application cache-busting marker to `v84`.
- Documented the current Next.js development, validation, production, and deployment workflow.

## [1.0.1]

### Added

- Installable PWA metadata and custom timer icon assets.
- Room export and import support.
- Cross-tab room synchronization and stale-tab-safe room merging.

## Unreleased

Future changes should be added under this heading before the next release is published.
