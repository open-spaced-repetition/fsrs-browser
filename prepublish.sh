#!/usr/bin/env bash

set -eo pipefail # https://stackoverflow.com/a/2871034

cd pkg

npm pkg set files[]='snippets/'
