// Builds the Xray config: full-device TUN, LAN direct, the server's own address direct.
(function (root) {
  'use strict';

  var PRIVATE = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '127.0.0.0/8'];
  var RU_DOMAINS = ['regexp:\\.ru$', 'regexp:\\.su$', 'regexp:\\.xn--p1ai$', 'regexp:\\.xn--80asehdb$'];

  function isIp(h) { return /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.indexOf(':') >= 0; }

  function buildConfig(server, opts) {
    opts = opts || {};
    var rules = [
      { type: 'field', ip: PRIVATE, outboundTag: 'direct' },
      isIp(server.address)
        ? { type: 'field', ip: [server.address], outboundTag: 'direct' }
        : { type: 'field', domain: ['full:' + server.address], outboundTag: 'direct' }
    ];
    if (opts.ruDirect) rules.push({ type: 'field', domain: RU_DOMAINS, outboundTag: 'direct' });
    rules.push({ type: 'field', network: 'tcp,udp', outboundTag: 'proxy' });

    return {
      log: { loglevel: 'warning' },
      inbounds: [{
        tag: 'tun-in', protocol: 'tun',
        settings: {
          name: 'xray-tun', mtu: 1500, gateway: ['172.19.0.1/30'], dns: ['1.1.1.1', '8.8.8.8'],
          autoSystemRoutingTable: ['0.0.0.0/1', '128.0.0.0/2', '192.0.0.0/3'],
          autoOutboundsInterface: opts.iface || 'wlan0'
        },
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: true }
      }],
      outbounds: [
        server.outbound,
        { tag: 'direct', protocol: 'freedom' },
        { tag: 'block', protocol: 'blackhole' }
      ],
      routing: { domainStrategy: 'IPIfNonMatch', rules: rules }
    };
  }

  root.XConfig = { buildConfig: buildConfig };
  if (typeof module !== 'undefined') module.exports = root.XConfig;
})(typeof window !== 'undefined' ? window : globalThis);
