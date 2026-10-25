# JW Meeting Timer

[![CI](https://github.com/e1n7/stage-timer/actions/workflows/ci.yml/badge.svg)](https://github.com/e1n7/stage-timer/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/e1n7/stage-timer)](https://github.com/e1n7/stage-timer/blob/main/LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)

A browser-based timer designed for Jehovah’s Witness congregation meetings. It organizes timers by **Midweek** or **Weekend** meeting and week, imports meeting workbook PDFs, and provides a separate display view for the audience or platform. This is an independent project, not an official Jehovah’s Witnesses application.

## Meeting workflow

- Choose a Midweek or Weekend meeting and select an imported week from the Room menu.
- Import a Midweek Life and Ministry Meeting Workbook PDF or a Weekend Watchtower PDF. The app reads selectable PDF text, detects week banners, and prepares week-specific timer rooms.
- Review and edit recognized Midweek agenda titles and durations before importing. A one-minute Counseling timer is added to the second Midweek section.
- Weekend imports prepare Public Talk and Watchtower Study timers with 30-minute and 60-minute defaults, respectively.
- Save customized rooms, switch between meeting weeks, and continue editing timers and messages for each room.

PDF recognition depends on the text layer and layout of the uploaded file. The parser handles a range of localized date forms, numerals, and agenda layouts, but cannot guarantee correct extraction from every language, scanned PDF, or publisher-specific format. The application interface is currently in English.

## Timer and display features

- Multiple countdown and count-up timers with start, pause, reset, and adjustment controls.
- Follow Active Timer mode and linked timer sequences.
- Scheduled start times with timezone support.
- Overtime display and configurable visual warning zones and audio alerts.
- Custom stage messages with color, size, bold, uppercase, visibility, and flashing controls.
- Dashboard preview and a dedicated output page at `/output` for a second display. The dashboard and output view synchronize in browser tabs.
- Installable Progressive Web App (PWA) support in compatible browsers.

## Data and privacy

Timer rooms, meeting schedules, and timer settings are stored locally in the browser. Uploaded workbook PDFs are saved in browser storage for the corresponding meeting type. The app does not provide a server-based account or cloud sync.

There is currently no room JSON backup/import or export feature. Clearing the browser’s site data can remove saved rooms and settings; retain access to the browser profile where the app is used.

## Requirements

- Node.js 22 or a compatible current Node.js release
- pnpm 11.21.0
- A modern browser with JavaScript enabled

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Next.js. The dashboard is at `/`; the synchronized output view is at `/output`.

## Validation

| Command | Purpose |
|---|---|
| `pnpm type-check` | Type-checks the application and App Router source. |
| `pnpm test` | Runs the Vitest unit tests. |
| `pnpm lint` | Runs ESLint over `src/` and `app/`. |
| `pnpm build` | Builds the production Next.js application. |

CI runs type-checking, tests, lint, and a production build for pushes and pull requests targeting `main`.

## Project structure

| Path | Purpose |
|---|---|
| `app/page.tsx` | Dashboard route. |
| `app/output/page.tsx` | Audience/output route. |
| `src/App.tsx` | Meeting selection, room management, timers, messages, and dashboard interactions. |
| `src/components/WorkbookImportDialog.tsx` | PDF upload, agenda preview/editing, and schedule import. |
| `src/lib/workbookPdf.ts` | PDF text extraction and Midweek/Weekend week and agenda parsing. |
| `src/hooks/useTimer.ts` | Timer progression, synchronization, persistence, and warning behavior. |
| `src/lib/sharedChannel.ts` | Same-origin browser-tab communication. |
| `src/lib/storage.ts` | Local JSON storage helpers. |
| `public/manifest.json` | Installable PWA metadata. |

## License

Distributed under the MIT License. See [LICENSE](LICENSE).
