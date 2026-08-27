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
  PNGs (not generated at runtime) with a per-book naming/path convention (see below); the app just
  probes for `{page}.png`, `{page}-1.png`, `{page}-2.png`, ... until a probe 404s.
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
| `D`       | `shi_ge/`             | `D_NNN[-i].png`                | 3 digits        |
| `B`       | `bu_chong_ben/`       | `B_NNNN[-i].png`                | 4 digits        |
| `N`       | `xin_ge_song_yong/`   | `N_NNN[-i].png`                | 3 digits        |
| `X`       | `hong_ben/`           | `X_NNN[-i].png`                | 3 digits        |
| `L`       | `lan_ben/`            | `L_NNN[-i].png`                | 3 digits        |

The `-i` suffix (`-1`, `-2`, ...) marks continuation pages for a song that spans multiple images;
`index.html`'s `submitInput()` probes sequential suffixes and stops at the first missing file.
Adding a new song means adding correctly-named PNGs to the matching directory — no code changes
needed.

### Bible content

`bible/NewTestament/*.md` holds one Markdown file per book (e.g. `Matthew.md`). Each book also has
an `_o` variant (e.g. `Matthew_o.md`) that keeps the original verse-number prefixes (`1:1`, `1:2`,
...) inline in the text; the non-`_o` file has those stripped for cleaner read-aloud/display. The
`topicList` array (book code → Chinese display name) is duplicated in `index.html`'s inline script
and in `script/newTestament.js`/`bible.html` — keep them in sync if books are added or renamed.

### Other pages

- `bible.html` — standalone minimal demo of the Markdown reader (same logic as the Bible-reader
  panel in `index.html`, not integrated with the tab shell).
- `backup.html` — appears to be a leftover "add to home screen" demo/reference page, not linked
  from `index.html`.

### PWA setup

`manifest.json` + the `<link rel="manifest">`/apple-* meta tags in `index.html` make the site
installable as a home-screen PWA. There is no service worker.
