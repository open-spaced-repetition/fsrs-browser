#!/bin/bash

rsVersion=$(awk '
	/^\[dependencies\.fsrs\]$/ { in_fsrs = 1; next }
	/^\[/ { in_fsrs = 0 }
	in_fsrs && /^version[[:space:]]*=/ { print; exit }
	/^fsrs[[:space:]]*=/ { print; exit }
' Cargo.toml |
	sed -E 's/.*version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/; s/^[^"]*"([^"]+)".*/\1/' |
	grep -E -o "[0-9]+\.[0-9]+\.[0-9]+[-.\+a-zA-Z0-9]*" |
	head -n 1)

if [[ -z $rsVersion ]]; then
	echo "Unable to find fsrs dependency version in Cargo.toml" >&2
	exit 1
fi

# https://stackoverflow.com/a/6253883
rsMajor=$(echo $rsVersion | cut -d. -f1)
rsMinor=$(echo $rsVersion | cut -d. -f2)

oldVersion=$(cat Cargo.toml |
	grep -E "^version =" |
	grep -E -o "[0-9]+\.[0-9]+\.[0-9]+[-.\+a-zA-Z0-9]*" |
	head -n 1)

oldMajor=$(echo $oldVersion | cut -d. -f1)
oldMinor=$(echo $oldVersion | cut -d. -f2)
oldRevision=$(echo $oldVersion | cut -d. -f3)

newVersion="$rsMajor.$rsMinor.0"
if [[ $rsMajor == $oldMajor && $rsMinor == $oldMinor ]]; then
	revision=$(expr $oldRevision + 1)
	newVersion="$rsMajor.$rsMinor.$revision"
fi

tmpFile=$(mktemp "${TMPDIR:-/tmp}/fsrs-browser-cargo-toml.XXXXXX")
sed -E "s/^version = .*/version = \"$newVersion\"/" Cargo.toml >"$tmpFile"
mv "$tmpFile" Cargo.toml
