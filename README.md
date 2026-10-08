# turbo-ci

[![CI](https://github.com/malipio/turbo-ci/actions/workflows/ci.yml/badge.svg)](https://github.com/malipio/turbo-ci/actions/workflows/ci.yml)
[![Pages](https://github.com/malipio/turbo-ci/actions/workflows/pages.yml/badge.svg)](https://github.com/malipio/turbo-ci/actions/workflows/pages.yml)

CI for Turbo Pascal 7.0 / DOS code, plus an interactive in-browser demo.

**Live demo:** https://malipio.github.io/turbo-ci/ — pick from a growing set
of examples under [`src/`](src/) (currently `hello.pas` and an analog clock,
`clock.pas`, drawn with the BGI `Graph` unit) and run them interactively,
compiled with the real Turbo Pascal 7.0, right in your browser.

## How it works

- CI (`ci/run-dos.js`) compiles every `src/*.pas` file headlessly, using the
  real Turbo Pascal 7.0 `TPC.EXE`, so it validates against the actual
  historical compiler rather than a modern Pascal dialect.
- The demo site (`ci/build-site.js`) compiles each example in its registry
  the same way, then ships **only the compiled `.EXE`s** (plus the VGA
  driver `EGAVGA.BGI` for graphics examples) into a small
  [js-dos v8](https://js-dos.com/) page (`site/index.html`) that lets you
  pick which one to run, deployed to GitHub Pages on every push to `main`,
  with a live preview for every pull request.
- Turbo Pascal 7.0 itself isn't vendored in this repo. `ci/fetch-tp7.js`
  fetches it transiently at build/CI time — see [`NOTICE.md`](NOTICE.md) for
  why, and what that means license-wise.

## Compile backends

Compiling happens via one of two backends, selectable with
`--backend=wasm|dosbox` on `ci/run-dos.js` or the `TPC_BACKEND` env var
(default: `dosbox`):

- **`dosbox`** (default) — shells out to a real, native `dosbox` binary,
  which must be on `PATH` (install with `apt install dosbox` on Linux or
  `brew install dosbox` on macOS; override the binary name with the
  `DOSBOX_BIN` env var, e.g. `DOSBOX_BIN=dosbox-x`). Works for every
  example, including `Graph`/BGI-based ones like `clock.pas`.
- **`wasm`** — runs in-process via the [`emulators`](https://www.npmjs.com/package/emulators)
  npm package's WASM DOSBox, no system dependencies required. Works fine
  for simple examples like `hello.pas`, but **hangs indefinitely on any
  program that links something from `GRAPH.TPU`** (e.g. `clock.pas`) — a
  bug in that package's headless backend, not something to debug if you
  hit it. Use the `dosbox` backend for graphics examples.

`ci/build-site.js` always uses the `dosbox` backend internally (it must
build every example correctly, regardless of your local env var), but still
depends on the `emulators` package for packaging the `.jsdos` bundles the
live demo ships.

## Local usage

```sh
npm ci
node ci/fetch-tp7.js          # fetches TPC.EXE/TURBO.TPL/GRAPH.TPU/EGAVGA.BGI into ci/tp7/ (gitignored)
node ci/run-dos.js src/hello.pas   # headless compile check (dosbox backend by default)
node ci/build-site.js         # builds dist-site/ (the same thing Pages deploys)
```

## Third-party software

This project fetches and compiles with Turbo Pascal 7.0, which is not freely
licensed. See [`NOTICE.md`](NOTICE.md) for the full explanation.

## License

[MIT](LICENSE) for the code in this repository. This does not cover Turbo
Pascal 7.0 itself — see [`NOTICE.md`](NOTICE.md).
