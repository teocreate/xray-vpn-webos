// Tiny "add from phone" server. Runs under the TV's Node 0.12 (ES5 only).
// GET /  -> form;  POST /add -> appends the submitted text to /tmp/xv_add.txt and answers with the "received" page.
// GET /fonts/<file>.woff2 -> bundled fonts from the app's css/fonts.
var http = require('http');
var fs = require('fs');
var path = require('path');
var OUT = '/tmp/xv_add.txt';
var FONTS = path.join(__dirname, 'css', 'fonts');

var TXT = {
  ru: {
    title: 'Xray VPN → ТВ', h: 'Отправить ссылку на телевизор', sub: 'Подписка (https://…) или сервер: vless, vmess, trojan, ss, hy2',
    ph: 'Вставьте ссылку', send: 'Отправить на ТВ', hint: 'Телефон и ТВ должны быть в одной Wi-Fi сети',
    doneTitle: 'Получено — Xray VPN', done: 'Получено', doneSub: 'Ссылка уже на телевизоре. Страницу можно закрыть.', again: 'Отправить ещё'
  },
  en: {
    title: 'Xray VPN → TV', h: 'Send a link to your TV', sub: 'A subscription (https://…) or a server: vless, vmess, trojan, ss, hy2',
    ph: 'Paste the link', send: 'Send to TV', hint: 'Your phone and TV must be on the same Wi-Fi network',
    doneTitle: 'Received — Xray VPN', done: 'Received', doneSub: 'The link is already on the TV. You can close this page.', again: 'Send another'
  }
};

var CSS = [
  '@font-face{font-family:Onest;font-weight:400;src:url(/fonts/onest-latin-400-normal.woff2)}',
  '@font-face{font-family:Onest;font-weight:400;src:url(/fonts/onest-cyrillic-400-normal.woff2);unicode-range:U+0400-04FF}',
  '@font-face{font-family:Onest;font-weight:600;src:url(/fonts/onest-latin-600-normal.woff2)}',
  '@font-face{font-family:Onest;font-weight:600;src:url(/fonts/onest-cyrillic-600-normal.woff2);unicode-range:U+0400-04FF}',
  '@font-face{font-family:Onest;font-weight:700;src:url(/fonts/onest-latin-700-normal.woff2)}',
  '@font-face{font-family:Onest;font-weight:700;src:url(/fonts/onest-cyrillic-700-normal.woff2);unicode-range:U+0400-04FF}',
  '@font-face{font-family:Onest;font-weight:800;src:url(/fonts/onest-latin-800-normal.woff2)}',
  '@font-face{font-family:Onest;font-weight:800;src:url(/fonts/onest-cyrillic-800-normal.woff2);unicode-range:U+0400-04FF}',
  '@font-face{font-family:"JetBrains Mono";font-weight:400;src:url(/fonts/jetbrains-mono-latin-400-normal.woff2)}',
  ':root{--bg:#242834;--well:#1E222C;--line:#3D4456;--text:#F2F4EC;--dim:#A3A9B8;--mute:#7C8394;--acc:#B6FF00;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace}',
  '*{box-sizing:border-box}',
  'html,body{margin:0;background:var(--bg);color:var(--text)}',
  'body{min-height:100vh;min-height:100dvh;font-family:Onest,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}',
  '.wrap{max-width:480px;min-height:100vh;min-height:100dvh;margin:0 auto;padding:24px 22px calc(24px + env(safe-area-inset-bottom));display:flex;flex-direction:column}',
  'header{display:flex;align-items:center;gap:12px}',
  '.logo{width:36px;height:36px;border-radius:10px;background:var(--acc);color:var(--bg);font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center}',
  '.brand{font-size:20px;font-weight:700}',
  '.to{margin-left:auto;font-size:14px;color:var(--dim);border:1px solid var(--line);border-radius:14px;padding:4px 10px}',
  'h1{font-size:30px;line-height:1.15;letter-spacing:-.5px;margin:40px 0 0;text-wrap:balance}',
  '.sub{font-size:16px;color:var(--dim);line-height:1.45;margin:12px 0 0}',
  'form{flex:1;display:flex;flex-direction:column;margin-top:24px}',
  'textarea{width:100%;min-height:180px;resize:none;font-family:var(--mono);font-size:16px;line-height:1.5;padding:16px;color:var(--text);background:var(--well);border:2px solid var(--line);border-radius:18px;outline:none}',
  'textarea::placeholder{color:#6F7686}',
  'textarea:focus{border-color:var(--acc)}',
  '.spacer{flex:1;min-height:24px}',
  '.btn{display:flex;align-items:center;justify-content:center;width:100%;height:58px;border-radius:29px;border:0;background:var(--acc);color:var(--bg);font-family:inherit;font-weight:700;font-size:18px;text-decoration:none;cursor:pointer}',
  '.btn:active{transform:scale(.98)}',
  '.btn.ghost{background:transparent;color:var(--text);border:2px solid var(--line);font-weight:600}',
  '.hint{font-size:13px;color:var(--mute);text-align:center;margin:14px 0 0}',
  '.done{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}',
  '.check{width:112px;height:112px;border-radius:50%;background:var(--acc);color:var(--bg);font-size:56px;font-weight:800;display:flex;align-items:center;justify-content:center}',
  '.done h1{margin-top:28px}.done .sub{max-width:260px}'
].join('');

