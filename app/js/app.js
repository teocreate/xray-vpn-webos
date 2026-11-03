// UI + control logic. All privileged work goes through Luna.sh (root shell on the rooted TV).
(function () {
  'use strict';

  var DIR = Luna.DIR, sh = Luna.sh, q = Luna.q;
  var VPNCTL = DIR + '/vpnctl';
  var STORE_KEY = 'xv_state_v1';

  var S = { subs: [], manual: [], tab: 'manual', activeKey: null, settings: { ruDirect: false, autostart: false } };
  var pings = {};            // serverKey -> ms | -1
  var net = { running: false, tun: false, online: false, failed: false, iface: 'wlan0', lan: '', ip: '' };
  var busy = false;
  var modalOpen = false;
  var phonePoll = null;

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
  function curServers() {
    if (S.tab === 'manual') return S.manual;
    for (var i = 0; i < S.subs.length; i++) if (S.subs[i].id === S.tab) return S.subs[i].servers;
    S.tab = 'manual'; return S.manual;
  }
  function allServers() {
    return S.manual.concat.apply(S.manual, S.subs.map(function (s) { return s.servers; }));
  }
  function activeServer() {
    var a = allServers();
    for (var i = 0; i < a.length; i++) if (keyOf(a[i]) === S.activeKey) return a[i];
    return null;
  }

  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }

  // ---------- rendering ----------
  function render() {
    renderTabs(); renderList(); renderHero();
  }

  function renderTabs() {
    var h = '<button class="f tab' + (S.tab === 'manual' ? ' sel' : '') + '" data-act="tab" data-id="manual">Мои серверы (' + S.manual.length + ')</button>';
    S.subs.forEach(function (s) {
      h += '<button class="f tab' + (S.tab === s.id ? ' sel' : '') + '" data-act="tab" data-id="' + s.id + '">' + esc(s.name) + ' (' + s.servers.length + ')</button>';
    });
    $('tabs').innerHTML = h;
  }

  function msClass(ms) { return ms < 0 ? 'bad' : ms < 150 ? 'good' : ms < 400 ? 'mid' : 'bad'; }

  function renderList() {
    var list = curServers(), h = '';
    if (!list.length) {
      h = '<div class="empty">Здесь пока пусто.<br>Нажмите «+ Добавить» и введите ссылку на подписку<br>или отправьте её с телефона.</div>';
    }
    list.forEach(function (s, i) {
      var k = keyOf(s), p = pings[k], ms = '';
      if (s.error) ms = '';
      else if (p === undefined) ms = s.udp ? 'UDP' : '';
      else ms = p < 0 ? 'x' : p + ' мс';
      var meta = s.error ? esc(s.error) : esc(s.protocol + (s.network ? ' · ' + s.network : '') + (s.security && s.security !== 'none' ? ' · ' + s.security : ''));
      h += '<div class="f row' + (k === S.activeKey && net.running ? ' active' : '') + (s.error ? ' err' : '') + '" data-act="server" data-i="' + i + '">' +
        '<span class="name">' + esc(s.name) + '</span><span class="meta">' + meta + '</span>' +
        '<span class="ms ' + (p !== undefined ? msClass(p) : '') + '">' + ms + '</span></div>';
    });
    $('list').innerHTML = h;
  }

  function renderHero() {
    var b = $('btnConnect'), pill = $('pill'), a = activeServer();
    if (busy) { pill.className = 'pill busy'; pill.textContent = 'Подождите…'; }
    else if (net.running && net.tun) { pill.className = 'pill on'; pill.textContent = 'Подключено'; }
    else if (net.running) { pill.className = 'pill busy'; pill.textContent = 'Запущено, туннеля нет'; }
    else { pill.className = 'pill off'; pill.textContent = 'Отключено'; }
    var on = net.running;
    b.textContent = on ? 'Отключить' : 'Подключить';
    b.className = 'f big' + (on ? ' stop' : '');
    $('heroTitle').textContent = a ? a.name : 'Сервер не выбран';
    var sub = [];
    if (a) sub.push(a.protocol + ' · ' + a.address + ':' + a.port);
    if (net.running && net.ip) sub.push('Внешний IP: ' + net.ip);
    if (net.failed && !net.running) sub.push('Туннель остановлен: сервер перестал отвечать, интернет ТВ не затронут');
    if (!a) sub.push('Выберите сервер в списке — он подключится сразу');
    $('heroSub').textContent = sub.join('\n');
  }

  // ---------- TV status ----------
  function refreshStatus(withIp) {
    var cmd = 'P=$(cat ' + DIR + '/xray.pid 2>/dev/null); if [ -n "$P" ] && kill -0 $P 2>/dev/null; then echo run=1; else echo run=0; fi; ' +
      'ip link show xray-tun >/dev/null 2>&1 && echo tun=1 || echo tun=0; ' +
      "ip route | awk '/^default/{print \"iface=\"$5; exit}'; " +
      "ip -4 addr show wlan0 2>/dev/null | awk '/inet /{split($2,a,\"/\"); print \"lan=\"a[1]; exit}'; " +
      '[ -f ' + DIR + '/.autostart ] && echo auto=1 || echo auto=0; ' +
      '[ -f ' + DIR + '/.failed ] && echo failed=1 || echo failed=0' +
      (withIp ? '; [ "$(curl -s -m 6 -o /dev/null -w %{http_code} https://www.gstatic.com/generate_204 2>/dev/null)" = 204 ] && echo online=1 || echo online=0; ' +
        'echo ip=$(curl -sf -m 5 https://api.ipify.org 2>/dev/null || curl -sf -m 5 https://ifconfig.me/ip 2>/dev/null)' : '');
    return sh(cmd).then(function (out) {
      var m = {};
      out.split('\n').forEach(function (l) { var i = l.indexOf('='); if (i > 0) m[l.slice(0, i)] = l.slice(i + 1).trim(); });
      net.running = m.run === '1'; net.tun = m.tun === '1'; net.failed = m.failed === '1';
      if (m.iface && m.iface !== 'xray-tun') net.iface = m.iface;
      if (m.lan) net.lan = m.lan;
      S.settings.autostart = m.auto === '1';
      if (withIp) { net.ip = /^[0-9a-f.:]+$/i.test(m.ip || '') ? m.ip : ''; net.online = m.online === '1'; }
      if (!net.running) net.ip = '';
    }).catch(function (e) { toast('Нет связи с сервисом root: ' + e.message, 6000); });
  }

  // ---------- connect / disconnect ----------
  function setBusy(v) { busy = v; renderHero(); }

  function connect(server) {
    if (server.error) { toast('Сервер не поддерживается: ' + server.error, 5000); return Promise.resolve(); }
    S.activeKey = keyOf(server); save();
    setBusy(true); toast('Подключаюсь к ' + server.name + '…', 30000);
    var cfg = XConfig.buildConfig(server, { iface: net.iface, ruDirect: S.settings.ruDirect });
    var newPath = DIR + '/config.new.json';
    return Luna.writeFile(newPath, JSON.stringify(cfg, null, 2))
      .then(function () { return sh(DIR + '/xray run -test -c ' + newPath + ' 2>&1 | tail -6'); })
      .then(function (out) {
        if (out.indexOf('Configuration OK') < 0) throw new Error('Конфиг отклонён Xray:\n' + out.trim());
        return sh('mv ' + newPath + ' ' + DIR + '/config.json && ' + VPNCTL + ' restart 2>&1');
      })
      .then(function () { return sh('sleep 2'); })
      .then(function () { return refreshStatus(true); })
      .then(function () {
        if (net.running && net.tun && net.online) { toast('Подключено' + (net.ip ? ' · ' + net.ip : '')); return; }
        // Tunnel up but no internet through it (dead server / revoked key) would black-hole the TV: tear it down.
        var why = net.running && net.tun
          ? 'Туннель поднялся, но интернета через него нет. Сервер не отвечает или ключ отозван. Туннель остановлен, чтобы ТВ не остался без сети.'
          : 'Туннель не поднялся.';
        return sh(VPNCTL + ' stop >/dev/null 2>&1; tail -8 ' + DIR + '/xray.log 2>&1').then(function (log) {
          net.running = false; net.tun = false; net.ip = '';
          showLog('Не удалось подключиться', why + '\n\n' + log);
        });
      })
      .catch(function (e) { showLog('Ошибка подключения', e.message); })
      .then(function () { setBusy(false); render(); });
  }

  function disconnect() {
    setBusy(true);
    return sh(VPNCTL + ' stop 2>&1')
      .then(function () { return refreshStatus(false); })
      .then(function () { toast('Отключено'); })
      .catch(function (e) { toast('Ошибка: ' + e.message, 6000); })
      .then(function () { setBusy(false); render(); });
  }

  function toggle() {
    if (busy) return;
    if (net.running) return disconnect();
    var a = activeServer();
    if (!a) { toast('Сначала выберите сервер в списке'); return; }
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
        ' -o /tmp/xv_sub -w "%{http_code}" ' + q(url) + '; echo " rc=$?"; cat /tmp/xv_sub';
      return sh(cmd);
    }).then(function (out) {
      var nl = out.indexOf('\n'), head = out.slice(0, nl), body = out.slice(nl + 1);
      var m = /^(\d+) rc=(\d+)/.exec(head);
      if (!m || m[2] !== '0') throw new Error('Не удалось скачать подписку (curl rc=' + (m ? m[2] : '?') + ')');
      if (m[1] !== '200') throw new Error('Сервер подписки ответил HTTP ' + m[1]);
      var servers = XParse.parseSubscription(body);
      if (!servers.length) throw new Error('В подписке нет серверов');
      return servers;
    });
  }

  function hostOf(url) { var m = /^https?:\/\/([^\/:?#]+)/i.exec(url); return m ? m[1] : 'Подписка'; }

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
    return chain.then(function () { save(); render(); toast('Добавлено серверов: ' + added); })
      .catch(function (e) { toast(e.message, 6000); });
  }

  function refreshSubs() {
    var cur = S.subs.filter(function (s) { return s.id === S.tab; });
    var targets = cur.length ? cur : S.subs;
    if (!targets.length) { toast('Нет подписок для обновления'); return; }
    setBusy(true); toast('Обновляю подписки…', 30000);
    var chain = Promise.resolve(), ok = 0, fail = 0;
    targets.forEach(function (s) {
      chain = chain.then(function () { return fetchSub(s.url); })
        .then(function (sv) { s.servers = sv; s.updated = Date.now(); ok++; })
        .catch(function () { fail++; });
    });
    return chain.then(function () { save(); setBusy(false); render(); toast('Обновлено: ' + ok + (fail ? ', ошибок: ' + fail : '')); });
  }

  // ---------- ping ----------
  function pingAll() {
    // The tunnel intercepts probe connections and every server would show ~1 ms.
    if (net.running) { toast('Для замера пинга сначала отключите VPN'); return; }
    var list = curServers(), lines = [];
    list.forEach(function (s, i) {
      if (s.error || s.udp || !/^[A-Za-z0-9.:\-]+$/.test(s.address)) return;
      lines.push('(t=$(curl -s -m 4 -o /dev/null -w "%{time_connect}" telnet://' + s.address + ':' + s.port + ' </dev/null 2>/dev/null); echo "' + i + ' $t") &');
    });
    if (!lines.length) { toast('Нечего пинговать'); return; }
    setBusy(true); toast('Пингую ' + lines.length + ' серверов…', 15000);
    var cmd = lines.join('\n') + '\nwait';
    return sh(cmd).then(function (out) {
      out.split('\n').forEach(function (l) {
        var m = /^(\d+) ([\d.]+)/.exec(l.trim());
        if (!m) return;
        var t = parseFloat(m[2]), s = list[+m[1]];
        pings[keyOf(s)] = t > 0 ? Math.round(t * 1000) : -1;
      });
    }).catch(function (e) { toast(e.message, 5000); })
      .then(function () { setBusy(false); render(); toast('Готово'); });
  }

  // ---------- modals ----------
  function openModal(html) {
    modalOpen = true; $('modalBox').innerHTML = html; $('modal').hidden = false; focusFirst($('modalBox'));
  }
  function closeModal() {
    modalOpen = false; $('modal').hidden = true; $('modalBox').innerHTML = '';
    stopPhone();
    var b = document.querySelector('#app .f'); if (b) b.focus();
  }

  function showLog(title, text) {
    openModal('<h2>' + esc(title) + '</h2><pre>' + esc(text || '(пусто)') + '</pre><div class="btns"><button class="f btn" data-act="close">Закрыть</button></div>');
  }

  function showAdd() {
    openModal('<h2>Добавить</h2><p>Ссылка на подписку (https://…) или ссылка сервера (vless://, vmess://, trojan://, ss://, hy2://).</p>' +
      '<input id="addInput" class="f" type="text" placeholder="https://…"><div class="btns">' +
      '<button class="f btn" data-act="addok">Добавить</button>' +
      '<button class="f btn" data-act="phone">Ввести с телефона</button>' +
      '<button class="f btn" data-act="close">Отмена</button></div>');
  }

  function stopPhone() {
    if (phonePoll) { clearInterval(phonePoll); phonePoll = null; sh('kill $(cat /tmp/xv_srv.pid) 2>/dev/null; rm -f /tmp/xv_srv.pid'); }
  }

  function showPhone() {
    if (!net.lan) { toast('Не удалось определить IP телевизора'); return; }
    sh('rm -f /tmp/xv_add.txt; (node ' + Luna.APP_DIR + '/addsrv.js >/tmp/xv_srv.log 2>&1 & echo $! >/tmp/xv_srv.pid)').then(function () {
      openModal('<h2>Ввод с телефона</h2><p>Телефон должен быть в той же Wi-Fi сети. Откройте в браузере адрес:</p>' +
        '<div class="bigurl">http://' + esc(net.lan) + ':8088</div><p>Вставьте ссылку и нажмите «Отправить» — она появится здесь автоматически.</p>' +
        '<div class="btns"><button class="f btn" data-act="close">Отмена</button></div>');
      phonePoll = setInterval(function () {
        sh('cat /tmp/xv_add.txt 2>/dev/null && rm -f /tmp/xv_add.txt').then(function (txt) {
          if (!txt.trim()) return;
          closeModal(); addInput(txt);
        });
      }, 2000);
    });
  }

  function showSettings() {
    var onSub = S.subs.filter(function (s) { return s.id === S.tab; }).length > 0;
    var h = '<h2>Настройки</h2>' +
      '<div class="f setrow" data-act="set-ru"><span>Российские домены (.ru .su .рф) напрямую</span><span class="sw ' + (S.settings.ruDirect ? 'on' : '') + '">' + (S.settings.ruDirect ? 'ВКЛ' : 'ВЫКЛ') + '</span></div>' +
      '<div class="f setrow" data-act="set-auto"><span>Автозапуск при включении ТВ</span><span class="sw ' + (S.settings.autostart ? 'on' : '') + '">' + (S.settings.autostart ? 'ВКЛ' : 'ВЫКЛ') + '</span></div>' +
      '<div class="btns">' +
      '<button class="f btn" data-act="ip">Проверить IP</button>' +
      '<button class="f btn" data-act="log">Журнал Xray</button>' +
      (onSub ? '<button class="f btn" data-act="delsub">Удалить подписку</button>' : '') +
      '<button class="f btn" data-act="close">Закрыть</button></div>' +
      '<p>Смена маршрутизации применяется при следующем подключении.</p>';
    openModal(h);
  }

  // ---------- actions ----------
  function onAct(el) {
    var act = el.getAttribute('data-act');
    switch (act) {
      case 'toggle': toggle(); break;
      case 'tab': S.tab = el.getAttribute('data-id'); save(); render(); focusSel('.tab.sel'); break;
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
      case 'addok': {
        var v = $('addInput').value; closeModal(); addInput(v); break;
      }
      case 'phone': showPhone(); break;
      case 'set-ru': S.settings.ruDirect = !S.settings.ruDirect; save(); showSettings(); break;
      case 'set-auto': {
        var want = S.settings.autostart ? 'off' : 'on';
        sh(VPNCTL + ' autostart ' + want).then(function () { return refreshStatus(false); }).then(function () { showSettings(); });
        break;
      }
      case 'ip': closeModal(); toast('Проверяю IP…', 10000); refreshStatus(true).then(function () { renderHero(); toast(net.ip ? 'Внешний IP: ' + net.ip : 'IP не получен'); }); break;
      case 'log': sh('tail -40 ' + DIR + '/xray.log 2>&1').then(function (t) { showLog('Журнал Xray', t); }); break;
      case 'delsub':
        S.subs = S.subs.filter(function (s) { return s.id !== S.tab; });
        S.tab = 'manual'; save(); closeModal(); render(); break;
    }
  }

  // ---------- focus / remote control ----------
  function scope() { return modalOpen ? $('modalBox') : document.getElementById('app'); }
  function focusables() { return Array.prototype.slice.call(scope().querySelectorAll('.f')).filter(function (e) { return e.offsetParent !== null; }); }
  function focusFirst(root) { var f = root.querySelector('.f'); if (f) f.focus(); }
  function focusSel(sel) { var e = document.querySelector(sel); if (e) e.focus(); }

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
    var k = ev.keyCode, t = ev.target, isInput = t && t.tagName === 'INPUT';
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
  if (location.hash === '#debug') window.XV = { S: S, connect: connect, net: net, render: render, addInput: addInput, pingAll: pingAll, curServers: curServers, refreshStatus: refreshStatus };
  load();
  render();
  focusFirst($('app'));
  refreshStatus(false).then(function () {
    renderHero(); renderList();
    if (net.running) refreshStatus(true).then(renderHero);
  });
  setInterval(function () { if (!busy && !modalOpen) refreshStatus(false).then(function () { renderHero(); }); }, 15000);
})();
