# Stage Timer

[![CI](https://github.com/e1n7/stage-timer/actions/workflows/ci.yml/badge.svg)](https://github.com/e1n7/stage-timer/actions/workflows/ci.yml) [![Latest Release](https://img.shields.io/github/v/release/e1n7/stage-timer?display_name=tag&sort=semver)](https://github.com/e1n7/stage-timer/releases) [![License](https://img.shields.io/github/license/e1n7/stage-timer)](https://github.com/e1n7/stage-timer/blob/main/LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/) [![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)](https://stage-timer-juliana.vercel.app/)

Stage Timer is a browser-based timing application for live events, presentations, rehearsals, and other time-critical workflows. It provides configurable countdown, count-up, and time-of-day timers, a dashboard for operating timers, a dedicated output view for a second screen, message controls, scheduling, room management, and installable progressive web app support.

## Features

- Multiple countdown, count-up, and time-of-day timers.
- Independent timer controls for starting, pausing, resetting, adjusting, and navigating between timers.
- Follow Active Timer mode for moving through a timer sequence.
- Optional overtime display when a countdown passes zero.
- Warning-color progress segments for visual timing feedback.
- Date-aware scheduled start times with timezone support.
- Dashboard and dedicated output views for display on a second screen.
- Independent flashing controls for timer digits and messages.
- Configurable messages with color, bold, uppercase, size, show, and flash controls.
- Room management for organizing separate timer and message configurations.
- JSON export and import for saving and transferring room data.
- Cross-tab synchronization through browser messaging and local persistence.
- Installable PWA support for compatible desktop and mobile browsers.
- Settings overlays rendered above timer rows and dropdown menus, including when controls from different timer rows are used.

## Requirements

The project requires Node.js 22 or a compatible current Node.js release, pnpm 11.21.0, and a modern browser with JavaScript enabled.

## Development

Install the locked dependencies and start the Next.js development server:

```bash
pnpm install
pnpm dev
```

The development server prints a local URL in the terminal. Open that URL in a modern browser.

## Production Build

Create an optimized Next.js production build and run it locally:

```bash
pnpm build
pnpm start
```

The production server prints the local URL after it starts. The application uses the Next.js App Router with dashboard and output routes at `/` and `/output`.

## Validation Commands

The repository provides the following checks:

| Command | Purpose |
|---|---|
| `pnpm type-check` | Runs the TypeScript compiler without emitting files. |
| `pnpm test` | Runs the Vitest test suite. |
| `pnpm lint` | Runs ESLint against the application source. |
| `pnpm build` | Creates the optimized Next.js production build and performs build-time validation. |

## Data and Privacy

Stage Timer is designed as a client-side application. Timer rooms, timer settings, and related user data are stored in the browser's local storage unless the user explicitly exports them. Exported backups are JSON files and should be handled like any other configuration data.

The application uses browser messaging for cross-tab synchronization. Room save and import operations re-read existing local storage and merge records by unique room ID to reduce the risk of a stale tab overwriting rooms created elsewhere.

## PWA Updates

The current application version is **1.0.5**. When releasing a new deployed version, update the version values in `package.json` and `public/manifest.json`. Also advance the cache-busting marker in `app/layout.tsx`, including the `appVersion` value and versioned icon URLs. This allows existing PWA clients to invalidate stale caches and load the latest application assets.

## Deployment

The repository is configured for deployment through Vercel. Pushes to the configured production branch can trigger an automated deployment. Next.js generates its production output automatically, so the Vercel project should use the framework's standard Next.js settings and should not override the output directory with the old Vite `dist` directory.

The `pnpm-workspace.yaml` configuration allows the `sharp` build required by the Next.js image pipeline during dependency installation.

## Project Structure

| Path | Purpose |
|---|---|
| `app/page.tsx` | Dashboard route entry point. |
| `app/output/page.tsx` | Dedicated output route entry point. |
| `src/App.tsx` | Main dashboard UI, timer-row controls, room controls, and overlay coordination. |
| `src/hooks/useTimer.ts` | Timer progression, wall-clock synchronization, persistence, and timer state behavior. |
| `src/components/TimerOutput.tsx` | Fullscreen output timer display. |
| `src/components/ProgressBar.tsx` | Timer progress-bar rendering. |
| `src/lib/roomStorage.ts` | Room merge and persistence helpers. |
| `src/lib/sharedChannel.ts` | Cross-tab synchronization messaging. |
| `public/manifest.json` | PWA metadata and installable app configuration. |

## License

Stage Timer is distributed under the MIT License. See [LICENSE](LICENSE) for the complete license text.

[Next.js documentation]: https://nextjs.org/docs
[Vercel documentation]: https://vercel.com/docs
[Vitest documentation]: https://vitest.dev/

## References

The project uses the official documentation for [Next.js][Next.js documentation], [Vercel][Vercel documentation], and [Vitest][Vitest documentation] as implementation references.
