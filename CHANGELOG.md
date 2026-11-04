# Changelog

## 0.2.0

- New interface: two-column layout with a round power button, status and uptime, country-code badges, ping dots,
  QR code for add-from-phone, settings with toggles, error screen with retry.
- UI in Russian and English (follows the TV language). Bundled Onest and JetBrains Mono fonts.
- The add-from-phone page was redesigned, follows the phone language and serves its own fonts from the TV.
- Screenshots in the READMEs.
- A stale "Connecting…" message no longer stays over the error dialog.
- Root-command calls now time out (45 s) and show an error instead of hanging on "Please wait" when the
  Homebrew Channel service stops answering.
- Keep-alive ping every 10 s so that service does not idle out in the middle of connecting or pinging.

## 0.1.0

First public release.

- Full-device Xray `tun` tunnel for rooted webOS TVs, controlled from a Magic Remote friendly app.
- Subscriptions (base64, plain, Happ-style JSON), manual links, add-from-phone page on port 8088.
- VLESS (Reality/TLS; tcp, ws, grpc, xhttp, httpupgrade), VMess, Trojan, Shadowsocks, Hysteria2.
- `vpnctl` with watchdog (crash/interface-change recovery, fail-open), OOM protection, memory limit,
  `rp_filter` handling, autostart via webosbrew init.d.
- Installer (`scripts/install.sh`) that fetches and verifies Xray-core.
- Honest device identification for providers that limit devices.
