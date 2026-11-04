#!/bin/sh
# Package app/ into an IPK and (re)install it on the rooted TV, then launch it.
# Needs @webos-tools/cli (ares-package) in ~/node_modules and the root SSH key.
set -e
cd "$(dirname "$0")/.."
TV=${TV:?set TV=<tv-ip>}
KEY=${KEY:-$HOME/.ssh/id_rsa}
ARES=${ARES:-$HOME/node_modules/@webos-tools/cli/bin}
APP=com.teocreate.xrayvpn
VER=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' app/appinfo.json | head -1)
SSH="ssh -q -i $KEY root@$TV"

mkdir -p .build
PKG=$(sh scripts/stage.sh)
node "$ARES/ares-package.js" "$PKG" -o .build >/dev/null
scp -q -i "$KEY" ".build/${APP}_${VER}_all.ipk" "root@$TV:/tmp/xv.ipk"
# -tt: luna-send prints nothing without a tty. The install subscription ends itself; cap it at 8 replies.
timeout 60 $SSH -tt "luna-send -i -n 8 luna://com.webos.appInstallService/dev/install '{\"id\":\"$APP\",\"ipkUrl\":\"/tmp/xv.ipk\",\"subscribe\":true}' >/dev/null; sleep 3; luna-send -n 1 luna://com.webos.service.applicationmanager/launch '{\"id\":\"$APP\"}'; exit" 2>&1 | tr -d '\r' | tail -1
