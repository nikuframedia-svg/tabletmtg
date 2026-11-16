const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('../.runtime/test-tools/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const KEY = 'mtg-gui-simple-v1';
const failures = [];
let scenarioCount=0;
const click = (page, action, value) => page.locator(`[data-a="${action}"]${value===undefined?'':`[data-v="${value}"]`}`).first().click();
const state = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const text = (page,id) => page.locator('#'+id).textContent();
const stored = (page,data) => page.evaluate(([key,value])=>localStorage.setItem(key,JSON.stringify(value)),[KEY,data]);
const login = page => click(page,'user','u1');
const start = async page => {await click(page,'of','267307');await click(page,'start');};

(async()=>{
  const server=http.createServer((req,res)=>{if(req.url.split('?')[0]!=='/'){res.writeHead(404);return res.end();}res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(path.join(root,'index.html')));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  async function scenario(name,fn,viewport={width:800,height:1280}){
    scenarioCount++;
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,locale:'pt-PT',timezoneId:'Europe/Lisbon'});
    await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install({time:new Date('2026-11-16T08:00:00Z')});
    await page.clock.pauseAt(new Date('2026-11-16T09:00:00Z'));
    try{await page.goto(origin);await fn(page);assert.deepEqual(errors,[]);console.log('PASS',name);}
    catch(error){failures.push(name);console.error('FAIL',name,error.stack);await page.screenshot({path:path.join(root,'.runtime',`failure-${failures.length}.png`)});}
    finally{await context.close();}
  }

  await scenario('Entry has no PIN; shift boundaries match 07 / 15 / 23',async page=>{
    assert.equal(await page.locator('.pin').count(),0);
    for(const [time,expected] of [['06:59','N'],['07:00','M'],['14:59','M'],['15:00','T'],['22:59','T'],['23:00','N'],['00:00','N']]){
      await page.clock.setFixedTime(new Date(`2026-11-16T${time}:00Z`));
      await page.evaluate(()=>localStorage.clear());await page.reload();
      assert.equal(await page.locator('.shifts .on').getAttribute('data-v'),expected);
    }
    await click(page,'shift','M');await login(page);assert.equal((await state(page)).screen,'main');
    assert.match(await page.locator('.identity').textContent(),/07:00–15:00/);
  });

  await scenario('Independent schedule adjustments persist; overnight and equal-time validation',async page=>{
    assert.equal(await page.locator('[data-a="schedules"]').count(),0);
    await login(page);
    await click(page,'schedules');await click(page,'adjust','u1:start:30');await click(page,'adjust','u1:end:-30');
    let s=await state(page);assert.deepEqual(s.schedules.u1,{start:450,end:870});assert.deepEqual(s.schedules.u2,{start:420,end:900});
    assert.equal(await page.locator('.schedule-card').count(),1);
    assert.equal(await page.locator('[data-a="shift"], [data-v^="u2:"]').count(),0);
    await page.locator('[data-v="u1:start:30"]').evaluate(button=>{button.dataset.v='u2:start:30';button.click();});
    assert.deepEqual((await state(page)).schedules.u2,{start:420,end:900});
    await click(page,'back');await click(page,'out');await click(page,'shift','N');await click(page,'user','u7');
    await click(page,'schedules');assert.match(await page.locator('.schedule-card').textContent(),/dia seguinte/);
    await click(page,'adjust','u7:end:30');await page.reload();s=await state(page);assert.deepEqual(s.schedules.u7,{start:1380,end:450});
    assert.deepEqual(s.schedules.u1,{start:450,end:870});
    await click(page,'back');await click(page,'out');await click(page,'shift','M');await login(page);await click(page,'schedules');
    s=await state(page);s.schedules.u1={start:870,end:900};await stored(page,s);await page.reload();await click(page,'adjust','u1:start:30');
    assert.deepEqual((await state(page)).schedules.u1,{start:870,end:900});assert.match(await text(page,'toast'),/diferentes/);
    await click(page,'back');assert.match(await page.locator('.identity').textContent(),/14:30–15:00/);
  });

  await scenario('Two OFs: 10 productive + 5 stopped = 15 total; reason, navigation, reload, languages',async page=>{
    await login(page);await click(page,'of','267307');await click(page,'of','267167');await click(page,'start');
    assert.equal(await page.locator('.active-card').count(),2);assert.equal(await page.locator('[data-a="start"]').count(),0);
    await page.locator('#quantity-267307').fill('1');await page.locator('#quantity-267167').fill('1');
    await page.clock.fastForward(600000);assert.equal(await text(page,'clock-total'),'00:10:00');
    await click(page,'stop');assert.equal((await state(page)).run.phase,'stop');assert.equal(await page.locator('.planning-list').count(),1);
    await page.clock.fastForward(120000);assert.equal(await text(page,'clock-stop'),'00:02:00');
    await click(page,'why','2');await page.clock.fastForward(180000);
    assert.equal(await text(page,'clock-total'),'00:15:00');assert.equal(await text(page,'clock-prod'),'00:10:00');assert.equal(await text(page,'clock-stop'),'00:05:00');
    await click(page,'page','stops');assert.equal(await text(page,'stop-sum'),'00:05:00');assert.equal(await page.locator('.stop-card').count(),1);
    assert.match(await page.locator('.stop-card').textContent(),/267307/);assert.match(await page.locator('.stop-card').textContent(),/267167/);
    await page.reload();assert.equal(await text(page,'clock-total'),'00:15:00');
    await click(page,'lang','en');assert.match(await page.locator('.stop-card h3').textContent(),/Breakdown/);
    await click(page,'lang','pa');assert.equal(await page.locator('.stop-card h3').textContent(),'ਮਸ਼ੀਨ ਖਰਾਬ');assert.equal(await text(page,'clock-total'),'00:15:00');
    await click(page,'lang','pt');await click(page,'resume');await page.clock.fastForward(60000);
    assert.equal(await text(page,'clock-total'),'00:16:00');assert.equal(await text(page,'clock-prod'),'00:11:00');
    await click(page,'fin');await page.clock.fastForward(30000);await click(page,'done');
    const s=await state(page);assert.equal(s.run,null);assert.equal(s.log.filter(l=>l.t==='stop').length,1);assert.equal(s.log.filter(l=>l.t==='stop')[0].sec,300);
    assert.equal(s.log.filter(l=>['stop','prod'].includes(l.t)).reduce((n,l)=>n+l.sec,0),990);
    assert.equal(await page.locator('[data-stat="total"]').textContent(),'00:16:30');
    assert.equal(s.ofs.find(o=>o.of==='267307').made,1);assert.equal(s.ofs.find(o=>o.of==='267167').made,1);
    assert.equal(await page.locator('[data-stat="n"]').textContent(),'2');
  });

  await scenario('Closing reason menu never resumes; finishing paused counts until confirmation',async page=>{
    await login(page);await start(page);await page.clock.fastForward(60000);await click(page,'stop');await click(page,'hideReason');
    await page.clock.fastForward(30000);assert.equal((await state(page)).run.phase,'stop');assert.equal(await text(page,'clock-stop'),'00:00:30');
    await click(page,'fin');await click(page,'close');await page.clock.fastForward(30000);
    assert.equal(await text(page,'clock-total'),'00:02:00');await click(page,'fin');await page.clock.fastForward(30000);await click(page,'done');
    const s=await state(page);assert.equal(s.log.filter(l=>l.t==='stop')[0].sec,90);assert.equal(s.log.filter(l=>l.t==='stop')[0].reasonId,null);
    await click(page,'page','stops');assert.match(await page.locator('.stop-card').textContent(),/Motivo por indicar/);assert.equal(await text(page,'stop-sum'),'00:01:30');
  });

  await scenario('Legacy active execution and stop records migrate without data loss or double counting',async page=>{
    const s=await state(page);delete s.version;delete s.schedules;delete s.filters;
    const previous=Date.parse('2026-11-16T08:00:00Z'),begin=Date.parse('2026-11-16T09:00:00Z');
    s.uid='u1';s.screen='main';s.pin='';s.err=false;s.ofs[0].made=3;s.ofs[0].state='run';
    s.log=[{k:'u1|2026-11-16',t:'prod',sec:60,of:'267102',at:new Date(previous).toISOString()},{k:'u1|2026-11-16',t:'pcs',n:8,of:'267102',at:new Date(previous+60000).toISOString()},
      {k:'u1|2026-11-16',t:'prod',sec:600,of:'267307',at:new Date(begin).toISOString()},
      {k:'u1|2026-11-16',t:'stop',sec:300,of:'267307',why:'Breakdown',at:new Date(begin+600000).toISOString()}];
    s.run={ids:['267307'],phase:'prod',since:begin+900000,reason:null};
    await stored(page,s);await page.clock.fastForward(1200000);await page.reload();
    assert.equal(await text(page,'clock-total'),'00:20:00');assert.equal(await text(page,'clock-prod'),'00:15:00');assert.equal(await text(page,'clock-stop'),'00:05:00');
    let migrated=await state(page);assert.equal(migrated.ofs[0].made,3);assert.equal(migrated.log.length,4);assert.equal(migrated.run.context.schedule,null);
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key+'-backup-v1')).ofs[0].made,KEY),3);
    assert.ok(!('pin' in migrated));await page.reload();assert.equal(await text(page,'clock-total'),'00:20:00');
    await click(page,'page','stops');assert.match(await page.locator('.stop-card').textContent(),/Turno \/ horário não registado/);assert.equal(await page.locator('.stop-card h3').textContent(),'Avaria');
    await click(page,'stop');await click(page,'why','0');await page.clock.fastForward(60000);await click(page,'fin');await click(page,'done');
    migrated=await state(page);assert.equal(migrated.log.filter(l=>l.runId&&['prod','stop'].includes(l.t)).reduce((n,l)=>n+l.sec,0),1260);
  });

  await scenario('Legacy paused run recovers current downtime, no reason and prior segments',async page=>{
    const s=await state(page);delete s.version;s.screen='main';s.uid='u1';const begin=Date.parse('2026-11-16T08:50:00Z');
    s.log=[{k:'u1|2026-11-16',t:'prod',sec:300,of:'267307',at:new Date(begin).toISOString()}];
    s.run={ids:['267307'],phase:'stop',since:begin+300000,reason:null};s.ofs[0].state='run';await stored(page,s);await page.reload();
    assert.equal(await text(page,'clock-total'),'00:10:00');assert.equal(await text(page,'clock-stop'),'00:05:00');assert.equal(await page.locator('#reason-panel').count(),1);
    await click(page,'hideReason');await click(page,'page','stops');assert.equal(await text(page,'stop-sum'),'00:05:00');
  });

  await scenario('Midnight uses local day overlap; date and worker filters include ongoing stops',async page=>{
    await page.clock.fastForward((14*60+55)*60000);await login(page);await start(page);await page.clock.fastForward(120000);await click(page,'stop');await click(page,'why','4');
    await page.clock.fastForward(600000);await click(page,'page','stops');
    assert.equal(await text(page,'clock-total'),'00:12:00');assert.equal(await page.locator('[data-stat="total"]').textContent(),'00:07:00');
    await page.locator('#filter-date').fill('2026-11-16');await page.locator('#filter-date').dispatchEvent('change');assert.equal(await text(page,'stop-sum'),'00:03:00');
    await page.locator('#filter-date').fill('2026-11-17');await page.locator('#filter-date').dispatchEvent('change');assert.equal(await text(page,'stop-sum'),'00:07:00');
    assert.equal(await page.locator('[data-duration]').textContent(),'00:10:00');
    await page.locator('#filter-user').selectOption('u2');assert.equal(await text(page,'stop-sum'),'00:00:00');assert.equal(await page.locator('.stop-card').count(),0);
    await click(page,'resetFilters');assert.equal(await text(page,'stop-sum'),'00:10:00');
    await click(page,'fin');await click(page,'done');assert.equal(await text(page,'stop-sum'),'00:10:00');
    await click(page,'out');await click(page,'shift','M');await click(page,'user','u2');await click(page,'page','stops');assert.equal(await page.locator('.stop-card').count(),1);
    assert.equal(await page.locator('[data-stat="total"]').textContent(),'00:00:00');
  });

  await scenario('History keeps original schedule, second execution guarded and recut still works',async page=>{
    await login(page);await start(page);await click(page,'schedules');await click(page,'adjust','u1:start:30');await click(page,'back');
    assert.equal((await state(page)).run.context.schedule.start,420);assert.equal((await state(page)).schedules.u1.start,450);
    await click(page,'tab','done');assert.equal(await page.locator('[data-a="of"]').count(),0);assert.equal(await page.locator('[data-a="start"]').count(),0);
    await click(page,'stop');await click(page,'why','1');await page.clock.fastForward(60000);await click(page,'fin');await click(page,'done');
    await click(page,'page','stops');assert.match(await page.locator('.stop-card').textContent(),/07:00–15:00/);
    await click(page,'page','plan');await click(page,'of','267102');await click(page,'recut');await click(page,'start');assert.equal((await state(page)).run.context.schedule.start,450);
    assert.equal((await state(page)).ofs.find(o=>o.of==='267102').made,0);
  });

  await scenario('Summer local dates and exact midnight filter boundaries',async page=>{
    await page.clock.setFixedTime(new Date('2026-07-10T22:50:00Z'));await login(page);await start(page);
    await page.clock.setFixedTime(new Date('2026-07-10T22:55:00Z'));await click(page,'stop');await click(page,'why','3');
    await page.clock.setFixedTime(new Date('2026-07-10T23:00:00Z'));await click(page,'resume');
    await page.clock.setFixedTime(new Date('2026-07-10T23:05:00Z'));await click(page,'stop');await click(page,'why','2');
    await page.clock.setFixedTime(new Date('2026-07-10T23:10:00Z'));await click(page,'fin');await click(page,'done');
    assert.equal((await state(page)).log.filter(l=>l.t==='pcs')[0].k,'u1|2026-07-11');
    assert.equal(await page.locator('[data-stat="total"]').textContent(),'00:10:00');
    await click(page,'page','stops');await page.locator('#filter-date').fill('2026-07-11');await page.locator('#filter-date').dispatchEvent('change');
    assert.equal(await page.locator('.stop-card').count(),1);assert.equal(await text(page,'stop-sum'),'00:05:00');
    await page.locator('#filter-date').fill('2026-07-10');await page.locator('#filter-date').dispatchEvent('change');assert.equal(await page.locator('.stop-card').count(),1);assert.equal(await text(page,'stop-sum'),'00:05:00');
  });

  await scenario('Saved v1 PIN screen enters directly and preserves completed quantities',async page=>{
    const s=await state(page);delete s.version;s.uid='u1';s.screen='pin';s.pin='12';s.err=true;s.ofs[0].made=4;
    await stored(page,s);await page.reload();assert.equal((await state(page)).screen,'main');assert.equal((await state(page)).ofs[0].made,4);assert.equal(await page.locator('.pin').count(),0);
    assert.ok(!('pin' in (await state(page))));assert.ok(!('err' in (await state(page))));
  });

  await scenario('Manual produced quantities and 100% are independent per OF and never finish work',async page=>{
    await login(page);assert.equal(await page.locator('.of-card').count(),18);
    await click(page,'editQuantity','267307');await page.locator('#quantity-267307').fill('3');
    assert.equal(await page.locator('[data-piece-count="267307"]').textContent(),'3/6');
    await click(page,'full','267167');assert.equal(await page.locator('[data-piece-count="267167"]').textContent(),'12/12');
    assert.equal((await state(page)).run,null);
    await page.reload();assert.equal(await page.locator('.of-card').count(),18);
    await click(page,'of','267307');await click(page,'of','267167');await click(page,'start');
    assert.equal(await page.locator('#quantity-267307').inputValue(),'3');
    assert.equal(await page.locator('#quantity-267167').inputValue(),'12');
    assert.equal(await page.locator('[data-a="inc"],[data-a="dec"],.counter').count(),0);
    assert.equal(await page.locator('#quantity-267307').getAttribute('inputmode'),'numeric');
    await page.locator('#quantity-267307').fill('4');await page.locator('#quantity-267167').fill('7');
    assert.equal((await state(page)).ofs.find(o=>o.of==='267307').made,4);assert.equal((await state(page)).ofs.find(o=>o.of==='267167').made,7);
    await page.reload();assert.equal(await page.locator('#quantity-267307').inputValue(),'4');assert.equal(await page.locator('#quantity-267167').inputValue(),'7');
    await click(page,'full','267307');assert.equal(await page.locator('#quantity-267307').inputValue(),'6');assert.equal(await page.locator('#quantity-267167').inputValue(),'7');assert.ok((await state(page)).run);
    await page.locator('#quantity-267307').fill('0');await page.locator('#quantity-267307').blur();assert.equal((await state(page)).ofs.find(o=>o.of==='267307').made,0);
    for(const invalid of ['-1','1.5','']){await page.locator('#quantity-267307').fill(invalid);await page.locator('#quantity-267307').blur();assert.equal((await state(page)).ofs.find(o=>o.of==='267307').made,0);assert.equal(await page.locator('#quantity-267307').inputValue(),'0');}
    await page.locator('#quantity-267307').fill('15');assert.equal((await state(page)).ofs.find(o=>o.of==='267307').made,15);
    await click(page,'full','267307');await click(page,'full','267167');assert.equal(await page.locator('#quantity-267167').inputValue(),'12');
    await click(page,'fin');await click(page,'done');assert.equal(await page.locator('[data-stat="n"]').textContent(),'18');
  });

  await scenario('Compact OF summaries expand dimensions without selecting or starting an order',async page=>{
    await login(page);assert.equal(await page.locator('#details-267307').isVisible(),false);
    await click(page,'details','267307');assert.equal(await page.locator('#details-267307').isVisible(),true);assert.match(await text(page,'details-267307'),/LBase 540.*LTopo 183.*Comp 7800/);
    assert.deepEqual((await state(page)).sel,[]);await click(page,'details','267307');assert.equal(await page.locator('#details-267307').isVisible(),false);
    await start(page);await click(page,'details','267167');assert.match(await text(page,'details-267167'),/Comp 8000/);assert.equal((await state(page)).run.ids.length,1);
  });

  for(const viewport of [{width:800,height:1280},{width:1280,height:800},{width:600,height:960}]){
    await scenario(`Tablet ${viewport.width}x${viewport.height}: scrolling, fixed bar and nonblocking reason menu`,async page=>{
      await login(page);await start(page);
      assert.ok(await page.evaluate(()=>document.querySelector('.of-card').getBoundingClientRect().bottom<=innerHeight),'The start of the planning list should remain visible');
      await page.screenshot({path:path.join(root,'.runtime',`tablet-${viewport.width}x${viewport.height}-compact.png`)});
      const s=await state(page);for(let i=0;i<24;i++)s.ofs.push({...s.ofs[1],of:'TEST'+i});await stored(page,s);await page.reload();
      await page.clock.fastForward(600000);
      assert.ok(await page.evaluate(()=>document.querySelector('main').getBoundingClientRect().top+parseFloat(getComputedStyle(document.querySelector('main')).paddingTop)>=document.querySelector('#run-bar').getBoundingClientRect().bottom));
      await page.evaluate(()=>scrollTo(0,1400));assert.equal(Math.round((await page.locator('#run-bar').boundingBox()).y),0);
      await click(page,'stop');assert.equal(Math.round((await page.locator('#run-bar').boundingBox()).y),0);
      assert.ok((await page.locator('#reason-panel').boundingBox()).height<=viewport.height*.36+1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const before=await page.evaluate(()=>scrollY);await page.evaluate(()=>scrollBy(0,300));assert.ok(await page.evaluate(old=>scrollY>old,before));
      await page.screenshot({path:path.join(root,'.runtime',`tablet-${viewport.width}x${viewport.height}-stop.png`)});
      await click(page,'hideReason');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,'.runtime',`tablet-${viewport.width}x${viewport.height}-plan.png`)});
      await click(page,'page','stops');await page.screenshot({path:path.join(root,'.runtime',`tablet-${viewport.width}x${viewport.height}-history.png`)});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await click(page,'lang','pa');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    },viewport);
  }
  await browser.close();await new Promise(resolve=>server.close(resolve));
  assert.equal(fs.readFileSync('/Users/martimnicolau/Downloads/index.html','utf8'),fs.readFileSync(path.join(root,'.runtime/index-before-v2.html'),'utf8'));
  console.log(`${scenarioCount-failures.length}/${scenarioCount} scenarios passed; Downloads original unchanged.`);
  if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
