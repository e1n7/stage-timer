# Stage Timer

Stage Timer is a browser-based timing application for live events, presentations, rehearsals, and other time-critical workflows. It provides multiple configurable timers, a dashboard view, a dedicated output view, message display controls, scheduling, room management, and progressive web app support.

## Features

- Multiple countdown, count-up, and time-of-day timers.
- Independent timer controls with start, pause, reset, adjustment, and navigation actions.
- Follow Active Timer mode for automatically moving through the timer sequence.
- Optional overtime display when a countdown passes zero.
- Warning-color progress segments for visual timing feedback.
- Date-aware scheduled start times with timezone support.
- Dashboard and dedicated output views for display on a second screen.
- Independent flashing controls for timer digits and messages.
- Configurable messages with color, bold, uppercase, size, and show or flash controls.
- Room management for organizing separate timer and message configurations.
- Export and import support for saving and transferring room data.
- Cross-tab synchronization through browser messaging and local persistence.
- Installable PWA support for compatible desktop and mobile browsers.

## Requirements

- Node.js 22 or a compatible current Node.js release.
- pnpm, npm, or another package manager that can install the dependencies in `package.json`.
- A modern browser with JavaScript enabled.

## Development

Install dependencies and start the Vite development server:

```bash
pnpm install
pnpm dev
```

The development server will print the local URL in the terminal. Open that URL in a modern browser.

## Production Build

Create an optimized production build with:

```bash
pnpm build
```

To preview the generated build locally:

```bash
pnpm preview
```

Additional checks are available through the package scripts:

```bash
pnpm type-check
pnpm lint
```

## Data and Privacy

Stage Timer is designed as a client-side application. Timer rooms and settings are stored in the browser's local storage unless the user explicitly exports them. Exported backups are JSON files and should be handled like any other configuration data.

## PWA Updates

When a deployed version changes, the PWA version marker in `index.html` must be incremented before pushing the change. This allows installed PWA clients to invalidate the application cache and load the latest bundle.

## Deployment

The repository is configured for deployment through Vercel. Pushes to the configured production branch can trigger an automated deployment. The `vercel.json` file provides the single-page application fallback to `index.html`.

## License

Stage Timer is distributed under the MIT License. See [LICENSE](LICENSE) for the complete license text.
