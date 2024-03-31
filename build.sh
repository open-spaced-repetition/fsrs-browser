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
