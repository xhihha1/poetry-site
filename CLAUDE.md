# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, vanilla HTML/CSS/JS site ("詩歌" — hymnal + Bible reader) with no build system,
no package manager, and no test suite. It's deployed as-is to GitHub Pages.

## Running locally

```bash
python server.py        # serves the repo root at http://localhost:8000
```

or on Windows, double-click `run.bat`, which starts `server.py` and opens
`http://localhost:8000/bible.html` in Chrome.

There is no build/lint/test step — edit HTML/CSS/JS directly and reload the browser.

## Deployment

Pushing to `master` triggers `.github/workflows/static.yml`, which uploads the entire
repo as-is to GitHub Pages. There is no build step in CI either.

## Architecture

### Two independent features sharing one shell page

`index.html` is a single-page app with a tab-based shell (`#body-tab`) that toggles
`.block-area` divs (`showElement`/`hideElement`/`hideAllBlockAreas`) to switch between:

- **Hymnal book browser** (`book-page` → `book-keyboard` → `book-song`): the user picks a
  songbook (radio buttons, values `D`/`B`/`N`/`X`/`L`), types a song number on the on-screen
  keypad, and the app renders that song as one or more `<img>` pages. Song images are pre-rendered
  images (not generated at runtime) with a per-book naming/path convention (see below); the app just
  probes for `{page}.webp`, `{page}-1.webp`, `{page}-2.webp`, ... until a probe 404s.
- **Bible reader** (`read-page`): loads a New Testament book as Markdown from `bible/NewTestament/`,
  renders it with `marked.min.js`, splits paragraphs into per-line `<div class="line">`s, and offers
  click-to-read and "read all" via the browser's `SpeechSynthesis` API (`zh-TW`), with font-size
  controls and auto-scroll to the currently-spoken line.

Most of this logic lives inline in `<script>` in `index.html` itself, plus
`script/newTestament.js` (an near-duplicate of the Bible-reading logic, also loaded by
`index.html`, and used standalone by `bible.html` for a minimal/demo version of the same reader).
When changing Bible-reading behavior, check both `index.html`'s inline script and
`script/newTestament.js` — they currently duplicate the same functions
(`loadAndReadMarkdown`, `readLine`, `readAllLine`, `pauseReading`, `resumeReading`, `genList`, etc.).

### Songbook image directories

Each songbook is a directory of pre-rendered page images, one directory per book code:

| Book code | Directory            | Filename pattern              | Number padding |
|-----------|-----------------------|--------------------------------|-----------------|
| `D`       | `shi_ge/`             | `D_NNN[-i].webp`               | 3 digits        |
| `B`       | `bu_chong_ben/`       | `B_NNNN[-i].webp`               | 4 digits        |
| `N`       | `xin_ge_song_yong/`   | `N_NNN[-i].webp`               | 3 digits        |
| `X`       | `hong_ben/`           | `X_NNN[-i].webp`               | 3 digits        |
| `L`       | `lan_ben/`            | `L_NNN[-i].webp`               | 3 digits        |

The `-i` suffix (`-1`, `-2`, ...) marks continuation pages for a song that spans multiple images;
`index.html`'s `submitInput()` probes sequential suffixes and stops at the first missing file.
Song pages are lossless WebP (same pixels as the scanned PNGs, ~30% of the size). Adding a new
song means adding correctly-named PNGs or WebPs to the matching directory — no code changes
needed: the deploy workflow runs `tools/songs_to_webp.sh`, which converts any song PNG to
WebP (run it locally too before testing new songs with `python server.py`).

### Bible content

`bible/NewTestament/*.md` holds one Markdown file per book (e.g. `Matthew.md`). Each book also has
an `_o` variant (e.g. `Matthew_o.md`) that keeps the original verse-number prefixes (`1:1`, `1:2`,
...) inline in the text; the non-`_o` file has those stripped for cleaner read-aloud/display. The
`topicList` array (book code → Chinese display name) is duplicated in `index.html`'s inline script
and in `script/newTestament.js`/`bible.html` — keep them in sync if books are added or renamed.

### Other pages

- `bible.html` — standalone minimal demo of the Markdown reader (same logic as the Bible-reader
  panel in `index.html`, not integrated with the tab shell).
- `jianpu-editor.html` (desktop, text-syntax editor) and `jianpu-mobile.html` (phone, tap-to-edit
  keypad) — standalone 簡譜 editors, spec in `SPEC.md`. Both are self-contained (parsing, SVG
  rendering, Web Audio playback inline) and share the localStorage key `jianpu-editor:source-v1`
  and JSON export format, so they edit the same song. Reached from the ☰ menu (`#more-menu`) in
  `index.html`'s tab bar.
- `jianpu/{book}/{book}_{NNN}.json` — song library of editor exports, named like the song images
  (same book codes and padding, e.g. `jianpu/D/D_178.json`). Adding a file is enough: the song
  page probes for it after `submitInput()` and, if found, shows a play bar (`#song-player`) driven
  by `script/jianpuPlayer.js`, which plays the JSON's `measures` field (no notation parsing). The
  mobile editor opens songs from here (`?song=D_178` or its 詩歌庫 sheet); both editors load
  `D_178.json` as the first-visit example.
- `apps/` — small standalone tool apps, reached from the ☰ menu's「更多 APP」entry
  (`apps/index.html`, a card list). `piano.html` and `drum.html` are self-contained (Web Audio
  synthesis inline, no libraries) and share `apps/apps.css` for the top bar. Adding a tool means
  a new page in `apps/` plus one `<a class="app-item">` card in `apps/index.html`.
- `apps/tiles.html` — 捷運拼牌, a 2–4 player online tile game. Rules are pure functions in
  `apps/tiles/rules.js` (no DOM; runs under node too). Rooms are stored through
  `apps/tiles/net.js`: Firebase Realtime Database (`rooms/{4-digit code}`, every move is a
  transaction on the whole room) when `apps/tiles/firebase-config.js` has a config, otherwise a
  localStorage fallback where tabs on one device act as separate players (player id is per tab
  in that mode). A turn is edited locally and only written on 完成/抽牌.
- `backup.html` — appears to be a leftover "add to home screen" demo/reference page, not linked
  from `index.html`.

### PWA setup and offline songs

`manifest.json` + the `<link rel="manifest">`/apple-* meta tags in `index.html` make the site
installable as a home-screen PWA.

`sw.js` (registered by `index.html` and `apps/offline.html`) makes the hymnal work offline:
- The app shell listed in `SHELL` (index, css, js, covers, icons) is network-first with a cached
  fallback. If you add a file `index.html` needs, add it to `SHELL`; if you bump a `?v=` query
  in `index.html`, bump it there too.
- Song images (the five book directories) and `jianpu/` JSON are served from Cache Storage when
  present. `apps/offline.html` downloads whole books into one cache per book (`songs-D`, ...)
  and records each file's hash in the `offline-settings` cache, so it can offer to re-download
  songs that were added or changed. Songs viewed online also go into `songs-viewed` unless
  the user turns that off.
- `offline-songs.json` (book → files with size and hash) is generated, not committed: the
  deploy workflow runs `python3 tools/build_offline_index.py`. Run it yourself to test offline
  downloads locally. Adding song images still needs no code change.
- The Bible reader is intentionally not cached for offline use.
