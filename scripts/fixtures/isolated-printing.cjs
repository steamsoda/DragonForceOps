// Test-only: install before creating any page, including recovered browser contexts.
async function isolatePrinting(context, appOrigin) {
  const allowed = new URL(appOrigin);
  if (!['127.0.0.1', 'localhost'].includes(allowed.hostname) || allowed.protocol !== 'http:') {
    throw Error('Printing isolation requires the local test app');
  }
  if (typeof context.routeWebSocket !== 'function') throw Error('WebSocket isolation is required');
  const audit = { blockedSockets: 0, blockedScripts: 0 };
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    if (url.protocol === 'ws:' && url.host === allowed.host && ['/_next/webpack-hmr','/_next/hmr'].includes(url.pathname)) {
      socket.connectToServer();
    } else {
      console.log('Test socket blocked:',url.origin,url.pathname);
      audit.blockedSockets++;
      socket.close({ code: 1008, reason: 'External sockets disabled in tests' });
    }
  });
  await context.route('**/qz-tray.js', route => { audit.blockedScripts++; return route.abort('blockedbyclient'); });
  await context.addInitScript(() => {
    const jobs = [];
    Object.defineProperty(window, '__testPrintJobs', { value: jobs });
    Object.defineProperty(window, 'qz', { value: Object.freeze({
      websocket: Object.freeze({ isActive: () => true, connect: async () => { throw Error('Real QZ disabled'); } }),
      configs: Object.freeze({ create: (printer, options) => ({ printer, options }) }),
      print: async (config, items) => {
        if (window.__testPrintFailure) throw Error('Synthetic printer failure');
        jobs.push(JSON.parse(JSON.stringify({ config, items })));
      },
    }), writable: false, configurable: false });
  });
  return audit;
}
module.exports = { isolatePrinting };
