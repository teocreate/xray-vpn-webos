# Changelog

## 0.1.0

First public release.

- Full-device Xray `tun` tunnel for rooted webOS TVs, controlled from a Magic Remote friendly app.
- Subscriptions (base64, plain, Happ-style JSON), manual links, add-from-phone page on port 8088.
- VLESS (Reality/TLS; tcp, ws, grpc, xhttp, httpupgrade), VMess, Trojan, Shadowsocks, Hysteria2.
- `vpnctl` with watchdog (crash/interface-change recovery, fail-open), OOM protection, memory limit,
  `rp_filter` handling, autostart via webosbrew init.d.
- Installer (`scripts/install.sh`) that fetches and verifies Xray-core.
- Honest device identification for providers that limit devices.
