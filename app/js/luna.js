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
      if (timeoutMs) timer = setTimeout(function () { var e = new Error('Сервис root-команд не отвечает (таймаут)'); e.timeout = true; fin(reject, e); }, timeoutMs);
      b.call(uri, JSON.stringify(params || {}));
    });
  }

  // Consecutive timeouts of the exec service: lets the UI tell "service is stuck" from "command failed".
  var fails = 0;

  // Resolves with stdout+stderr (string). The command runs in a subshell and the call always exits 0: the
  // service rejects any non-zero exit with a message that holds only the command, losing the output.
  function sh(cmd, timeoutMs) {
    return call('luna://org.webosbrew.hbchannel.service/exec', { command: '( ' + cmd + '\n) 2>&1; true' }, timeoutMs || 45000).then(function (r) {
      fails = 0;
      return (r.stdoutString || '') + (r.stderrString || '');
    }, function (e) {
      if (e && e.timeout) fails++;
      throw e;
    });
  }

  // Quick check that the exec service answers at all (two tries, 6 s each).
  function probe() {
    function once() { return call('luna://org.webosbrew.hbchannel.service/exec', { command: 'true' }, 6000); }
    return once().catch(function () { return once(); }).then(function () { fails = 0; return true; }, function (e) { fails++; throw e; });
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

  root.Luna = { DIR: DIR, APP_DIR: APP_DIR, call: call, sh: sh, probe: probe, fails: function () { return fails; }, q: q, writeFile: writeFile };
})(window);
