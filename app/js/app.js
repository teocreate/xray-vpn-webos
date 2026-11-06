// UI + control logic. All privileged work goes through Luna.sh (root shell on the rooted TV).
(function () {
  'use strict';

  var DIR = Luna.DIR, sh = Luna.sh, q = Luna.q, t = I18N.t;
  var VPNCTL = DIR + '/vpnctl';
  var STORE_KEY = 'xv_state_v1';

  var S = { subs: [], manual: [], tab: 'manual', activeKey: null, settings: { ruDirect: false, autostart: false } };
  var pings = {};            // serverKey -> ms | -1
  var net = { running: false, tun: false, online: false, failed: false, iface: 'wlan0', lan: '', ip: '', upSince: 0 };
  var busy = false;          // blocks input (connect, ping, refresh...)
  var phase = false;         // true while connecting / disconnecting: drives the "busy" look of the power button
  var modalOpen = false;
  var phonePoll = null;
  var lastAdd = '';          // input of the last failed add, for "Retry"
  var setupRunning = false, setupPending = false;

  // ---------- storage ----------
  function load() {
    try {
      var j = JSON.parse(localStorage.getItem(STORE_KEY));
      if (j) { S.subs = j.subs || []; S.manual = j.manual || []; S.tab = j.tab || 'manual';
        S.activeKey = j.activeKey || null; S.settings = Object.assign(S.settings, j.settings || {}); }
    } catch (e) { /* first run */ }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function keyOf(s) { return s.name + '|' + s.address + '|' + s.port; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function curServers() {
    if (S.tab === 'manual') return S.manual;
    for (var i = 0; i < S.subs.length; i++) if (S.subs[i].id === S.tab) return S.subs[i].servers;
    S.tab = 'manual'; return S.manual;
  }
  function curSub() {
    for (var i = 0; i < S.subs.length; i++) if (S.subs[i].id === S.tab) return S.subs[i];
    return null;
  }
  function allServers() {
    return S.manual.concat.apply(S.manual, S.subs.map(function (s) { return s.servers; }));
  }
  function activeServer() {
    var a = allServers();
    for (var i = 0; i < a.length; i++) if (keyOf(a[i]) === S.activeKey) return a[i];
    return null;
  }
  // Providers put the country flag emoji in front of the server name: show it as a two-letter code instead.
  var FLAG = /\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])\s*/;
  function ccOf(s) {
    var m = FLAG.exec(s.name || '');
    return m ? String.fromCharCode(m[1].charCodeAt(0) - 0xDDE6 + 65, m[2].charCodeAt(0) - 0xDDE6 + 65) : '··';
  }
  function nameOf(s) { return (s.name || '').replace(FLAG, '') || s.name; }
  function fmtDur(sec) { sec = Math.max(0, Math.floor(sec)); return pad2(Math.floor(sec / 3600)) + ':' + pad2(Math.floor(sec % 3600 / 60)) + ':' + pad2(sec % 60); }
  function fmtUpdated(ts) {
    var d = new Date(ts), n = new Date(), hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (d.toDateString() === n.toDateString()) return t('today') + hm;
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + ' ' + hm;
  }

  var toastTimer;
  function toast(msg, ms) {
    var el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, ms || 3500);
  }

  function applyStatic() {
    document.documentElement.lang = I18N.lang;
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (e) { e.textContent = t(e.getAttribute('data-t')); });
  }

  // ---------- rendering ----------
  // Re-rendering replaces the focused element; put focus back on its twin so the remote cursor does not jump.
  function keepFocus(fn) {
    var a = document.activeElement, act = a && a.getAttribute && a.getAttribute('data-act'),
      di = a && a.getAttribute && a.getAttribute('data-i'), id = a && a.getAttribute && a.getAttribute('data-id');
    fn();
    if (!act || modalOpen || (act !== 'server' && act !== 'tab')) return;
    var sel = '[data-act="' + act + '"]' + (di !== null ? '[data-i="' + di + '"]' : '') + (id !== null ? '[data-id="' + id + '"]' : '');
    var n = document.querySelector(sel);
    if (n && n !== document.activeElement) n.focus();
  }

  function render() { keepFocus(function () { renderTabs(); renderList(); renderHero(); }); }

  function renderTabs() {
    var h = '<button class="f tab' + (S.tab === 'manual' ? ' sel' : '') + '" data-act="tab" data-id="manual"><span class="t">' + esc(t('myServers')) +
      '</span><span class="n">' + S.manual.length + '</span></button>';
    S.subs.forEach(function (s) {
      h += '<button class="f tab' + (S.tab === s.id ? ' sel' : '') + '" data-act="tab" data-id="' + s.id + '"><span class="t">' + esc(s.name) +
        '</span><span class="n">' + s.servers.length + '</span></button>';
    });
    $('tabs').innerHTML = h;
  }

  function msClass(ms) { return ms < 0 ? 'bad' : ms < 150 ? 'good' : ms < 400 ? 'mid' : 'bad'; }

  function renderList() {
    var list = curServers(), h = '', sub = curSub(), empty = !list.length;
    $('empty').hidden = !empty; $('list').hidden = empty; $('listhead').hidden = empty;
    if (empty) { $('list').innerHTML = ''; return; }
    $('btnRefresh').hidden = !sub;
    $('listinfo').textContent = list.length + ' ' + t(I18N.plural(list.length)) + (sub && sub.updated ? ' · ' + t('updated') + fmtUpdated(sub.updated) : '');
    var up = net.running && net.tun;
    list.forEach(function (s, i) {
      var k = keyOf(s), p = pings[k], ms = '';
      if (s.error) ms = t('refused');
      else if (p === undefined) ms = s.udp ? 'UDP' : '';
      else ms = p < 0 ? 'x' : p + t('ms');
      var meta = s.error ? esc(s.error) : esc(s.protocol + (s.network ? ' · ' + s.network : '') + (s.security && s.security !== 'none' ? ' · ' + s.security : ''));
      var isActive = k === S.activeKey && (net.running || phase);
      var wait = isActive && !up;
      h += '<button class="f row' + (isActive ? ' active' : '') + (wait ? ' wait' : '') + (s.error ? ' err' : '') + '" data-act="server" data-i="' + i + '">' +
        '<span class="cc">' + esc(ccOf(s)) + '</span><span class="name">' + esc(nameOf(s)) + '</span>' +
        '<span class="tag">' + (isActive ? t(wait ? 'tagWait' : 'tagOn') : '') + '</span><span class="meta">' + meta + '</span>' +
        '<span class="ms ' + (p !== undefined && !s.error ? msClass(p) : '') + '">' + esc(ms) + '</span></button>';
    });
    $('list').innerHTML = h;
  }

  function renderHero() {
    var a = activeServer(), up = net.running && net.tun, state = phase ? 'busy' : up ? 'on' : 'off';
    $('app').className = state;
    $('pill').textContent = phase ? t('connecting') : up ? t('protOn') : net.running ? t('tunnelOnly') : t('protOff');
    $('heroState').textContent = phase ? t('stBusy') : up ? t('stOn') : t('stOff');
    $('heroHint').textContent = Luna.fails() >= 2 ? t('svcDeadShort') : !a && !net.running && !allServers().length ? t('hintAddFirst') : phase ? t('hintWait') : net.running ? t('hintOff')
      : net.failed ? t('hintFailed') : t('hintOn');
    // The tunnel can run without a matching list entry (subscription deleted, config from another session):
    // say so and show the address from config.json instead of pretending there is no server.
    var orphan = !a && net.running && net.cfgAddr;
    $('cur').className = 'cur' + (a || orphan ? '' : ' none');
    $('heroCode').textContent = a ? ccOf(a) : orphan ? '··' : '';
    $('heroTitle').textContent = a ? nameOf(a) : orphan ? t('tunnelActive') : t('noServer');
    $('heroSub').textContent = a ? a.protocol + ' · ' + a.address + ':' + a.port : orphan ? net.cfgAddr + (net.cfgPort ? ':' + net.cfgPort : '') : '';
    var ip = net.ip || (a && /^\d+\.\d+\.\d+\.\d+$/.test(a.address) ? a.address : '');
    $('extIp').textContent = ip || '—';
    tickUptime();
  }

  function tickUptime() { $('uptime').textContent = net.running && net.upSince ? fmtDur((Date.now() - net.upSince) / 1000) : '00:00:00'; }

  // ---------- TV status ----------
  function refreshStatus(withIp, quiet) {
    var cmd = 'P=$(cat ' + DIR + '/xray.pid 2>/dev/null); if [ -n "$P" ] && kill -0 $P 2>/dev/null; then echo run=1; ' +
      "echo up=$(awk -v s=$(awk '{print $22}' /proc/$P/stat 2>/dev/null) 'NR==1{printf \"%d\", $1 - s/100}' /proc/uptime 2>/dev/null); else echo run=0; fi; " +
      'ip link show xray-tun >/dev/null 2>&1 && echo tun=1 || echo tun=0; ' +
      "ip route | awk '/^default/{print \"iface=\"$5; exit}'; " +
      "ip -4 addr show wlan0 2>/dev/null | awk '/inet /{split($2,a,\"/\"); print \"lan=\"a[1]; exit}'; " +
      '[ -f ' + DIR + '/.autostart ] && echo auto=1 || echo auto=0; ' +
      '[ -f ' + DIR + '/.failed ] && echo failed=1 || echo failed=0; ' +
      "sed -n 's/^ *\"address\": *\"\\([^\"]*\\)\".*/addr=\\1/p; s/^ *\"port\": *\\([0-9]*\\).*/port=\\1/p' " + DIR + '/config.json 2>/dev/null | head -2' +
      (withIp ? '; [ "$(curl -s -m 6 -o /dev/null -w %{http_code} https://www.gstatic.com/generate_204 2>/dev/null)" = 204 ] && echo online=1 || echo online=0; ' +
        'echo ip=$(curl -sf -m 5 https://api.ipify.org 2>/dev/null || curl -sf -m 5 https://ifconfig.me/ip 2>/dev/null)' : '');
    return sh(cmd).then(function (out) {
      var m = {};
      out.split('\n').forEach(function (l) { var i = l.indexOf('='); if (i > 0) m[l.slice(0, i)] = l.slice(i + 1).trim(); });
      net.running = m.run === '1'; net.tun = m.tun === '1'; net.failed = m.failed === '1';
      net.upSince = net.running && /^\d+$/.test(m.up || '') ? Date.now() - parseInt(m.up, 10) * 1000 : 0;
      if (m.iface && m.iface !== 'xray-tun') net.iface = m.iface;
      if (m.lan) net.lan = m.lan;
      S.settings.autostart = m.auto === '1';
      if (withIp) { net.ip = /^[0-9a-f.:]+$/i.test(m.ip || '') ? m.ip : ''; net.online = m.online === '1'; }
      if (!net.running) net.ip = '';
      net.cfgAddr = m.addr || ''; net.cfgPort = m.port || '';
      // Re-attach a running tunnel to its list entry (after an app restart, or when the key was lost).
      if (net.running && !activeServer() && net.cfgAddr) {
        var hit = allServers().filter(function (s) { return s.address === net.cfgAddr && String(s.port) === net.cfgPort; })[0];
        if (hit) { S.activeKey = keyOf(hit); save(); }
      }
    }).catch(function (e) { if (!quiet) toast(t('toastNoRoot') + errText(e), 6000); });
  }

  // Never show a raw "Command failed: <whole shell command>" from the exec service.
  function errText(e) {
    var m = String((e && e.message) || e);
    if (/^Command failed/.test(m)) return t('cmdFailed');
    return m.length > 200 ? m.slice(0, 200) + '…' : m;
  }

  // Fail fast (12 s) with a clear message when the exec service is stuck, instead of waiting out 45 s per command.
  function needService() {
    return Luna.probe().catch(function () { throw new Error(t('svcDead')); });
  }

  // ---------- connect / disconnect ----------
  var busySince = 0;
  function setBusy(v, vpn) { busy = v; phase = v && !!vpn; busySince = v ? Date.now() : 0; renderHero(); renderList(); }

  function connect(server) {
    if (server.error) { toast(t('toastUnsupported') + server.error, 5000); return Promise.resolve(); }
    S.activeKey = keyOf(server); save();
    setBusy(true, true); toast(t('toastConnecting').replace('%s', nameOf(server)), 30000);
    var cfg = XConfig.buildConfig(server, { iface: net.iface, ruDirect: S.settings.ruDirect });
    var newPath = DIR + '/config.new.json';
    return needService()
      .then(function () { return Luna.writeFile(newPath, JSON.stringify(cfg, null, 2)); })
      .then(function () { return sh(DIR + '/xray run -test -c ' + newPath + ' 2>&1 | tail -6'); })
      .then(function (out) {
        if (out.indexOf('Configuration OK') < 0) throw new Error(t('cfgRejected') + out.trim());
        return sh('mv ' + newPath + ' ' + DIR + '/config.json && ' + VPNCTL + ' restart 2>&1');
      })
      .then(function () { return sh('sleep 2'); })
      .then(function () { return refreshStatus(true); })
      .then(function () {
        if (net.running && net.tun && net.online) { toast(t('toastOk') + (net.ip ? ' · ' + net.ip : '')); return; }
        // Tunnel up but no internet through it (dead server / revoked key) would black-hole the TV: tear it down.
        var why = net.running && net.tun ? t('deadTunnel') : t('noTunnel');
        return sh(VPNCTL + ' stop >/dev/null 2>&1; tail -8 ' + DIR + '/xray.log 2>&1').then(function (log) {
          net.running = false; net.tun = false; net.ip = ''; net.upSince = 0;
          phase = false;
          showLog(t('failedH'), log, why, true);
        });
      })
      .catch(function (e) { phase = false; showLog(t('errorH'), errText(e), '', true); })
      .then(function () { setBusy(false); render(); });
  }

  function disconnect() {
    setBusy(true, true);
    return needService()
      .then(function () { return sh(VPNCTL + ' stop 2>&1'); })
      .then(function () { return refreshStatus(false); })
      .then(function () { toast(t('toastOff')); })
      .catch(function (e) { toast(t('toastErr') + errText(e), 6000); })
      .then(function () { setBusy(false); render(); });
  }

  function toggle() {
    if (busy) return;
    if (net.running) return disconnect();
    var a = activeServer();
    if (!a) { toast(t('toastNoSrv')); return; }
    return connect(a);
  }

  // ---------- subscriptions ----------
  // Real identity of this TV, sent the way provider apps do it (HWID = SHA-256 of the Wi-Fi MAC), so
  // device-limited subscriptions can register the TV honestly.
  var devHeaders = null;
  function deviceHeaders() {
    if (devHeaders) return Promise.resolve(devHeaders);
    var cmd = "cat /sys/class/net/wlan0/address | tr -d ':\\n' | openssl dgst -sha256 | awk '{print $NF}'; " +
      "sed -n 's/.*release \\([0-9.]*\\).*/\\1/p' /etc/starfish-release | head -1";
    return Promise.all([
      sh(cmd),
      Luna.call('luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName'] }).catch(function () { return {}; })
    ]).then(function (r) {
      var l = r[0].split('\n');
      devHeaders = { hwid: (l[0] || '').trim(), os: (l[1] || '').trim(), model: r[1].modelName || 'LG TV' };
      return devHeaders;
    });
  }

  function fetchSub(url) {
    return deviceHeaders().then(function (d) {
      var cmd = 'curl -sL -m 25 -A ' + q('XrayVPN-webOS/0.1') +
        ' -H ' + q('x-hwid: ' + d.hwid) + ' -H ' + q('x-device-os: webOS') +
        ' -H ' + q('x-ver-os: ' + d.os) + ' -H ' + q('x-device-model: ' + d.model) +
        ' -o /tmp/xv_sub -w "%{http_code}" ' + q(url) + '; echo " rc=$?"; cat /tmp/xv_sub 2>/dev/null';
      // Drop the previous download first: a failed curl must not make us parse an old subscription.
      return needService().then(function () { return sh('rm -f /tmp/xv_sub; ' + cmd); });
    }).then(function (out) {
      var nl = out.indexOf('\n'), head = out.slice(0, nl), body = out.slice(nl + 1);
      var m = /^(\d+) rc=(\d+)/.exec(head);
      if (!m || m[2] !== '0') {
        var rc = m ? m[2] : '?';
        // 28 timeout, 7 refused, 6 DNS: the host is most likely blocked on this network; a running tunnel fixes that.
        throw new Error(t('subDl') + rc + ')' + (/^(28|7|6|35|52|56)$/.test(rc) ? '. ' + t(net.running ? 'subViaDead' : 'subBlocked') : ''));
      }
      if (m[1] !== '200') throw new Error(t('subHttp') + m[1]);
      var servers = XParse.parseSubscription(body);
      if (!servers.length) throw new Error(t('subNone'));
      return servers;
    });
  }

  function hostOf(url) { var m = /^https?:\/\/([^\/:?#]+)/i.exec(url); return m ? m[1] : t('subDefault'); }

  function addInput(text) {
    text = text.trim();
    if (!text) return Promise.resolve();
    var lines = text.split(/\s*\n\s*/).filter(Boolean);
    var chain = Promise.resolve(), added = 0;
    lines.forEach(function (line) {
      chain = chain.then(function () {
        if (/^https?:\/\//i.test(line)) {
          return fetchSub(line).then(function (servers) {
            var ex = S.subs.filter(function (s) { return s.url === line; })[0];
            if (ex) { ex.servers = servers; ex.updated = Date.now(); S.tab = ex.id; }
            else { var id = uid(); S.subs.push({ id: id, name: hostOf(line), url: line, updated: Date.now(), servers: servers }); S.tab = id; }
            added += servers.length;
          });
        }
        var s = XParse.safeParse(line);
        if (s.error) throw new Error(s.error);
        S.manual.push(s); S.tab = 'manual'; added++;
      });
    });
    return chain.then(function () { save(); render(); toast(t('addedN') + added); })
      .catch(function (e) {
        // A toast vanishes in seconds: keep the failure on screen, with a retry for the same input.
        lastAdd = text; save(); render();
        showLog(t('addFailH'), null, errText(e), true, 'readd', 'close');
      });
  }

  function refreshSubs() {
    var cur = S.subs.filter(function (s) { return s.id === S.tab; });
    var targets = cur.length ? cur : S.subs;
    if (!targets.length) { toast(t('noSubs')); return; }
    setBusy(true); toast(t('refreshing'), 30000);
    var chain = Promise.resolve(), ok = 0, fail = 0;
    targets.forEach(function (s) {
      chain = chain.then(function () { return fetchSub(s.url); })
        .then(function (sv) { s.servers = sv; s.updated = Date.now(); ok++; })
        .catch(function () { fail++; });
    });
    return chain.then(function () { save(); setBusy(false); render(); toast(t('refreshed') + ok + (fail ? t('errors') + fail : '')); });
  }

  // ---------- ping ----------
  function pingAll() {
    // The tunnel intercepts probe connections and every server would show ~1 ms.
    if (net.running) { toast(t('pingOff')); return; }
    var list = curServers(), lines = [];
    list.forEach(function (s, i) {
      if (s.error || s.udp || !/^[A-Za-z0-9.:\-]+$/.test(s.address)) return;
      lines.push('(t=$(curl -s -m 4 -o /dev/null -w "%{time_connect}" telnet://' + s.address + ':' + s.port + ' </dev/null 2>/dev/null); echo "' + i + ' $t") &');
    });
    if (!lines.length) { toast(t('pingNone')); return; }
    setBusy(true); toast(t('pingN') + lines.length, 15000);
    var cmd = lines.join('\n') + '\nwait';
    return sh(cmd).then(function (out) {
      out.split('\n').forEach(function (l) {
        var m = /^(\d+) ([\d.]+)/.exec(l.trim());
        if (!m) return;
        var tm = parseFloat(m[2]), s = list[+m[1]];
        pings[keyOf(s)] = tm > 0 ? Math.round(tm * 1000) : -1;
      });
    }).catch(function (e) { toast(errText(e), 5000); })
      .then(function () { setBusy(false); render(); toast(t('done')); });
  }

  // ---------- modals ----------
  function openModal(html, focusAct) {
    modalOpen = true; $('modalBox').innerHTML = html; $('modal').hidden = false;
    var f = focusAct && $('modalBox').querySelector('[data-act="' + focusAct + '"]');
    if (f) f.focus(); else focusFirst($('modalBox'));
  }
  function closeModal() {
    modalOpen = false; $('modal').hidden = true; $('modalBox').innerHTML = '';
    stopPhone();
    var b = $('btnConnect'); if (b) b.focus();
  }

  // Plain log: showLog(title, text). Error: showLog(title, log, lead, true) — red badge, explanation, retry buttons.
  function showLog(title, text, lead, isError, retryAct, closeKey) {
    $('toast').hidden = true;                       // drop a stale "Connecting…" toast
    if (isError) {
      openModal('<div class="badge">' + esc(t('badge')) + '</div><h2>' + esc(title) + '</h2>' +
        (lead ? '<p class="lead">' + esc(lead) + '</p>' : '') + (text === null ? '' : '<pre>' + esc(text || t('empty')) + '</pre>') +
        '<div class="btns"><button class="f primary" data-act="' + (retryAct || 'retry') + '">' + esc(t('retry')) + '</button>' +
        '<button class="f ghost" data-act="close">' + esc(t(closeKey || 'otherServer')) + '</button></div>');
    } else {
      openModal('<h2>' + esc(title) + '</h2><pre>' + esc(text || t('empty')) + '</pre>' +
        '<div class="btns"><button class="f primary" data-act="close">' + esc(t('close')) + '</button></div>');
    }
  }

  // First run: sync helper scripts and fetch Xray-core if the TV has none (no PC needed).
  // The TV often opens the app right at boot while the root service is still starting, so a timeout is not
  // a verdict: retry quietly, and report "service not answering" (not "Xray failed") if it never answers.
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function runSetup(attempt) {
    attempt = attempt || 0;
    if (attempt === 0) { if (setupRunning) return Promise.resolve(); setupRunning = true; }
    return Setup.ensure(function () {
      openModal('<h2>' + esc(t('setupH')) + '</h2><p>' + esc(t('setupP')) + '</p><div class="waiting">' + esc(t('hintWait')) + '</div>');
    }).then(function (did) {
      setupRunning = false; setupPending = false;
      if (did) { closeModal(); toast(t('setupDone')); }
    }, function (e) {
      if (e && e.timeout && attempt < 3) return sleep(5000 * (attempt + 1)).then(function () { return runSetup(attempt + 1); });
      setupRunning = false;
      if (e && e.timeout) { setupPending = true; toast(t('svcDead'), 8000); return; }   // retried by the status timer
      setupPending = false;
      showLog(t('setupFailH'), errText(e), t('setupFailLead'), true, 'setup', 'close');
    });
  }

  function showAdd() {
    openModal('<h2>' + esc(t('addH')) + '</h2><p>' + esc(t('addP')) + '</p>' +
      '<input id="addInput" class="f" type="text" placeholder="' + esc(t('addPh')) + '">' +
      '<div class="protos"><span>https://</span><span>vless://</span><span>vmess://</span><span>trojan://</span><span>ss://</span><span>hy2://</span></div>' +
      '<div class="callout"><div class="txt"><div class="t1">' + esc(t('calloutH')) + '</div><p>' + esc(t('calloutP')) + '</p></div>' +
      '<button class="f ghost vio s" data-act="phone">' + esc(t('calloutBtn')) + '</button></div>' +
      '<div class="btns"><button class="f primary" data-act="addok">' + esc(t('add').replace(/^\+\s*/, '')) + '</button>' +
      '<button class="f ghost" data-act="close">' + esc(t('cancel')) + '</button></div>');
  }

  function stopPhone() {
    if (phonePoll) { clearInterval(phonePoll); phonePoll = null; sh('kill $(cat /tmp/xv_srv.pid) 2>/dev/null; rm -f /tmp/xv_srv.pid'); }
  }

  function qrSvg(text) {
    try { var qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag(4, 0); } catch (e) { return ''; }
  }

  function showPhone() {
    if (!net.lan) { toast(t('noLan')); return; }
    if (modalOpen) closeModal();
    sh('rm -f /tmp/xv_add.txt; (node ' + Luna.APP_DIR + '/addsrv.js >/tmp/xv_srv.log 2>&1 & echo $! >/tmp/xv_srv.pid)').then(function () {
      var url = 'http://' + net.lan + ':8088';
      openModal('<div class="phone"><div class="l"><h2>' + esc(t('phoneH')) + '</h2><div class="steps">' +
        '<div class="step"><i>1</i><span>' + esc(t('step1')) + '</span></div>' +
        '<div class="step"><i>2</i><span>' + esc(t('step2')) + '</span></div>' +
        '<div class="step"><i>3</i><span>' + esc(t('step3')) + '</span></div></div>' +
        '<div class="bigurl"><div class="proto">http://</div><div class="host">' + esc(net.lan + ':8088') + '</div></div>' +
        '<div class="waiting">' + esc(t('waiting')) + '</div></div>' +
        '<div class="r"><div class="qr">' + qrSvg(url) + '</div><p>' + esc(t('qrHint')) + '</p></div></div>' +
        '<div class="btns"><button class="f ghost" data-act="close">' + esc(t('cancel')) + '</button></div>');
      phonePoll = setInterval(function () {
        sh('cat /tmp/xv_add.txt 2>/dev/null && rm -f /tmp/xv_add.txt').then(function (txt) {
          if (!txt.trim()) return;
          closeModal(); addInput(txt);
        });
      }, 2000);
    });
  }

  function sw(on) { return '<span class="sw' + (on ? ' on' : '') + '"></span>'; }

  function showSettings(focusAct) {
    var onSub = !!curSub();
    var h = '<h2>' + esc(t('setH')) + '</h2>' +
      '<button class="f setrow" data-act="set-ru"><span class="txt"><span class="t1">' + esc(t('ruT')) + '</span><span class="t2">' + esc(t('ruD')) + '</span></span>' + sw(S.settings.ruDirect) + '</button>' +
      '<button class="f setrow" data-act="set-auto"><span class="txt"><span class="t1">' + esc(t('autoT')) + '</span><span class="t2">' + esc(t('autoD')) + '</span></span>' + sw(S.settings.autostart) + '</button>' +
      '<p class="note">' + esc(t('note')) + '</p>' +
      '<div class="btns">' +
      '<button class="f ghost s" data-act="ip">' + esc(t('checkIp')) + '</button>' +
      '<button class="f ghost s" data-act="log">' + esc(t('log')) + '</button>' +
      (onSub ? '<button class="f ghost s danger" data-act="delsub">' + esc(t('delSub')) + '</button>' : '') +
      '<button class="f primary s push" data-act="close">' + esc(t('ready')) + '</button></div>';
    openModal(h, focusAct);
  }

  // ---------- actions ----------
  function onAct(el) {
    var act = el.getAttribute('data-act');
    switch (act) {
      case 'toggle': toggle(); break;
      case 'tab': S.tab = el.getAttribute('data-id'); save(); render(); break;
      case 'server': {
        var s = curServers()[+el.getAttribute('data-i')];
        if (s && !busy) connect(s);
        break;
      }
      case 'refresh': refreshSubs(); break;
      case 'ping': pingAll(); break;
      case 'add': showAdd(); break;
      case 'settings': showSettings(); break;
      case 'close': closeModal(); break;
      case 'retry': { var a = activeServer(); closeModal(); if (a) connect(a); break; }
      case 'addok': {
        var v = $('addInput').value; closeModal(); addInput(v); break;
      }
      case 'phone': showPhone(); break;
      case 'setup': closeModal(); runSetup(); break;
      case 'readd': { var again = lastAdd; closeModal(); addInput(again); break; }
      case 'set-ru': S.settings.ruDirect = !S.settings.ruDirect; save(); showSettings('set-ru'); break;
      case 'set-auto': {
        var want = S.settings.autostart ? 'off' : 'on';
        sh(VPNCTL + ' autostart ' + want).then(function () { return refreshStatus(false); }).then(function () { showSettings('set-auto'); });
        break;
      }
      case 'ip': closeModal(); toast(t('checkingIp'), 10000); refreshStatus(true).then(function () { renderHero(); toast(net.ip ? t('extIpIs') + net.ip : t('ipNone')); }); break;
      case 'log': sh('tail -9 ' + DIR + '/xray.log 2>&1').then(function (txt) { showLog(t('log'), txt); }); break;
      case 'delsub': {
        // Deleting the subscription that holds the connected server must not leave a tunnel running with no
        // server on screen: stop it.
        var gone = curSub(), hadActive = gone && gone.servers.some(function (s) { return keyOf(s) === S.activeKey; });
        S.subs = S.subs.filter(function (s) { return s.id !== S.tab; });
        S.tab = 'manual'; if (hadActive) S.activeKey = null;
        save(); closeModal(); render();
        if (hadActive && net.running) disconnect();
        break;
      }
    }
  }

  // ---------- focus / remote control ----------
  function scope() { return modalOpen ? $('modalBox') : document.getElementById('app'); }
  function focusables() { return Array.prototype.slice.call(scope().querySelectorAll('.f')).filter(function (e) { return e.offsetParent !== null; }); }
  function focusFirst(root) { var f = root.querySelector('.f'); if (f) f.focus(); }

  function move(dir) {
    var cur = document.activeElement, all = focusables();
    if (!cur || all.indexOf(cur) < 0) { if (all[0]) all[0].focus(); return; }
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bs = 1e12;
    all.forEach(function (e) {
      if (e === cur) return;
      var b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2, dx = x - cx, dy = y - cy, p, o;
      if (dir === 'left') { if (dx >= -2) return; p = -dx; o = Math.abs(dy); }
      else if (dir === 'right') { if (dx <= 2) return; p = dx; o = Math.abs(dy); }
      else if (dir === 'up') { if (dy >= -2) return; p = -dy; o = Math.abs(dx); }
      else { if (dy <= 2) return; p = dy; o = Math.abs(dx); }
      var sc = p + o * 3;
      if (sc < bs) { bs = sc; best = e; }
    });
    if (best) { best.focus(); if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest' }); }
  }

  document.addEventListener('keydown', function (ev) {
    var k = ev.keyCode, tg = ev.target, isInput = tg && tg.tagName === 'INPUT';
    if (k === 461 || k === 27 || k === 8 && !isInput) {            // Back / Esc / Backspace
      if (modalOpen) { closeModal(); ev.preventDefault(); }
      else if (window.PalmSystem && PalmSystem.platformBack) PalmSystem.platformBack();
      else if (k === 461 && window.history && history.length > 1) history.back();
      return;
    }
    if (isInput && (k === 37 || k === 39)) return;                   // caret movement
    var dir = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[k];
    if (dir) { move(dir); ev.preventDefault(); return; }
    if (k === 13 && !isInput) {
      var el = document.activeElement;
      if (el && el.getAttribute && el.getAttribute('data-act')) { onAct(el); ev.preventDefault(); }
    }
  });

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (el) onAct(el);
  });

  // ---------- boot ----------
  if (/[#&]debug(&|$)/.test(location.hash)) window.XV = { S: S, connect: connect, net: net, render: render, addInput: addInput, pingAll: pingAll, pings: pings, curServers: curServers, refreshStatus: refreshStatus };
  applyStatic();
  load();
  render();
  $('btnConnect').focus();
  // Status first, then setup: at boot the root service is busy, and two calls at once make it slower.
  refreshStatus(false, true).then(function () {
    render();
    if (net.running) refreshStatus(true, true).then(renderHero);
    return runSetup();
  });

  // Coming back from another app the page may have missed state changes (the watchdog can stop a dead tunnel
  // while we are away), and a stuck busy flag would block the buttons: resync right away.
  function onResume() {
    if (busy && Date.now() - busySince > 150000) { busy = false; phase = false; }
    if (busy) return;
    refreshStatus(false, true).then(function () { render(); if (setupPending) runSetup(); });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) onResume(); });
  document.addEventListener('webOSRelaunch', onResume);
  window.addEventListener('focus', onResume);

  setInterval(function () {
    if (busy && Date.now() - busySince > 150000) { busy = false; phase = false; render(); }
    if (busy || modalOpen) return;
    refreshStatus(false, true).then(function () { renderHero(); renderList(); if (setupPending) runSetup(); });
  }, 15000);
  setInterval(tickUptime, 1000);
})();
