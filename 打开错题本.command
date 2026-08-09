#!/bin/zsh
cd "$(dirname "$0")"
PORT=8732
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  /usr/bin/python3 -m http.server $PORT >/tmp/shiti-server.log 2>&1 &
fi
open "http://127.0.0.1:$PORT/index.html"
