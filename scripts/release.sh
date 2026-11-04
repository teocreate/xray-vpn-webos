#!/bin/sh
# Build release artifacts into dist/:
#   <id>_<ver>_all.ipk                      installable package
#   xrayvpn-webos-<ver>-unpacked.zip        readable sources: app/ as it is inside the IPK + TV scripts + installer
#   SHA256SUMS
# Needs @webos-tools/cli (ares-package): npm i -g @webos-tools/cli, or ARES=<dir with ares-package.js>.
set -eu
cd "$(dirname "$0")/.."

APP=com.teocreate.xrayvpn
VER=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' app/appinfo.json | head -1)
ARES=${ARES:-$HOME/node_modules/@webos-tools/cli/bin}

rm -rf dist; mkdir -p dist

if command -v ares-package >/dev/null 2>&1; then ares-package app -o dist >/dev/null
else node "$ARES/ares-package.js" app -o dist >/dev/null; fi

# "Unpacked" bundle: same tree the IPK ships, plus everything needed to install and read the project.
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
D="$STAGE/xrayvpn-webos-$VER"
mkdir -p "$D"
cp -r app tv scripts README.md README.ru.md LICENSE CHANGELOG.md "$D/"
OUT="$PWD/dist/xrayvpn-webos-$VER-unpacked.zip"
if command -v zip >/dev/null 2>&1; then (cd "$STAGE" && zip -qr "$OUT" "xrayvpn-webos-$VER")
else (cd "$STAGE" && python3 -m zipfile -c "$OUT" "xrayvpn-webos-$VER" 2>/dev/null || python -m zipfile -c "$OUT" "xrayvpn-webos-$VER"); fi

cd dist
if command -v sha256sum >/dev/null 2>&1; then sha256sum ./*.ipk ./*.zip > SHA256SUMS
else shasum -a 256 ./*.ipk ./*.zip > SHA256SUMS; fi
ls -la
cat SHA256SUMS

# Homebrew Channel manifest: points at the IPK attached to the GitHub release of this version.
# repo.json (repository root) refers to .../releases/latest/download/<id>.manifest.json.
REPO=${REPO:-teocreate/xray-vpn-webos}
IPK=$(ls ./*.ipk | head -1); IPK=${IPK#./}
node -e '
var fs=require("fs"),c=require("crypto"),a=JSON.parse(fs.readFileSync("../app/appinfo.json","utf8")),f=process.argv[1],repo=process.argv[2];
var b=fs.readFileSync(f);
fs.writeFileSync(a.id+".manifest.json",JSON.stringify({id:a.id,version:a.version,type:a.type,title:a.title,
  iconUri:"https://raw.githubusercontent.com/"+repo+"/main/docs/icon.png",sourceUrl:"https://github.com/"+repo,rootRequired:true,
  ipkUrl:"https://github.com/"+repo+"/releases/download/v"+a.version+"/"+f,ipkSize:b.length,ipkHash:{sha256:c.createHash("sha256").update(b).digest("hex")}},null,2)+"\n");
' "$IPK" "$REPO"
echo; cat "./$(ls ./*.manifest.json | head -1 | sed 's#^\./##')"
