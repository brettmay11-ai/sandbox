const {chromium}=require('playwright');
const {spawn}=require('child_process');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const port=process.env.TEST_PORT||'8101';
const base=`http://localhost:${port}`;
(async()=>{
  const child=spawn(process.execPath,['test-support/serve-fixture.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,TEST_PORT:port},windowsHide:true});
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Fixture startup timed out')),30000);
      child.stdout.on('data',chunk=>{if(String(chunk).includes('TEST_FIXTURE_READY')){clearTimeout(timeout);resolve()}});
      child.stderr.on('data',chunk=>process.stderr.write(chunk));
      child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Fixture exited ${code}`))});
    });
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.addInitScript(()=>window.addEventListener('portal-page-ready',()=>{window.__smokeReady=true}));
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
    await page.locator('#username').fill('qa.student');await page.locator('#pin').fill('1234');
    await page.locator('#submit').click();await page.waitForURL('**/dashboard',{waitUntil:'domcontentloaded'});
    fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
    for(const route of ['dashboard','math','writing','profile','players','stats','teams','matchups','travel','cities','']){
      await page.goto(base+'/'+route,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.classList.contains('portal-ready'));
      await page.waitForFunction(()=>window.__smokeReady===true);
      assert.equal(await page.locator('html').getAttribute('data-portal-page'),route||'home');
      assert(!await page.locator('body').innerText().then(text=>text.includes('Loading Math Lab...')) || route!=='math');
      if(route===''){
        await page.waitForFunction(()=>document.getElementById('featured-day')?.textContent.trim()&&document.getElementById('featured-time')?.textContent.trim()&&document.getElementById('featured-venue')?.textContent.trim());
        assert.match(await page.locator('#featured-day').innerText(),/Sep 10/);
        assert.equal(await page.locator('#featured-time').innerText(),'7:35 PM CT');
        assert.equal(await page.locator('#featured-venue').innerText(),'Melbourne Cricket Ground');
      }
      console.log('Student page OK:',route||'home');
    }
    await page.evaluate(()=>window.featuredPhotoReady);
    await page.screenshot({path:'test-results/home-desktop.png'});
    await page.goto(base+'/players',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__smokeReady===true);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/players-mobile.png'});
    const teacher=await browser.newContext();
    assert((await teacher.request.post(base+'/api/login',{data:{username:'qa.teacher',pin:'1234'}})).ok());
    const tp=await teacher.newPage();tp.on('pageerror',error=>errors.push(error.message));
    for(const route of ['dashboard','students','progress','featured','writing','coach']){
      await tp.goto(base+'/teacher/'+route,{waitUntil:'domcontentloaded'});await tp.waitForFunction(()=>document.documentElement.classList.contains('teacher-navigation-ready'));
      assert(!await tp.locator('main').innerText().then(text=>text.includes('Other Class')));
      console.log('Teacher page OK:',route);
    }
    const roster=await (await teacher.request.get(base+'/api/teacher/students')).json();
    assert.deepEqual(roster.students.map(s=>s.username),['qa.student']);
    const writing={activity:'journal',title:'Smoke test journal',content:Array(45).fill('practice').join(' '),checklist:{capitals:true,punctuation:true,evidence:true,sentences:true}};
    assert((await context.request.post(base+'/api/writing/save',{data:writing})).ok());
    assert((await context.request.post(base+'/api/writing/submit',{data:writing})).ok());
    const submitted=(await (await teacher.request.get(base+'/api/teacher/writing')).json()).submissions;
    assert.equal(submitted.length,1);
    assert((await teacher.request.patch(`${base}/api/teacher/writing/${submitted[0].id}`,{data:{status:'revision',feedback:'Add one specific example.'}})).ok());
    assert.equal((await (await context.request.get(base+'/api/writing/profile')).json()).returned,1);
    assert((await context.request.post(base+'/api/writing/revise',{data:{activity:'journal'}})).ok());
    const revisedWriting={...writing,content:writing.content+' I added a specific example about the team using 187 passing yards because that evidence explains how the offense moved the ball.'};
    assert((await context.request.post(base+'/api/writing/submit',{data:revisedWriting})).ok());
    for(const yards of [5,10,15,20]){
      const response=await context.request.post(base+'/api/math-game/challenge',{data:{yards}});
      assert.equal(response.status(),201);
      const {challenge}=await response.json();
      assert.equal(challenge.answer,undefined);
      const answered=await context.request.post(base+'/api/math-game/answer',{data:{challengeId:challenge.id,answer:-1}});
      assert.equal(answered.status(),200);
      const feedback=await answered.json();
      assert.equal(feedback.correct,false);
      assert.equal(feedback.xpEarned,0);
      assert.ok(Number.isInteger(feedback.correctAnswer));
      assert.ok(feedback.explanation.length>20);
    }
    const admin=await browser.newContext();
    assert((await admin.request.post(base+'/api/login',{data:{username:'qa.admin',pin:'1234'}})).ok());
    const students=(await (await admin.request.get(base+'/api/admin/students')).json()).students;
    const own=students.find(s=>s.username==='qa.student'),other=students.find(s=>s.username==='qa.other');
    for(const [suffix,data] of [['pin',{pin:'5678'}],['status',{active:false}],['team',{team:'DET'}],['identity',{username:'hijack',displayName:'Hijack'}]]){
      assert.equal((await teacher.request.patch(`${base}/api/teacher/students/${other.id}/${suffix}`,{data})).status(),404);
    }
    assert((await admin.request.post(`${base}/api/admin/students/${own.id}/impersonate`)).ok());
    const ap=await admin.newPage();await ap.goto(base+'/profile',{waitUntil:'domcontentloaded'});
    await ap.locator('#stop-student-impersonation').waitFor();
    assert(await ap.locator('script[src*="student-portal-fixes.js?v="]').count());
    await ap.locator('#stop-student-impersonation').click();await ap.waitForURL('**/admin',{waitUntil:'domcontentloaded'});
    const usage=await (await admin.request.get(base+'/api/admin/sportsdata-usage')).json();
    assert.equal(usage.budget.used,0);
    assert.deepEqual(errors,[]);
    console.log('PASS: classroom isolation, normal/preview rendering, navigation, dates, and zero paid requests.');
  }finally{await browser?.close();child.kill()}
})().catch(error=>{console.error(error);process.exitCode=1});
