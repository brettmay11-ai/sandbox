async function handleTeacherAnalytics({pool,req,res,path,user,sendJson}){
  if(path!=='/api/teacher/analytics')return false;
  if(!user){sendJson(res,401,{error:'Please sign in.'});return true}
  if(user.role!=='teacher'&&user.role!=='super_admin'){sendJson(res,403,{error:'Teacher access required.'});return true}
  if(req.method!=='GET'){sendJson(res,405,{error:'Method not allowed.'});return true}

  const params=[];
  let scope="u.role='student'";
  if(user.role==='teacher'){
    if(!user.class_id){sendJson(res,200,{students:[],summary:{activeStudents:0,totalXp:0,weeklyXp:0,writingXp:0,writingSubmissions:0,averageAccuracy:0,totalAnswers:0}});return true}
    params.push(user.class_id);
    scope+=` AND u.class_id=$${params.length}`;
  }

  const students=(await pool.query(`WITH weekly AS (SELECT user_id,xp,correct_answers,questions_answered,touchdowns FROM math_weekly_stats WHERE week_start=date_trunc('week',CURRENT_DATE)::date),writing AS (SELECT user_id,COALESCE(SUM(xp_awarded),0)::int AS writing_xp,COUNT(*) FILTER(WHERE status IN('submitted','reviewed'))::int AS writing_submissions FROM writing_entries GROUP BY user_id) SELECT u.id,u.display_name,u.username,u.selected_team,u.active,u.last_login_at,u.class_id,c.name AS class_name,COALESCE(p.total_xp,0)::int AS total_xp,COALESCE(w.xp,0)::int AS weekly_xp,COALESCE(wr.writing_xp,0)::int AS writing_xp,COALESCE(wr.writing_submissions,0)::int AS writing_submissions,COALESCE(p.touchdowns,0)::int AS touchdowns,COALESCE(p.correct_answers,0)::int AS correct_answers,COALESCE(p.questions_answered,0)::int AS questions_answered,CASE WHEN COALESCE(p.questions_answered,0)>0 THEN ROUND(p.correct_answers*100.0/p.questions_answered)::int ELSE 0 END AS accuracy,COALESCE(p.current_streak,0)::int AS current_streak,COALESCE(p.best_streak,0)::int AS best_streak,COALESCE(p.drive_yards,0)::int AS drive_yards FROM users u LEFT JOIN classes c ON c.id=u.class_id LEFT JOIN math_profiles p ON p.user_id=u.id LEFT JOIN weekly w ON w.user_id=u.id LEFT JOIN writing wr ON wr.user_id=u.id WHERE ${scope} ORDER BY u.display_name`,params)).rows;
  const active=students.filter(student=>student.active),sum=key=>active.reduce((total,student)=>total+Number(student[key]||0),0),average=key=>active.length?Math.round(sum(key)/active.length):0;
  sendJson(res,200,{students,summary:{activeStudents:active.length,totalXp:sum('total_xp'),weeklyXp:sum('weekly_xp'),writingXp:sum('writing_xp'),writingSubmissions:sum('writing_submissions'),averageAccuracy:average('accuracy'),totalAnswers:sum('questions_answered')}});return true
}
module.exports={handleTeacherAnalytics};
