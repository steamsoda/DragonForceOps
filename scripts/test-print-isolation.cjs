const assert=require('node:assert/strict');
const http=require('node:http');
const {isolatePrinting}=require('./fixtures/isolated-printing.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
  const server=http.createServer((req,res)=>res.end('<!doctype html><title>Print isolation</title>'));
  let localUpgrades=0;
  server.on('upgrade',(request,socket)=>{localUpgrades++;socket.destroy();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(let i=0;i<2;i++) {
      const context=await browser.newContext({serviceWorkers:'block'});
      const audit=await isolatePrinting(context,origin);
      const page=await context.newPage();
      await page.goto(origin);
      // This attempted connection is intercepted before any upstream socket opens.
      await page.evaluate(()=>new Promise(resolve=>{
        const socket=new WebSocket('ws://127.0.0.1:8182');
        socket.onclose=resolve; socket.onerror=resolve;
      }));
      assert.equal(audit.blockedSockets,1);
      await page.evaluate(()=>new Promise(resolve=>{
        const socket=new WebSocket(location.origin.replace('http:','ws:')+'/_next/hmr');
        socket.onclose=resolve; socket.onerror=resolve;
      }));
      assert.equal(localUpgrades,i+1);
      assert.equal(audit.blockedSockets,1);
      await page.evaluate(()=>window.qz.print(window.qz.configs.create('synthetic',{}),[{data:'test receipt'}]));
      assert.equal(await page.evaluate(()=>window.__testPrintJobs.length),1);
      await page.reload();
      assert.equal(await page.evaluate(()=>window.__testPrintJobs.length),0);
      assert.equal(await page.evaluate(()=>window.qz.websocket.isActive()),true);
      await context.close();
    }
    console.log('PASS print capture, socket denial, reload and fresh-context isolation. No QZ connection.');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
