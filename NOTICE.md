# Third-party software notice

This repository does not include Turbo Pascal 7.0. `ci/fetch-tp7.js` downloads
it at build/CI time from a third-party archive.org mirror
(`archive.org/details/tp_20240418`) and keeps only `TPC.EXE` and `TURBO.TPL`,
just long enough to compile the examples under `src/`.

Turbo Pascal 7.0 is (C) 1983-1992 Borland International. Unlike Turbo Pascal
1.0, 3.02, and 5.5, it was never released as freeware by Borland or its
successor Embarcadero, and the archive.org mirror this project fetches from
carries no explicit license from the rights holder. It's used here in the
common "transient use for abandonware" spirit of retrocomputing CI/preservation
projects, not redistributed or vendored by this repository.

If you are the rights holder and want this removed, open an issue and it will
be taken down promptly.
