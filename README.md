[![NPM Version](https://img.shields.io/npm/v/fsrs-browser.svg?style=flat)](https://www.npmjs.com/package/fsrs-browser)

# fsrs-browser

This project runs [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) in the browser with support for training FSRS parameters.

## Versioning

`fsrs-browser`'s major and minor version numbers will match the version of `fsrs-rs` used. The patch version number is reserved for `fsrs-browser`'s use and may drift out of sync with `fsrs-rs`.

## FSRS-6 and FSRS-7

`new Fsrs()` uses the FSRS-7 defaults (`DEFAULT_PARAMETERS()`, 34 values). Pass 17, 19 or 21 parameters (e.g. `FSRS6_DEFAULT_PARAMETERS()`) to use FSRS-6; `fsrs.version` reports the result. `computeParameters` and `computeParametersAnki` train the current model's version unless a `ModelVersion` is passed. Memory states are `[stability, difficulty, stabilityFast]`; a 2-element starting state uses `stability` as `stabilityFast`. Elapsed days (`Float32Array`) may be fractional: FSRS-6 rounds them to whole days, FSRS-7 keeps the fraction, and the Anki functions use whole local days for FSRS-6 and fractional days between review timestamps for FSRS-7.

## Building and demoing

Run `./dev.sh` for fast builds or `./prod.sh` for fast runs.

Run the `/sandbox` project to demo various behavior.

I highly encourage `./prod.sh` if you intend to run training. On my machine training 24,394 revlogs on `./dev` takes days, while `./prod.sh` takes 3.5 seconds.
