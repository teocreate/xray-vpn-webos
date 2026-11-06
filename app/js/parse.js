// Share-link and subscription parsing. ES5 so it runs on webOS 4 (Chromium 53) and in Node for tests.
(function (root) {
  'use strict';

  // Error texts end up on screen (list rows, add dialog), so they follow the UI language like i18n.js.
  var LANG = /^(ru|uk|be|kk)/i.test((root.navigator && root.navigator.language) || 'ru') ? 'ru' : 'en';
  var MSG = {
    ru: { parse: 'Не удалось разобрать ссылку', xhttp: 'Некорректный extra в xhttp', transport: 'Транспорт не поддерживается: ', insecure: 'небезопасный TLS, отказ',
      vless: 'vless: нет uuid/хоста/порта', trojan: 'trojan: нет пароля/хоста/порта', vmess: 'vmess: нет id/хоста/порта', ssBad: 'ss: некорректная ссылка',
      ssPlugin: 'ss: plugin не поддерживается', hy2: 'hysteria2: нет хоста/порта', hy2obfs: 'hysteria2: obfs не поддерживается', notLink: 'Не ссылка', proto: 'Протокол не поддерживается: ' },
    en: { parse: 'Could not parse the link', xhttp: 'Invalid xhttp extra', transport: 'Transport not supported: ', insecure: 'insecure TLS, refused',
      vless: 'vless: missing uuid/host/port', trojan: 'trojan: missing password/host/port', vmess: 'vmess: missing id/host/port', ssBad: 'ss: invalid link',
      ssPlugin: 'ss: plugins are not supported', hy2: 'hysteria2: missing host/port', hy2obfs: 'hysteria2: obfs is not supported', notLink: 'Not a link', proto: 'Protocol not supported: ' }
  };
  function M(k) { return MSG[LANG][k]; }

  function b64d(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
  }

  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  function qparse(qs) {
    var o = {};
    (qs || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i < 0 ? kv : kv.slice(0, i);
      o[dec(k)] = i < 0 ? '' : dec(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return o;
  }

  var URI_RE = /^([a-z0-9]+):\/\/(?:([^@\/?#]*)@)?(\[[^\]]+\]|[^:\/?#]+)(?::(\d+))?\/?(?:\?([^#]*))?(?:#(.*))?$/i;

  function splitUri(uri) {
    var m = URI_RE.exec(uri.trim());
    if (!m) throw new Error(M('parse'));
    var host = m[3];
    if (host.charAt(0) === '[') host = host.slice(1, -1);
    return {
      scheme: m[1].toLowerCase(), user: dec(m[2] || ''), host: host,
      port: m[4] ? parseInt(m[4], 10) : 0, q: qparse(m[5]), name: dec(m[6] || '')
    };
  }

  function applyStream(q, defSec) {
    var net = q.type || q.net || 'tcp';
    if (net === 'raw') net = 'tcp';
    if (net === 'splithttp') net = 'xhttp';
    var s = { network: net };
    if (net === 'ws') {
      s.wsSettings = { path: q.path || '/', headers: q.host ? { Host: q.host } : {} };
    } else if (net === 'grpc') {
      s.grpcSettings = { serviceName: q.serviceName || q.path || '', multiMode: q.mode === 'multi' };
    } else if (net === 'httpupgrade') {
      s.httpupgradeSettings = { path: q.path || '/', host: q.host || '' };
    } else if (net === 'xhttp') {
      s.xhttpSettings = { path: q.path || '/', host: q.host || '', mode: q.mode || 'auto' };
      if (q.extra) {
        try { s.xhttpSettings.extra = JSON.parse(q.extra); }
        catch (e) { throw new Error(M('xhttp')); }
      }
    } else if (net === 'tcp') {
      if (q.headerType === 'http') {
        s.tcpSettings = { header: { type: 'http', request: {
          path: [q.path || '/'], headers: q.host ? { Host: [q.host] } : {} } } };
      }
    } else {
      throw new Error(M('transport') + net);
    }

    var sec = q.security || defSec || 'none';
    if (sec === 'reality') {
      s.security = 'reality';
      s.realitySettings = {
        serverName: q.sni || '', fingerprint: q.fp || 'chrome', publicKey: q.pbk || '',
        shortId: q.sid || '', spiderX: q.spx || ''
      };
      if (q.pqv) s.realitySettings.mldsa65Verify = q.pqv;
    } else if (sec === 'tls') {
      if (q.allowInsecure === '1' || q.insecure === '1') throw new Error('allowInsecure=1: ' + M('insecure'));
      s.security = 'tls';
      var tls = { serverName: q.sni || q.host || '' };
      if (q.fp) tls.fingerprint = q.fp;
      if (q.alpn) tls.alpn = q.alpn.split(',');
      s.tlsSettings = tls;
    }
    return s;
  }

  function info(name, protocol, host, port, stream, outbound) {
    return {
      name: name || (host + ':' + port), protocol: protocol, address: host, port: port,
      network: stream ? stream.network : '', security: stream ? (stream.security || 'none') : '',
      outbound: outbound
    };
  }

  function vless(u) {
    if (!u.user || !u.host || !u.port) throw new Error(M('vless'));
    var st = applyStream(u.q, 'none');
    var user = { id: u.user, encryption: u.q.encryption || 'none' };
    if (u.q.flow) user.flow = u.q.flow;
    return info(u.name, 'vless', u.host, u.port, st, {
      tag: 'proxy', protocol: 'vless',
      settings: { vnext: [{ address: u.host, port: u.port, users: [user] }] }, streamSettings: st });
  }

  function trojan(u) {
    if (!u.user || !u.host || !u.port) throw new Error(M('trojan'));
    var st = applyStream(u.q, 'tls');
    return info(u.name, 'trojan', u.host, u.port, st, {
      tag: 'proxy', protocol: 'trojan',
      settings: { servers: [{ address: u.host, port: u.port, password: u.user }] }, streamSettings: st });
  }

  function vmess(uri) {
    var j = JSON.parse(b64d(uri.replace(/^vmess:\/\//i, '').split('#')[0]));
    var host = j.add, port = parseInt(j.port, 10);
    if (!j.id || !host || !port) throw new Error(M('vmess'));
    var q = { type: j.net || 'tcp', path: j.path, host: j.host, headerType: j.type,
      security: j.tls === 'tls' ? 'tls' : 'none', sni: j.sni, alpn: j.alpn, fp: j.fp,
      serviceName: j.path, mode: j.type === 'multi' ? 'multi' : '' };
    var st = applyStream(q, 'none');
    return info(j.ps, 'vmess', host, port, st, {
      tag: 'proxy', protocol: 'vmess',
      settings: { vnext: [{ address: host, port: port, users: [{
        id: j.id, alterId: parseInt(j.aid || 0, 10), security: j.scy || 'auto' }] }] },
      streamSettings: st });
  }

  function shadowsocks(uri) {
    var rest = uri.replace(/^ss:\/\//i, '');
    var name = '', h = rest.indexOf('#');
    if (h >= 0) { name = dec(rest.slice(h + 1)); rest = rest.slice(0, h); }
    var qs = '', qi = rest.indexOf('?');
    if (qi >= 0) { qs = rest.slice(qi + 1); rest = rest.slice(0, qi); }
    rest = rest.replace(/\/$/, '');
    var cred, hp;
    var at = rest.lastIndexOf('@');
    if (at >= 0) {
      cred = dec(rest.slice(0, at));
      if (cred.indexOf(':') < 0) cred = b64d(cred);
      hp = rest.slice(at + 1);
    } else {
      var all = b64d(rest);
      at = all.lastIndexOf('@');
      cred = all.slice(0, at); hp = all.slice(at + 1);
    }
    var ci = cred.indexOf(':');
    var m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(hp);
    if (ci < 0 || !m) throw new Error(M('ssBad'));
    if (qparse(qs).plugin) throw new Error(M('ssPlugin'));
    var host = m[1].replace(/^\[|\]$/g, ''), port = parseInt(m[2], 10);
    return info(name, 'shadowsocks', host, port, null, {
      tag: 'proxy', protocol: 'shadowsocks',
      settings: { servers: [{ address: host, port: port, method: cred.slice(0, ci), password: cred.slice(ci + 1) }] } });
  }

  function hysteria2(u) {
    if (!u.host || !u.port) throw new Error(M('hy2'));
    if (u.q.obfs) throw new Error(M('hy2obfs'));
    if (u.q.insecure === '1' || u.q.allowInsecure === '1') throw new Error('insecure=1: ' + M('insecure'));
    var st = { network: 'hysteria', security: 'tls',
      tlsSettings: { serverName: u.q.sni || u.host, alpn: ['h3'] },
      hysteriaSettings: { version: 2, auth: u.user } };
    var o = info(u.name, 'hysteria2', u.host, u.port, st, {
      tag: 'proxy', protocol: 'hysteria',
      settings: { version: 2, address: u.host, port: u.port }, streamSettings: st });
    o.udp = true; // can't be TCP-pinged
    return o;
  }

  function parseLink(uri) {
    uri = uri.trim();
    var sch = /^([a-z0-9]+):\/\//i.exec(uri);
    if (!sch) throw new Error(M('notLink'));
    switch (sch[1].toLowerCase()) {
      case 'vless': return vless(splitUri(uri));
      case 'trojan': return trojan(splitUri(uri));
      case 'vmess': return vmess(uri);
      case 'ss': return shadowsocks(uri);
      case 'hysteria2': case 'hy2': return hysteria2(splitUri(uri));
      default: throw new Error(M('proto') + sch[1]);
    }
  }

  function safeParse(line) {
    try { return parseLink(line); }
    catch (e) {
      var nm = ''; var h = line.indexOf('#');
      if (h >= 0) nm = dec(line.slice(h + 1));
      return { name: nm || line.slice(0, 40), protocol: (line.split(':')[0] || '?'), error: e.message };
    }
  }

  // Happ-style JSON subscriptions: array (or single) of full Xray configs.
  function fromJson(body) {
    var j = JSON.parse(body);
    if (!Array.isArray(j)) j = [j];
    var out = [];
    j.forEach(function (cfg) {
      var obs = (cfg.outbounds || []).filter(function (o) {
        return o.protocol && ['freedom', 'blackhole', 'dns', 'loopback'].indexOf(o.protocol) < 0;
      });
      if (!obs.length) return;
      var o = obs[0], addr = '', port = 0;
      var v = o.settings && (o.settings.vnext || o.settings.servers);
      if (v && v[0]) { addr = v[0].address; port = v[0].port; }
      else if (o.settings) { addr = o.settings.address || ''; port = o.settings.port || 0; }
      var ss = o.streamSettings || {};
      o.tag = 'proxy';
      out.push({ name: cfg.remarks || cfg.name || (addr + ':' + port), protocol: o.protocol, address: addr, port: port,
        network: ss.network || '', security: ss.security || 'none', outbound: o });
    });
    return out;
  }

  function parseSubscription(body) {
    body = String(body).replace(/^﻿/, '').trim();
    if (!body) return [];
    if (body.charAt(0) === '[' || body.charAt(0) === '{') return fromJson(body);
    var text = body;
    if (!/^[a-z0-9]+:\/\//i.test(body)) { try { text = b64d(body); } catch (e) { /* plain text */ } }
    return text.split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return /^[a-z0-9]+:\/\//i.test(l); }).map(safeParse);
  }

  root.XParse = { parseLink: parseLink, parseSubscription: parseSubscription, safeParse: safeParse, b64d: b64d };
  if (typeof module !== 'undefined') module.exports = root.XParse;
})(typeof window !== 'undefined' ? window : globalThis);
