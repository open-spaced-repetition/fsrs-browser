#!/bin/bash

rsVersion=$(cd fsrs-rs && cat Cargo.toml |
	grep --extended-regexp "^version =" |
	grep --extended-regexp --only-matching "[0-9]+\.[0-9]+.[0-9]+[-\.\+a-zA-Z0-9]*" |
	head --lines=1)

# https://stackoverflow.com/a/6253883
rsMajor=$(echo $rsVersion | cut -d. -f1)
rsMinor=$(echo $rsVersion | cut -d. -f2)

oldVersion=$(cat Cargo.toml |
	grep --extended-regexp "^version =" |
	grep --extended-regexp --only-matching "[0-9]+\.[0-9]+.[0-9]+[-\.\+a-zA-Z0-9]*" |
	head --lines=1)

oldMajor=$(echo $oldVersion | cut -d. -f1)
oldMinor=$(echo $oldVersion | cut -d. -f2)
oldRevision=$(echo $oldVersion | cut -d. -f3)

newVersion="$rsMajor.$rsMinor.0"
if [[ $rsMajor == $oldMajor && $rsMinor == $oldMinor ]]; then
	revision=$(expr $oldRevision + 1)
	newVersion="$rsMajor.$rsMinor.$revision"
fi

# https://github.com/rust-lang/cargo/issues/6583#issue-401816934
sed -i -e "s/^version = .*/version = \"$newVersion\"/" Cargo.toml
