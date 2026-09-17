const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { testDatabase } = require('./test-support/database');
const { classroomScope, updateClassroomStudent } = require('./classroom-access');
const { initWriting,handleWriting } = require('./writing-api');
const { initSocialStudies,handleSocialStudies } = require('./social-studies-api');
const { initCoach,handleCoach } = require('./coach-api');
const { initBadges } = require('./badges-api');
let db,pool;
const teacher={id:10,role:'teacher',class_id:1};
before(async()=>{
  ({db,pool}=await testDatabase());
  await pool.query(`CREATE TABLE users(id BIGINT PRIMARY KEY,display_name TEXT,username TEXT,selected_team TEXT,role TEXT,class_id BIGINT,active BOOLEAN DEFAULT TRUE,pin_hash TEXT);
    INSERT INTO users(id,display_name,username,role,class_id) VALUES(1,'Same Class','same','student',1),(2,'Other Class','other','student',2),(3,'Unassigned','none','student',NULL),(10,'Teacher','teacher','teacher',1);
    CREATE TABLE classroom_settings(setting_key TEXT PRIMARY KEY,setting_value JSONB,updated_by BIGINT,updated_at TIMESTAMPTZ DEFAULT NOW());`);
  await initBadges(pool);await initWriting(pool);await initSocialStudies(pool);await initCoach(pool);
  await pool.query(`INSERT INTO writing_entries(user_id,activity,status,xp_awarded) VALUES(1,'journal','submitted',30),(2,'journal','submitted',900);
    INSERT INTO social_studies_progress(user_id,activity,completed,xp_awarded) VALUES(1,'capital',TRUE,15),(2,'capital',TRUE,900);
    INSERT INTO coach_safety_flags(user_id,page,message,category,severity) VALUES(1,'home','fixture one','test','low'),(2,'home','fixture two','test','high');`);
});
after(async()=>db?.close());
async function call(handler,path,user,method='GET',body={}){
  let result;
  await handler({pool,path,user,req:{method},res:{},readJson:async()=>body,sendJson:(res,status,data)=>{result={status,data}}});
  return result;
}
test('class scope fails closed unless school-wide admin access is explicit',()=>{
  assert.equal(classroomScope({role:'teacher'}).clause,'AND FALSE');
  assert.equal(classroomScope({role:'super_admin'}).clause,'AND FALSE');
  assert.equal(classroomScope({role:'super_admin'},{allowAdmin:true}).clause,'');
});
test('writing and Social Studies leaderboards only contain classmates',async()=>{
  for(const [handler,path] of [[handleWriting,'/api/writing/profile'],[handleSocialStudies,'/api/social-studies/profile']]){
    const result=await call(handler,path,{id:1,role:'student',class_id:1});
    assert.equal(result.status,200);assert.deepEqual(result.data.leaderboard.map(row=>row.username),['same']);
    const empty=await call(handler,path,{id:3,role:'student',class_id:null});
    assert.deepEqual(empty.data.leaderboard,[]);
  }
});
test('teacher cannot reset PIN, activate, or assign another class student',async()=>{
  for(const [field,value] of [['pin_hash','new-pin-hash'],['active',false],['selected_team','DAL']]){
    assert.equal(await updateClassroomStudent(pool,teacher,2,field,value),null);
    assert.equal(await updateClassroomStudent(pool,{...teacher,class_id:null},1,field,value),null);
    assert.equal(await updateClassroomStudent(pool,{id:1,role:'student',class_id:1},1,field,value),null);
    assert.equal((await updateClassroomStudent(pool,teacher,1,field,value)).id,1);
  }
  assert.equal((await updateClassroomStudent(pool,{role:'super_admin'},2,'selected_team','PHI')).id,2);
  await updateClassroomStudent(pool,teacher,1,'active',true);
});
test('teacher writing review rejects another class and permits own submission',async()=>{
  assert.equal((await call(handleWriting,'/api/teacher/writing/2',teacher,'PATCH',{status:'complete'})).status,404);
  assert.equal((await call(handleWriting,'/api/teacher/writing/1',teacher,'PATCH',{status:'complete'})).status,200);
  const result=await call(handleWriting,'/api/teacher/writing',teacher);
  assert.deepEqual(result.data.submissions.map(row=>row.username),['same']);
});
test('returned writing must change before it can be resubmitted',async()=>{
  await pool.query("INSERT INTO users(id,display_name,username,role,class_id) VALUES(20,'Revision Student','revise','student',1) ON CONFLICT DO NOTHING");
  const student={id:20,role:'student',class_id:1};
  const content='The Cowboys traveled to play a football game and I noticed many details about the team. They used passing yards rushing yards and defense to compete. I think the most important evidence is how the team adjusted during the game and kept working together until the final whistle.';
  const payload={activity:'journal',title:'Game journal',content,checklist:{capitals:true,punctuation:true,evidence:true,sentences:true}};
  assert.equal((await call(handleWriting,'/api/writing/submit',student,'POST',payload)).status,200);
  const submission=(await call(handleWriting,'/api/teacher/writing',teacher)).data.submissions.find(row=>row.username==='revise');
  assert(submission);
  assert.equal((await call(handleWriting,`/api/teacher/writing/${submission.id}`,teacher,'PATCH',{status:'revision',feedback:'Add one specific statistic and explain why it matters.'})).status,200);
  assert.equal((await call(handleWriting,'/api/writing/revise',student,'POST',{activity:'journal'})).status,200);
  const unchanged=await call(handleWriting,'/api/writing/submit',student,'POST',payload);
  assert.equal(unchanged.status,400);
  assert.match(unchanged.data.error,/real revision/i);
  const revised={...payload,content:content+' I added that the offense gained 187 passing yards, and that number matters because it shows the quarterback moved the ball through the air when the defense expected a run.'};
  assert.equal((await call(handleWriting,'/api/writing/submit',student,'POST',revised)).status,200);
  const reviewed=(await call(handleWriting,'/api/teacher/writing',teacher)).data.submissions.find(row=>row.username==='revise');
  assert(reviewed.revisionChangedWords>=8);
});
test('safety feed, unread count, and review action stay in the teacher class',async()=>{
  const result=await call(handleCoach,'/api/coach/safety-flags',teacher);
  assert.equal(result.data.unreadCount,1);assert.deepEqual(result.data.flags.map(row=>row.username),['same']);
  assert.equal((await call(handleCoach,'/api/coach/safety-flags/2/review',teacher,'PATCH')).status,404);
  assert.equal((await call(handleCoach,'/api/coach/safety-flags/1/review',teacher,'PATCH')).status,200);
});
