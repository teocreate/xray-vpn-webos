#!/bin/sh
# Stage the package contents in .build/pkg: app/ plus the TV helper scripts (tv/vpnctl, tv/boot_hook.sh)
# under tv/, so the app can install them itself on first run. Prints the staging path.
set -e
cd "$(dirname "$0")/.."
rm -rf .build/pkg; mkdir -p .build/pkg/tv
cp -r app/. .build/pkg/
cp tv/vpnctl tv/boot_hook.sh .build/pkg/tv/
echo .build/pkg
