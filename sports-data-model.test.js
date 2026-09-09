const {test}=require('node:test');
const assert=require('node:assert/strict');
const {kickoff,normalizeGame,teamTables,playerTables}=require('./sports-data-model');
const {renderStudentHtml,versionHtml}=require('./portal-assets');
const fs=require('fs');
const vm=require('vm');
test('UTC timestamps with or without Z agree and convert to Central date and time',()=>{
  const a=kickoff({DateTimeUTC:'2026-09-11T00:35:00'});
  assert.deepEqual(a,kickoff({DateTimeUTC:'2026-09-11T00:35:00Z'}));
  assert.equal(a.date,'Sep 10');assert.equal(a.day,'Thursday');assert.equal(a.time,'7:35 PM CT');
});
test('Eastern fallbacks respect daylight saving and date rollover',()=>{
  assert.equal(kickoff({Date:'2026-09-10T20:35:00'}).time,'7:35 PM CT');
  assert.equal(kickoff({Date:'2026-11-26T20:20:00'}).time,'7:20 PM CT');
  assert.equal(kickoff({Date:'2026-09-11T00:15:00'}).date,'Sep 10');
});
test('unknown, malformed and TBD kickoffs never become a made-up Sunday time',()=>{
  for(const game of [{},{Date:'invalid'},{DateTimeUTC:'invalid'},{DateTimeUTC:'2026-09-11T00:35:00Z',DateTimeIsTBD:true}])assert.equal(kickoff(game).time,'Time TBD');
});
test('team rates use games played, defensive rates sort lower first, no games means no ranks',()=>{
  const tables=teamTables([{Team:'DAL',Games:2,Score:40,OpponentScore:30},{Team:'SF',Games:1,Score:30,OpponentScore:10},{Team:'DET',Games:0,Score:0}]);
  assert.deepEqual(tables.offensive[0],[{team:'SF',val:30},{team:'DAL',val:20}]);
  assert.deepEqual(tables.defensive[0],[{team:'SF',val:10},{team:'DAL',val:15}]);
  assert.deepEqual(playerTables([]).passing,[]);
});
test('student renderer includes same content-hashed assets for normal and preview HTML',()=>{
  const html=renderStudentHtml(fs.readFileSync('index.html','utf8'));
  assert.match(html,/sports-data-model\.js\?v=[a-f0-9]{12}/);
  assert.match(html,/student-portal-fixes\.js\?v=[a-f0-9]{12}/);
  assert.doesNotMatch(html,/src="\/international-matchup-fixes/);
  const script=html.match(/<script>window.PORTAL_ASSETS=[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
  const context={window:{}};vm.runInNewContext(script,context);
  assert.match(context.window.portalAssetUrl('math-game.js?v=old'),/^\/math-game\.js\?v=[a-f0-9]{12}$/);
});
test('all inline application scripts compile after data-source changes',()=>{
  for(const file of ['index.html','teacher.html','admin.html','login.html']){
    const html=versionHtml(fs.readFileSync(file,'utf8'));
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/ld\+json|importmap|type="module"/.test(match[1]))new vm.Script(match[2],{filename:file});
  }
});
