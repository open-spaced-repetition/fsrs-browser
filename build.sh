#!/usr/bin/env bash

set -eo pipefail # https://stackoverflow.com/a/2871034

# Add wasm32 target for compiler.
rustup target add wasm32-unknown-unknown

if ! command -v wasm-pack &>/dev/null; then
	echo "wasm-pack could not be found. Installing ..."
	cargo install wasm-pack
fi

# Set optimization flags
if [[ $1 == "release" ]]; then
	echo "Building in 'release' mode"
else
	echo "Building in 'dev' mode"
	# sets $1 to "dev"
	set -- dev
fi

# Run wasm pack tool to build JS wrapper files and copy wasm to pkg directory.
mkdir -p pkg

# some flags are provided by ./Cargo.toml and ./.cargo/config.toml
wasm-pack build --out-dir pkg --$1 --target web --no-default-features

# https://stackoverflow.com/a/28021305/
# Add Javascript/Typescript definitions to files if they aren't already there.
# Yes, this is a hack. LKM if you can think of anything better.
JSFILE='./pkg/fsrs_browser.js'
grep -qF -- "export function getProgress(wasmMemoryBuffer, pointer) {" "$JSFILE" || echo '
/**
* Do not use this function after the completion of `computeParameters` or `computeParametersAnki`.
* Data returned after completion will be random!
*/
export function getProgress(wasmMemoryBuffer, pointer) {
    // The progress vec is length 2. Grep 2291AF52-BEE4-4D54-BAD0-6492DFE368D8
    var progress = new Uint32Array(wasmMemoryBuffer, pointer, 2);
    return {
        itemsProcessed: progress[0],
        itemsTotal: progress[1],
    };
}
' >>"$JSFILE"

TYPEFILE='./pkg/fsrs_browser.d.ts'
grep -qF -- "export function getProgress(wasmMemoryBuffer: ArrayBuffer, pointer: number): {" "$TYPEFILE" || echo '
/**
* Do not use this function after the completion of `computeParameters` or `computeParametersAnki`.
* Data returned after completion will be random!
*/
export function getProgress(wasmMemoryBuffer: ArrayBuffer, pointer: number): {
    itemsProcessed: number;
    itemsTotal: number;
};
' >>"$TYPEFILE"
