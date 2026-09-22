const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const compiled=require('next/dist/compiled/webpack/webpack');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePrinting}=require('./fixtures/isolated-printing.cjs');
const output=path.resolve('.tmp/charge-operation-ui');let browser,server,checks=0;
const check=(v,m)=>{assert.ok(v,m);checks++;};
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  await new Promise((resolve,reject)=>compiled.webpack({mode:'production',devtool:false,optimization:{minimize:false},
    plugins:[new compiled.webpack.DefinePlugin({'process.env.NEXT_PUBLIC_QZ_CERTIFICATE':JSON.stringify('')})],
    entry:path.resolve('scripts/fixtures/charge-operation-harness.tsx'),output:{path:output,filename:'fixture.js'},
    resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':path.resolve('src')}},
    module:{rules:[{test:/\.tsx?$/,use:path.resolve('scripts/fixtures/typescript-loader.cjs')}]},
  },(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
  const cssDir=path.resolve('.next/static/css');
  const css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n');
  let apiCalls=0,mutations=0,missing=false;
  server=http.createServer((req,res)=>{
    if(req.method!=='GET')mutations++;
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(output,'fixture.js')));}
    if(pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
    if(pathname==='/api/charge-operation-receipt'){
      apiCalls++;res.setHeader('Content-Type','application/json');if(missing){res.statusCode=404;return res.end('{}');}
      return res.end(JSON.stringify({operationId:'44444444-4444-4444-8444-444444444444',enrollmentId:'11111111-1111-4111-8111-111111111111',
        chargeId:'33333333-3333-4333-8333-333333333333',kind:'credit',playerName:'Test Player',campusName:'Contry',operator:'Test operator',
        description:'Tournament',currency:'MXN',chargeAmount:400,cashReturned:0,creditGenerated:100,creditRestored:0,
        occurredAt:'2026-09-22T02:00:00Z',recordedAt:'2026-09-22T02:00:00Z',reason:'Test',paymentReferences:['TEST-001']}));
    }
    if(pathname!=='/'){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  await isolatePrinting(context,origin);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Fixture browser error:',e.message);});
  await page.goto(origin);
  await page.getByText('Cancelar cargo y generar crédito',{exact:true}).click();
  await page.getByRole('button',{name:'Confirmar crédito de $100.00',exact:true}).waitFor();
  check(await page.getByText(/Quedarán \$100.00/).isVisible(),'Partial credit confirmation uses funded amount, not charge total');
  await page.screenshot({path:path.join(output,'desktop.png')});
  await page.getByText('Cancelar cargo',{exact:true}).click();
  check(await page.getByRole('button',{name:'Confirmar cancelación sin crédito'}).isVisible(),'Unpaid confirmation explicit');
  await page.getByRole('button',{name:'Imprimir comprobante'}).click();
  await page.waitForFunction(()=>window.__testPrintJobs.length===1);
  await page.evaluate(()=>window.__testPrintFailure=true);
  await page.getByRole('button',{name:'Imprimir comprobante'}).click();
  await page.getByRole('alert').waitFor();
  check((await page.getByRole('alert').textContent()).includes('ya está registrada'),'Printing failure not reported as financial failure');
  await page.evaluate(()=>window.__testPrintFailure=false);
  await page.getByRole('button',{name:'Imprimir comprobante'}).click();
  await page.waitForFunction(()=>window.__testPrintJobs.length===2);
  check(await page.evaluate(()=>JSON.stringify(window.__testPrintJobs[0])===JSON.stringify(window.__testPrintJobs[1])),'Retry prints identical saved snapshot');
  check(mutations===0,'Print and retry make no financial writes');
  missing=true;await page.getByRole('button',{name:'Imprimir comprobante'}).click();
  await page.getByText('Esta operación anterior no tiene un comprobante guardado.').waitFor();
  check(await page.evaluate(()=>window.__testPrintJobs.length===2),'Historical records not fabricated');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile table scroll stays inside container');
  await page.goto(origin+'/?readonly');
  check(await page.getByRole('button',{name:'Imprimir comprobante'}).isDisabled(),'Reader cannot print');
  await page.getByText('Cancelar cargo y generar crédito',{exact:true}).click();
  check(await page.getByRole('button',{name:'Confirmar crédito de $100.00',exact:true}).isDisabled(),'Reader cannot cancel');
  check(errors.length===0,errors.join('\n'));
  console.log(`PASS ${checks} browser checks; ${apiCalls} read-only receipt requests. Screenshots: ${output}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
