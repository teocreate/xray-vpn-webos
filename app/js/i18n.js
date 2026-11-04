// RU / EN strings. Language follows the TV's locale (navigator.language); anything but Russian-speaking shows English.
(function (root) {
  'use strict';
  var lang = /^(ru|uk|be|kk)/i.test(root.navigator.language || '') ? 'ru' : 'en';
  var D = {
    ru: {
      uptime: 'В сети', extip: 'Внешний IP', add: '+ Добавить', settings: 'Настройки', ping: 'Проверить пинг', refresh: 'Обновить подписку',
      emptyH: 'Здесь пока пусто', emptyP: 'Добавьте ссылку на подписку или сервер. Печатать пультом не придётся — можно отправить с телефона.',
      emptyAdd: '+ Добавить подписку', emptyPhone: 'Отправить с телефона',
      keyOk: 'подключиться', keyMove: 'выбор', keyBack: 'назад',
      myServers: 'Мои серверы', protOn: 'Защита включена', protOff: 'Защита выключена', connecting: 'Подключение', tunnelOnly: 'Запущено, туннеля нет',
      stOn: 'Подключено', stBusy: 'Секунду…', stOff: 'Отключено',
      hintAddFirst: 'Сначала добавьте сервер', hintOff: 'OK — отключить', hintWait: 'Подождите…', hintOn: 'OK — подключить',
      hintFailed: 'Туннель остановлен: сервер не отвечал. Интернет ТВ не затронут',
      noServer: 'Сервер не выбран', tagOn: 'Подключено', tagWait: 'Подключаю…', refused: 'отказ',
      today: 'сегодня в ', updated: 'обновлено ', ms: ' мс',
      srv1: 'сервер', srv2: 'сервера', srv5: 'серверов',
      toastConnecting: 'Подключаюсь к «%s»…', toastOk: 'Подключено', toastOff: 'Отключено', toastNoSrv: 'Сначала выберите сервер в списке',
      toastUnsupported: 'Сервер не поддерживается: ', toastNoRoot: 'Нет связи с сервисом root: ', toastErr: 'Ошибка: ',
      cfgRejected: 'Конфиг отклонён Xray:\n', failedH: 'Не удалось подключиться', errorH: 'Ошибка подключения', badge: 'ОШИБКА',
      deadTunnel: 'Туннель поднялся, но интернета через него нет: сервер не отвечает или ключ отозван. VPN остановлен, чтобы ТВ не остался без сети.',
      noTunnel: 'Туннель не поднялся.', retry: 'Повторить', otherServer: 'Выбрать другой сервер', close: 'Закрыть', empty: '(пусто)',
      subDl: 'Не удалось скачать подписку (curl rc=', subHttp: 'Сервер подписки ответил HTTP ', subNone: 'В подписке нет серверов', subDefault: 'Подписка',
      addedN: 'Добавлено серверов: ', noSubs: 'Нет подписок для обновления', refreshing: 'Обновляю подписки…', refreshed: 'Обновлено: ', errors: ', ошибок: ',
      pingOff: 'Для замера пинга сначала отключите VPN', pingNone: 'Нечего пинговать', pingN: 'Пингую серверов: ', done: 'Готово',
      addH: 'Добавить серверы', addP: 'Ссылка на подписку или на отдельный сервер', addPh: 'https://… или vless://…',
      calloutH: 'Неудобно печатать пультом?', calloutP: 'Откройте страницу на телефоне и вставьте ссылку там', calloutBtn: 'С телефона →', cancel: 'Отмена',
      noLan: 'Не удалось определить IP телевизора',
      phoneH: 'Ввод с телефона', step1: 'Подключите телефон к той же Wi-Fi сети, что и телевизор', step2: 'Откройте адрес в браузере или отсканируйте QR-код',
      step3: 'Вставьте ссылку и нажмите «Отправить на ТВ»', waiting: 'Жду ссылку — она появится автоматически', qrHint: 'Наведите камеру телефона',
      setH: 'Настройки', ruT: 'Российские сайты напрямую', ruD: 'Домены .ru .su .рф открываются без VPN',
      autoT: 'Автозапуск при включении ТВ', autoD: 'VPN подключится сам после загрузки', note: 'Маршрутизация применяется при следующем подключении',
      checkIp: 'Проверить IP', log: 'Журнал Xray', delSub: 'Удалить подписку', ready: 'Готово',
      checkingIp: 'Проверяю IP…', extIpIs: 'Внешний IP: ', ipNone: 'IP не получен'
    },
    en: {
      uptime: 'Uptime', extip: 'External IP', add: '+ Add', settings: 'Settings', ping: 'Test ping', refresh: 'Update subscription',
      emptyH: 'Nothing here yet', emptyP: 'Add a subscription or server link. No need to type with the remote — you can send it from your phone.',
      emptyAdd: '+ Add subscription', emptyPhone: 'Send from phone',
      keyOk: 'connect', keyMove: 'select', keyBack: 'back',
      myServers: 'My servers', protOn: 'Protection on', protOff: 'Protection off', connecting: 'Connecting', tunnelOnly: 'Running, no tunnel',
      stOn: 'Connected', stBusy: 'One moment…', stOff: 'Disconnected',
      hintAddFirst: 'Add a server first', hintOff: 'OK — disconnect', hintWait: 'Please wait…', hintOn: 'OK — connect',
      hintFailed: 'Tunnel stopped: the server stopped responding. The TV’s internet is unaffected',
      noServer: 'No server selected', tagOn: 'Connected', tagWait: 'Connecting…', refused: 'refused',
      today: 'today at ', updated: 'updated ', ms: ' ms',
      srv1: 'server', srv2: 'servers', srv5: 'servers',
      toastConnecting: 'Connecting to “%s”…', toastOk: 'Connected', toastOff: 'Disconnected', toastNoSrv: 'Select a server in the list first',
      toastUnsupported: 'Server not supported: ', toastNoRoot: 'No connection to the root service: ', toastErr: 'Error: ',
      cfgRejected: 'Xray rejected the config:\n', failedH: 'Could not connect', errorH: 'Connection error', badge: 'ERROR',
      deadTunnel: 'The tunnel came up but there is no internet through it: the server is not responding or the key was revoked. VPN was stopped so the TV is not left offline.',
      noTunnel: 'The tunnel did not come up.', retry: 'Retry', otherServer: 'Pick another server', close: 'Close', empty: '(empty)',
      subDl: 'Could not download the subscription (curl rc=', subHttp: 'Subscription server answered HTTP ', subNone: 'The subscription has no servers', subDefault: 'Subscription',
      addedN: 'Servers added: ', noSubs: 'No subscriptions to update', refreshing: 'Updating subscriptions…', refreshed: 'Updated: ', errors: ', errors: ',
      pingOff: 'Turn VPN off to measure ping', pingNone: 'Nothing to ping', pingN: 'Pinging servers: ', done: 'Done',
      addH: 'Add servers', addP: 'A subscription link or a single server link', addPh: 'https://… or vless://…',
      calloutH: 'Typing with the remote is a pain?', calloutP: 'Open the page on your phone and paste the link there', calloutBtn: 'From phone →', cancel: 'Cancel',
      noLan: 'Could not determine the TV’s IP address',
      phoneH: 'Enter from phone', step1: 'Connect your phone to the same Wi-Fi network as the TV', step2: 'Open the address in a browser or scan the QR code',
      step3: 'Paste the link and tap “Send to TV”', waiting: 'Waiting for a link — it will appear automatically', qrHint: 'Point your phone camera here',
      setH: 'Settings', ruT: 'Russian sites direct', ruD: '.ru .su .рф domains open without VPN',
      autoT: 'Start when the TV turns on', autoD: 'VPN connects by itself after boot', note: 'Routing changes apply on the next connection',
      checkIp: 'Check IP', log: 'Xray log', delSub: 'Delete subscription', ready: 'Done',
      checkingIp: 'Checking IP…', extIpIs: 'External IP: ', ipNone: 'IP not received'
    }
  };
  root.I18N = {
    lang: lang,
    t: function (k) { return D[lang][k] !== undefined ? D[lang][k] : k; },
    plural: function (n) {
      if (lang === 'en') return n === 1 ? 'srv1' : 'srv2';
      var a = n % 10, b = n % 100;
      return a === 1 && b !== 11 ? 'srv1' : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? 'srv2' : 'srv5';
    }
  };
})(window);
