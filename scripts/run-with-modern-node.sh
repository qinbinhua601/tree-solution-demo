#!/bin/sh

set -eu

NODE20_BIN="$HOME/.nvm/versions/node/v20.16.0/bin/node"

if [ -x "$NODE20_BIN" ]; then
  exec "$NODE20_BIN" "$@"
fi

exec node "$@"
