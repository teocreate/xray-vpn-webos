// Root shell on the TV via the Homebrew Channel service (luna://org.webosbrew.hbchannel.service/exec).
(function (root) {
  'use strict';

  var DIR = '/media/developer/xrayvpn';
  var APP_DIR = '/media/developer/apps/usr/palm/applications/com.teocreate.xrayvpn';

  function call(uri, params) {
    return new Promise(function (resolve, reject) {
      if (!root.PalmServiceBridge) { reject(new Error('Нет PalmServiceBridge (не на ТВ)')); return; }
      var b = new root.PalmServiceBridge();
      b.onservicecallback = function (msg) {
        var r;
        try { r = JSON.parse(msg); } catch (e) { reject(e); return; }
        if (r.returnValue === false) reject(new Error(r.errorText || 'luna error'));
        else resolve(r);
      };
      b.call(uri, JSON.stringify(params || {}));
    });
  }

  // Resolves with stdout (string); stderr is appended on failure of the call itself only.
  function sh(cmd) {
    return call('luna://org.webosbrew.hbchannel.service/exec', { command: cmd }).then(function (r) {
      return (r.stdoutString || '') + (r.stderrString || '');
    });
  }

  function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }

  function writeFile(path, text) {
    return sh('echo ' + b64(text) + ' | base64 -d > ' + q(path) + ' && echo ok');
  }

  root.Luna = { DIR: DIR, APP_DIR: APP_DIR, call: call, sh: sh, q: q, writeFile: writeFile };
})(window);