function head(title, tx) {
  return '<!doctype html><html lang="' + (tx === TXT.ru ? 'ru' : 'en') + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#242834">' +
    '<title>' + title + '</title><style>' + CSS + '</style></head><body><div class="wrap">' +
    '<header><div class="logo">X</div><div class="brand">Xray VPN</div><div class="to">→ ' + (tx === TXT.ru ? 'ТВ' : 'TV') + '</div></header>';
}

function formPage(tx) {
  return head(tx.title, tx) + '<h1>' + tx.h + '</h1><p class="sub">' + tx.sub + '</p>' +
    '<form method="post" action="/add"><textarea name="u" placeholder="' + tx.ph + '" autocapitalize="off" autocorrect="off" spellcheck="false" required></textarea>' +
    '<div class="spacer"></div><button class="btn" type="submit">' + tx.send + '</button><p class="hint">' + tx.hint + '</p></form></div></body></html>';
}

function donePage(tx) {
  return head(tx.doneTitle, tx) + '<div class="done"><div class="check">✓</div><h1>' + tx.done + '</h1><p class="sub">' + tx.doneSub + '</p></div>' +
    '<a class="btn ghost" href="/">' + tx.again + '</a></div></body></html>';
}

function pick(req) { return /^\s*ru/i.test(req.headers['accept-language'] || '') ? TXT.ru : TXT.en; }

http.createServer(function (req, res) {
  var m;
  if (req.method === 'GET' && (m = /^\/fonts\/([a-z0-9\-]+\.woff2)$/.exec(req.url))) {
    fs.readFile(path.join(FONTS, m[1]), function (err, buf) {
      if (err) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', 'font/woff2'); res.setHeader('Cache-Control', 'max-age=86400'); res.end(buf);
    });
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method === 'POST' && req.url === '/add') {
    var body = '';
    req.on('data', function (c) { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', function () {
      var mm = /(?:^|&)u=([^&]*)/.exec(body);
      var text = '';
      try { text = decodeURIComponent((mm ? mm[1] : '').replace(/\+/g, ' ')); } catch (e) { text = ''; }
      if (text.trim()) fs.appendFileSync(OUT, text.trim() + '\n');
      res.end(donePage(pick(req)));
    });
  } else {
    res.end(formPage(pick(req)));
  }
}).listen(8088, '0.0.0.0');

setTimeout(function () { process.exit(0); }, 10 * 60 * 1000);
