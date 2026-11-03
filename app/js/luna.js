// Root shell on the TV via the Homebrew Channel service (luna://org.webosbrew.hbchannel.service/exec).
(function (root) {
  'use strict';

  var DIR = '/media/developer/xrayvpn';
  var APP_DIR = '/media/developer/apps/usr/palm/applications/com.teocreate.xrayvpn';

  // timeoutMs: reject if the service never answers. The Homebrew Channel service exits when idle and
  // webOS sometimes keeps a stale registration for it, after which calls hang forever without an error.
  function call(uri, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!root.PalmServiceBridge) { reject(new Error('Нет PalmServiceBridge (не на ТВ)')); return; }
      var done = false, timer = null;
      function fin(fn, v) { if (done) return; done = true; if (timer) clearTimeout(timer); fn(v); }
      var b = new root.PalmServiceBridge();
      b.onservicecallback = function (msg) {
        var r;
        try { r = JSON.parse(msg); } catch (e) { fin(reject, e); return; }
        if (r.returnValue === false) fin(reject, new Error(r.errorText || 'luna error'));
        else fin(resolve, r);
      };
      if (timeoutMs) timer = setTimeout(function () { fin(reject, new Error('Сервис root-команд не отвечает (таймаут)')); }, timeoutMs);
      b.call(uri, JSON.stringify(params || {}));
    });
  }

  // Resolves with stdout (string); stderr is appended on failure of the call itself only.
  function sh(cmd, timeoutMs) {
    return call('luna://org.webosbrew.hbchannel.service/exec', { command: cmd }, timeoutMs || 45000).then(function (r) {
      return (r.stdoutString || '') + (r.stderrString || '');
    });
  }

  // Keep the exec service from idling out (it exits ~30 s after the last call). One call in flight at most.
  var kaBusy = false;
  function keepAlive() {
    setInterval(function () {
      if (kaBusy) return;
      kaBusy = true;
      call('luna://org.webosbrew.hbchannel.service/exec', { command: 'true' }, 8000)
        .then(function () { kaBusy = false; }, function () { kaBusy = false; });
    }, 10000);
  }
  keepAlive();

  function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }

  function writeFile(path, text) {
    return sh('echo ' + b64(text) + ' | base64 -d > ' + q(path) + ' && echo ok');
  }

  root.Luna = { DIR: DIR, APP_DIR: APP_DIR, call: call, sh: sh, q: q, writeFile: writeFile };
})(window);
