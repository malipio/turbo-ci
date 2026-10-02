# turbo-ci

[![CI](https://github.com/malipio/turbo-ci/actions/workflows/ci.yml/badge.svg)](https://github.com/malipio/turbo-ci/actions/workflows/ci.yml)
[![Pages](https://github.com/malipio/turbo-ci/actions/workflows/pages.yml/badge.svg)](https://github.com/malipio/turbo-ci/actions/workflows/pages.yml)

Headless CI for Turbo Pascal 7.0 / DOS code, plus an interactive in-browser
demo.

**Live demo:** https://malipio.github.io/turbo-ci/ — compiles and runs
[`src/hello.pas`](src/hello.pas) interactively, right in your browser.

## How it works

- CI (`ci/run-dos.js`) compiles every `src/*.pas` file headlessly, using the
  real Turbo Pascal 7.0 `TPC.EXE` running inside a WASM-compiled DOSBox (the
  [`emulators`](https://www.npmjs.com/package/emulators) package), so it
  validates against the actual historical compiler rather than a modern
  Pascal dialect.
- The demo site (`ci/build-site.js`) compiles `src/hello.pas` the same way,
  then ships **only the compiled `.EXE`** into a small
  [js-dos v8](https://js-dos.com/) page (`site/index.html`), deployed to
  GitHub Pages on every push to `main`, with a live preview for every pull
  request.
- Turbo Pascal 7.0 itself isn't vendored in this repo. `ci/fetch-tp7.js`
  fetches it transiently at build/CI time — see [`NOTICE.md`](NOTICE.md) for
  why, and what that means license-wise.

## Local usage

```sh
npm ci
node ci/fetch-tp7.js          # fetches TPC.EXE/TURBO.TPL into ci/tp7/ (gitignored)
node ci/run-dos.js src/hello.pas   # headless compile check
node ci/build-site.js         # builds dist-site/ (the same thing Pages deploys)
```

## Third-party software

This project fetches and compiles with Turbo Pascal 7.0, which is not freely
licensed. See [`NOTICE.md`](NOTICE.md) for the full explanation.

## License

[MIT](LICENSE) for the code in this repository. This does not cover Turbo
Pascal 7.0 itself — see [`NOTICE.md`](NOTICE.md).
