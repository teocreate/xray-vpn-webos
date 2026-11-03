#!/bin/sh
# Symlinked from /var/lib/webosbrew/init.d/70-xrayvpn.
# run-parts waits for this to exit, so detach immediately and return right away -
# otherwise we'd hold up the rest of the webOS boot chain.
setsid /media/developer/xrayvpn/vpnctl _boot >/dev/null 2>&1 &
exit 0
