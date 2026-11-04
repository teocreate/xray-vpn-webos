// First-run setup done by the app itself, so the package works when installed from the Homebrew Channel
// with no PC: (1) sync vpnctl / boot_hook.sh from the package (app/tv) to /media/developer/xrayvpn,
// (2) download Xray-core from its official GitHub release and verify the SHA-256 from the .dgst file.
(function (root) {
  'use strict';

  var DIR = root.Luna.DIR, APP = root.Luna.APP_DIR, sh = root.Luna.sh;
  var XRAY_TAG = 'v26.10.31';
  var BASE = 'https://github.com/XTLS/Xray-core/releases/download/' + XRAY_TAG;

  // Copy helper scripts when they differ (mv = new inode, safe while an old vpnctl is running).
  var SYNC = 'mkdir -p ' + DIR + '; for f in vpnctl boot_hook.sh; do [ -f ' + APP + '/tv/$f ] || continue; ' +
    'tr -d "\\r" <' + APP + '/tv/$f >' + DIR + '/$f.new && { if cmp -s ' + DIR + '/$f.new ' + DIR + '/$f; then rm -f ' + DIR + '/$f.new; else mv ' + DIR + '/$f.new ' + DIR + '/$f; fi; }; ' +
    'chmod +x ' + DIR + '/$f; done; echo XV_OK';

  var HAVE_XRAY = '[ -x ' + DIR + '/xray ] && echo 1 || echo 0';

  var DOWNLOAD = 'set -e; ' +
    'case "$(uname -m)" in armv7l|armv7) A=Xray-linux-arm32-v7a.zip;; aarch64|arm64) A=Xray-linux-arm64-v8a.zip;; *) echo "XV_ERR unsupported architecture $(uname -m)"; exit 1;; esac; ' +
    'T=' + DIR + '/.dl; rm -rf $T; mkdir -p $T; cd $T; ' +
    'curl -fsSL -m 200 -o a.zip ' + BASE + '/$A || { echo "XV_ERR download failed"; exit 1; }; ' +
    'curl -fsSL -m 30 -o a.dgst ' + BASE + '/$A.dgst || { echo "XV_ERR checksum file download failed"; exit 1; }; ' +
    'W=$(sed -n "s/^SHA2-256= *//p" a.dgst | tr -d "\\r"); G=$(sha256sum a.zip | cut -d" " -f1); ' +
    '[ -n "$W" ] && [ "$W" = "$G" ] || { echo "XV_ERR checksum mismatch"; exit 1; }; ' +
    'unzip -qo a.zip xray || { echo "XV_ERR unzip failed"; exit 1; }; chmod +x xray; ' +
    'V=$(./xray version | head -1) || { echo "XV_ERR binary does not run"; exit 1; }; ' +
    'mv xray ' + DIR + '/xray.new && mv ' + DIR + '/xray.new ' + DIR + '/xray; cd /; rm -rf $T; echo "XV_OK $V"';

  // onDownload() is called only if Xray-core has to be fetched, so the UI can show a progress dialog.
  function ensure(onDownload) {
    return sh(SYNC, 20000).then(function (out) {
      if (out.indexOf('XV_OK') < 0) throw new Error(out.trim() || 'sync failed');
      return sh(HAVE_XRAY, 10000);
    }).then(function (out) {
      if (out.trim() === '1') return false;
      if (onDownload) onDownload();
      return sh(DOWNLOAD, 260000).then(function (o) {
        if (o.indexOf('XV_OK') < 0) {
          var m = /XV_ERR (.*)/.exec(o);
          throw new Error(m ? m[1] : o.trim().slice(-300) || 'download failed');
        }
        return true;
      });
    });
  }

  root.Setup = { ensure: ensure, XRAY_TAG: XRAY_TAG };
})(window);
