#!/bin/sh
# Package app/ into an IPK and (re)install it on the rooted TV, then launch it.
# Needs @webos-tools/cli (ares-package) in ~/node_modules and the root SSH key.
set -e
cd "$(dirname "$0")/.."
TV=${TV:?set TV=<tv-ip>}
KEY=${KEY:-$HOME/.ssh/id_rsa}
ARES=${ARES:-$HOME/node_modules/@webos-tools/cli/bin}
APP=com.teocreate.xrayvpn
SSH="ssh -q -i $KEY root@$TV"

mkdir -p dist
node "$ARES/ares-package.js" app -o dist >/dev/null
scp -q -i "$KEY" "dist/${APP}_0.1.0_all.ipk" "root@$TV:/tmp/xv.ipk"
# -tt: luna-send prints nothing without a tty. The install subscription ends itself; cap it at 8 replies.
timeout 60 $SSH -tt "luna-send -i -n 8 luna://com.webos.appInstallService/dev/install '{\"id\":\"$APP\",\"ipkUrl\":\"/tmp/xv.ipk\",\"subscribe\":true}' >/dev/null; sleep 3; luna-send -n 1 luna://com.webos.service.applicationmanager/launch '{\"id\":\"$APP\"}'; exit" 2>&1 | tr -d '\r' | tail -1
