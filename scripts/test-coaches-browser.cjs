const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const compiled=require('next/dist/compiled/webpack/webpack');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {isolatePrinting}=require('./fixtures/isolated-printing.cjs');
const output=path.resolve('.tmp/coaches-ui');let browser,server,checks=0;
const check=(v,m)=>{assert.ok(v,m);checks++;};
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 await new Promise((resolve,reject)=>compiled.webpack({mode:'production',devtool:false,optimization:{minimize:false},
  entry:path.resolve('scripts/fixtures/coaches-harness.tsx'),output:{path:output,filename:'fixture.js'},
  resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/server/actions/coaches':path.resolve('scripts/fixtures/coaches-actions.ts'),'next/navigation':path.resolve('scripts/fixtures/coaches-navigation.ts'),'@':path.resolve('src')}},
  module:{rules:[{test:/\.tsx?$/,use:path.resolve('scripts/fixtures/typescript-loader.cjs')}]},
 },(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
 const cssDir=path.resolve('.next/static/css');
 const css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n');
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(output,'fixture.js')));}
  if(pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(pathname!=='/'){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(process.argv.includes('--serve')?3111:0,'127.0.0.1',resolve)});
 const origin=`http://127.0.0.1:${server.address().port}`;
 if(process.argv.includes('--serve')) {
  console.log(`Visual fixture only, synthetic data and mocked saves: ${origin}`);
  await new Promise(()=>{});
  return;
 }
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:900}});
 await isolatePrinting(context,origin);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 check(await page.getByRole('heading',{name:'Ana Prueba',exact:true}).count()===2,'One coach visible at both campuses');
 check(await page.getByText('Sin grupos asignados',{exact:true}).isVisible(),'Groupless coach visible');
 check(await page.getByRole('heading',{name:'Sin profesor asignado'}).isVisible(),'Unstaffed group visible');
 check(await page.getByRole('heading',{name:'Equipos de torneo sin profesor'}).isVisible(),'Unstaffed inherited teams visible');
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Reemplazar a Ana Prueba',exact:true}).first().click();
 await page.getByLabel('Reemplazo para 2015',{exact:true}).selectOption('b');
 await page.getByLabel('Motivo',{exact:true}).fill('Cambio confirmado');
 await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();
 check(await page.getByText('Ahora: Carla Prueba, Bruno Prueba (principal)',{exact:true}).isVisible(),'Primary transfers and co-coach remains');
 check(await page.getByRole('region',{name:'Impacto en torneos'}).getByText('Ahora: Bruno Prueba (principal), Carla Prueba',{exact:true}).isVisible(),'Inherited impact keeps co-coach');
 check(await page.evaluate(()=>window.__coachCommands.length===0),'Review does not mutate');
 await page.getByRole('button',{name:'Confirmar cambios',exact:true}).click();
 check(await page.evaluate(()=>window.__coachCommands[0].groups.length===1),'Only selected group changed');
 await page.getByRole('button',{name:'Dar de baja a Ana Prueba',exact:true}).first().click();
 check(await page.getByText(/incluidas sus sesiones y otros roles: coach, front_desk/).isVisible(),'Departure explains all-role impact');
 check(await page.getByText('Torneo de prueba · 2015 Azul',{exact:true}).isVisible(),'Tournament impact visible');
 check(await page.getByRole('heading',{name:'Asignaciones manuales por revisar'}).isVisible(),'Manual responsibility explicitly retained');
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 check(await page.evaluate(()=>window.__coachCommands.length===1),'Cancelling departure has no effect');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile has no document overflow');
 await page.getByRole('button',{name:'Asignar grupos a Ana Prueba',exact:true}).first().click();
 await page.getByLabel('Motivo',{exact:true}).fill('Probar conflicto');
 await page.getByLabel('Asignado a Ana',{exact:true}).last().check();
 await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();
 await page.evaluate(()=>window.__coachFail=true);
 await page.getByRole('button',{name:'Confirmar cambios',exact:true}).click();
 check(await page.getByRole('alert').isVisible(),'Save conflict remains visible');
 const bounds=await page.getByRole('dialog').boundingBox();
 check(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=390 && bounds.y+bounds.height<=845,`Panel fits mobile viewport: ${JSON.stringify(bounds)} ${await page.getByRole('dialog').evaluate(e=>JSON.stringify({position:getComputedStyle(e).position,top:getComputedStyle(e).top,bottom:getComputedStyle(e).bottom,margin:getComputedStyle(e).margin}))}`);
 await page.screenshot({path:path.join(output,'mobile-panel.png')});
 await page.keyboard.press('Escape');
 await page.goto(origin+'/?readonly');
 check(await page.getByRole('button',{name:'Nuevo profesor',exact:true}).isDisabled(),'Reader cannot create');
 check(await page.getByRole('button',{name:'Dar de baja a Ana Prueba',exact:true}).first().isDisabled(),'Reader cannot depart');
 check(await page.getByRole('button',{name:'Asignar grupos a Ana Prueba',exact:true}).first().isDisabled(),'Reader cannot assign');
 check(errors.length===0,errors.join('\n'));
 console.log(`PASS ${checks} browser checks. Screenshots: ${output}`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
