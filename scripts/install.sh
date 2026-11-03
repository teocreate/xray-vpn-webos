#!/bin/sh
# One-shot installer, run from a PC: downloads Xray-core, copies it and the helper scripts to a
# rooted webOS TV, and installs the Xray VPN app (IPK).
#
#   ./install.sh <tv-ip> [-k ~/.ssh/tv_key] [-x v26.10.31] [--ipk path/to.ipk] [--dry-run]
#
# Needs on the PC: ssh, scp, curl, unzip, sha256sum (or shasum). On the TV: root SSH and the
# Homebrew Channel (https://www.webosbrew.org/) installed and rooted.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
XRAY_TAG=v26.10.31
KEY=
DRY=0
IPK=
TV=

while [ $# -gt 0 ]; do
    case "$1" in
        -k) KEY=$2; shift 2 ;;
        -x) XRAY_TAG=$2; shift 2 ;;
        --ipk) IPK=$2; shift 2 ;;
        --dry-run) DRY=1; shift ;;
        -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
        *) TV=$1; shift ;;
    esac
done
[ -n "$TV" ] || { echo "usage: $0 <tv-ip> [-k key] [-x xray-tag] [--ipk file] [--dry-run]" >&2; exit 1; }

SSH_OPTS="-q -o StrictHostKeyChecking=accept-new"
[ -n "$KEY" ] && SSH_OPTS="$SSH_OPTS -i $KEY"
tv() { ssh $SSH_OPTS "root@$TV" "$@"; }
tvcp() { scp $SSH_OPTS "$1" "root@$TV:$2"; }
sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

APP=com.teocreate.xrayvpn
DIR=/media/developer/xrayvpn

echo "==> Checking the TV ($TV)"
ARCH=$(tv 'uname -m')
tv '[ -d /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service ]' ||
    { echo "Homebrew Channel service not found: root the TV and install Homebrew Channel first." >&2; exit 1; }
case "$ARCH" in
    armv7l|armv7) ASSET=Xray-linux-arm32-v7a.zip ;;
    aarch64|arm64) ASSET=Xray-linux-arm64-v8a.zip ;;
    *) echo "Unsupported TV architecture: $ARCH" >&2; exit 1 ;;
esac
echo "    arch=$ARCH  xray asset=$ASSET ($XRAY_TAG)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "==> Downloading Xray-core"
BASE=https://github.com/XTLS/Xray-core/releases/download/$XRAY_TAG
curl -fsSL -o "$TMP/$ASSET" "$BASE/$ASSET"
curl -fsSL -o "$TMP/$ASSET.dgst" "$BASE/$ASSET.dgst"
WANT=$(sed -n 's/^SHA2-256= *//p' "$TMP/$ASSET.dgst" | tr -d '\r')
GOT=$(sha "$TMP/$ASSET")
[ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || { echo "Checksum mismatch for $ASSET" >&2; exit 1; }
echo "    sha256 ok"
unzip -qo "$TMP/$ASSET" xray -d "$TMP"

if [ -z "$IPK" ]; then
    IPK=$(ls "$ROOT"/dist/${APP}_*_all.ipk 2>/dev/null | tail -1 || true)
    [ -n "$IPK" ] || IPK=$(ls "$ROOT"/${APP}_*_all.ipk 2>/dev/null | tail -1 || true)
fi
[ -f "$IPK" ] || { echo "IPK not found: build it with scripts/release.sh or pass --ipk." >&2; exit 1; }
echo "    app package: $IPK"

if [ "$DRY" = 1 ]; then
    echo "==> Dry run: testing the downloaded binary on the TV without installing it"
    tvcp "$TMP/xray" /tmp/xray_candidate
    tv 'chmod +x /tmp/xray_candidate && /tmp/xray_candidate version | head -1; rm -f /tmp/xray_candidate'
    echo "Dry run done."
    exit 0
fi

echo "==> Installing helper files to $DIR"
tv "mkdir -p $DIR; $DIR/vpnctl stop >/dev/null 2>&1 || true"
tvcp "$TMP/xray" "$DIR/xray"
tvcp "$ROOT/tv/vpnctl" "$DIR/vpnctl"
tvcp "$ROOT/tv/boot_hook.sh" "$DIR/boot_hook.sh"
tv "sed -i 's/\\r\$//' $DIR/vpnctl $DIR/boot_hook.sh; chmod +x $DIR/xray $DIR/vpnctl $DIR/boot_hook.sh; $DIR/xray version | head -1"

echo "==> Installing the app"
tvcp "$IPK" /tmp/xv.ipk
# luna-send only prints with a tty (-tt); the install subscription ends itself, so cap the replies.
tv -tt "luna-send -i -n 8 luna://com.webos.appInstallService/dev/install '{\"id\":\"$APP\",\"ipkUrl\":\"/tmp/xv.ipk\",\"subscribe\":true}' >/dev/null; sleep 3; rm -f /tmp/xv.ipk; exit" >/dev/null 2>&1 || true
tv "[ -d /media/developer/apps/usr/palm/applications/$APP ]" && echo "    installed" || { echo "App install failed" >&2; exit 1; }

echo
echo "Done. Open \"Xray VPN\" on the TV, press + Add and enter your subscription URL."
