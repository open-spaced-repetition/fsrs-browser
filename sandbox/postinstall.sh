#!/usr/bin/env bash

mkdir -p ./src/assets
cp ./node_modules/sql.js/dist/sql-wasm.wasm ./src/assets/sql-wasm.wasm
mkdir -p ./public/
wget -nc -O ./public/collection.anki21.zip https://github.com/open-spaced-repetition/fsrs-optimizer-burn/files/12394182/collection.anki21.zip
unzip -n ./public/collection.anki21.zip -d ./public
