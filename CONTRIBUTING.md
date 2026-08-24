# Contributing to Stage Timer

Thank you for contributing to Stage Timer. The project is a Next.js application for live-event timing, so changes should prioritize predictable timer behavior, hydration safety, persistence reliability, and clear user-facing documentation.

## Getting Started

Use Node.js 22 and pnpm 11.21.0. From a fresh checkout, install the locked dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Next.js in a modern browser. The dashboard is available at `/`, and the dedicated output view is available at `/output`.

## Before Opening a Pull Request

Run the complete local validation sequence:

```bash
pnpm type-check
pnpm test
pnpm lint
pnpm build
```

Do not commit generated build output such as `.next/`, temporary preview files, or local environment files. Do not commit secrets, API keys, or personal configuration data.

## Development Guidelines

Keep timer calculations, persistence, cross-tab synchronization, and Output behavior isolated from unrelated UI changes. Browser-only APIs such as `window`, `localStorage`, `BroadcastChannel`, and `document` must remain protected from server rendering. Preserve the existing client-only route boundaries unless the relevant code has been made fully SSR-safe.

When fixing a bug, add or update a focused regression test whenever practical. Changes involving timer progression should be tested against both Countup and Countdown behavior, including scheduled starts, completion, overtime, adjustments, and timer selection. Changes involving rooms should cover stale-tab merges and import or export behavior.

PWA version changes should update the version metadata and cache-busting marker documented in `README.md`. Keep changes small and avoid mixing timer logic changes with unrelated visual or documentation work.

## Branches and Commits

Create a focused branch from `main` for each change. Use a short, imperative commit message, such as `Fix cross-row settings overlay flash` or `Update project README`.

## Pull Requests

A pull request should explain the problem, the solution, the files affected, and how the change was tested. Include screenshots or a short recording for visual changes. Mention any known limitations or follow-up work.

Pull requests should remain focused and should not include unrelated formatting changes, generated files, dependency changes, or output-view adjustments that were not part of the requested work.

## Reporting Bugs

Use the bug-report template and include the browser, operating system, route, reproduction steps, expected behavior, actual behavior, and whether the issue affects the dashboard, Output view, PWA installation, persistence, or cross-tab synchronization.
