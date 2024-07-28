[![NPM Version](https://img.shields.io/npm/v/fsrs-browser.svg?style=flat)](https://www.npmjs.com/package/fsrs-browser)

# fsrs-browser

This project runs [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) in the browser with support for training FSRS parameters.

## Versioning

`fsrs-browser`'s major and minor version numbers will match the version of `fsrs-rs` used. The patch version number is reserved for `fsrs-browser`'s use and may drift out of sync with `fsrs-rs`.

## Building and demoing

Run `./dev.sh` for fast builds or `./prod.sh` for fast runs.

Run the `/sandbox` project to demo various behavior.

I highly encourage `./prod.sh` if you intend to run training. On my machine training 24,394 revlogs on `./dev` takes days, while `./prod.sh` takes 3.5 seconds.

## Updating the git submodules

This section is only relevant to devs who are updating [the `fsrs-browser` branch of `fsrs-rs`](https://github.com/open-spaced-repetition/fsrs-rs/tree/fsrs-browser) or [`open-spaced-repetition/burn`](https://github.com/open-spaced-repetition/burn/tree/fsrs-browser).

`fsrs-browser` git submodules the aforementioned for reasons given [here](https://github.com/Tracel-AI/burn/pull/938#issuecomment-1925913866). Changes to these submodules should be written in a style to reduce merge conflicts. For example: 

* Comment code or tests out using `/* ... */` instead of deleting it.
* Don't fix most warnings, no matter how sad clippy sounds.

Auto-mergeable code is much, much better than "clean code". This is not the place or time for "good code".

You should also ignore CI/CD in these submodules. `fsrs-browser` uses [`wasm-bindgen-rayon`](https://github.com/RReverser/wasm-bindgen-rayon), which in turn uses `target-feature=+atomics,+bulk-memory,+mutable-globals`, which require nightly. Expecting CI/CD for the submodules to work with nightly is unreasonable, and fixing them only invites more opportunity for merge conflicts. The only CI/CD that matters is `fsrs-browser`'s.
