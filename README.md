# Brío

A mood-aware game launcher for Windows. Tell Brío how you're feeling and it recommends what to play from your own library.

![Electron](https://img.shields.io/badge/Electron-32-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Mood-based discovery** — pick a mood (Chill, Focused, Hype, Social, Explore) and get ranked suggestions from your library
- **Smart library** — add games manually, scan installed Steam & Epic games automatically, or search the Steam store
- **Insights** — play history, streaks, mood patterns, and upcoming local holidays so you know when you'll have free time
- **Free Games** — live feed of free games on Epic and Steam, with a notification badge when new ones appear
- **Customisable** — 6 accent colours, start page, default mood, minimize to tray, launch at startup
- **Auto-updates** — silent background updates via GitHub Releases

## Download

Grab the latest installer from the [Releases](../../releases/latest) page.

| File | Description |
|------|-------------|
| `Brio-Setup.exe` | NSIS installer (recommended) |
| `Brio-*-win.zip` | Portable zip, no install needed |

## Getting Started

1. Install and launch Brío
2. Set your country for local holiday tracking (optional)
3. Scan your installed Steam / Epic games or add them manually
4. Pick a mood on the Discover page and start playing

## Development

```bash
git clone https://github.com/zyrxtheproto/brio.git
cd brio
npm install
npm run dev
```

**Build installer:**
```bash
npm run dist
```

**Build + publish release:**
```bash
$env:GH_TOKEN="your_github_token"
npm run release
```

### Stack

- [Electron](https://electronjs.org) — desktop shell
- [electron-store](https://github.com/sindresorhus/electron-store) — persistent settings & library
- [electron-updater](https://www.electron.build/auto-update) — auto-updates via GitHub Releases
- [electron-builder](https://www.electron.build) — packaging & distribution
- Steam Store API + Epic Games Store API — game data and free game promotions
- [date.nager.at](https://date.nager.at) — public holidays by country

## Data & Privacy

All data is stored locally on your machine (`%APPDATA%\Brío\config.json`). Brío makes read-only requests to public APIs for game artwork, free game promotions, and public holidays. Nothing is sent to any server.

To reset the app to factory defaults, delete `%APPDATA%\Brío\config.json`.
