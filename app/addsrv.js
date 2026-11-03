// Tiny "add from phone" server. Runs under the TV's Node 0.12 (ES5 only).
// GET /  -> form;  POST /add -> appends the submitted text to /tmp/xv_add.txt
var http = require('http');
var fs = require('fs');
var OUT = '/tmp/xv_add.txt';

var PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Xray VPN</title><body style="font-family:sans-serif;background:#0e1117;color:#eee;margin:0;padding:20px">' +
  '<h2>Xray VPN → ТВ</h2><form method="post" action="/add">' +
  '<p>Ссылка подписки или vless:// vmess:// trojan:// ss:// hy2://</p>' +
  '<textarea name="u" rows="8" style="width:100%;font-size:16px;box-sizing:border-box"></textarea>' +
  '<p><button style="font-size:20px;padding:12px 28px">Отправить</button></p></form>';

http.createServer(function (req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method === 'POST' && req.url === '/add') {
    var body = '';
    req.on('data', function (c) { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', function () {
      var m = /(?:^|&)u=([^&]*)/.exec(body);
      var text = '';
      try { text = decodeURIComponent((m ? m[1] : '').replace(/\+/g, ' ')); } catch (e) { text = ''; }
      if (text.trim()) fs.appendFileSync(OUT, text.trim() + '\n');
      res.end(PAGE.replace('<form', '<p style="color:#6f6">Получено ✓</p><form'));
    });
  } else {
    res.end(PAGE);
  }
}).listen(8088, '0.0.0.0');

setTimeout(function () { process.exit(0); }, 10 * 60 * 1000);
