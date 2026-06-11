const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');
const { initMathGame, handleMathGame } = require('./math-game-api');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const pool = new Pool({ connectionString:databaseUrl, ...(process.env.PGSSL === 'true' ? { ssl:{ rejectUnauthorized:false } } : {}) });
const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);

function parseCookies(request){return Object.fromEntries(String(request.headers.cookie||'').split(';').map(value=>value.trim().split('=').map(decodeURIComponent)).filter(parts=>parts.length===2))}
function tokenHash(token){return crypto.createHash('sha256').update(token).digest('hex')}
function sendJson(response,status,data){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(data))}
function readJson(request){return new Promise((resolve,reject)=>{let body='';request.on('data',chunk=>{body+=chunk;if(body.length>100000)request.destroy()});request.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch(error){reject(error)}});request.on('error',reject)})}
async function getUser(request){const token=parseCookies(request).nfl_session;if(!token)return null;const result=await pool.query(`SELECT u.id,u.username,u.display_name,u.role,u.selected_team FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,[tokenHash(token)]);return result.rows[0]||null}
async function handleTeamAssignment(request,response,pathname,user){
  const match=pathname.match(/^\/api\/teacher\/students\/(\d+)\/team$/);
  if(!match||request.method!=='PATCH')return false;
  if(!user)return sendJson(response,401,{error:'Please sign in.'}),true;
  if(user.role!=='teacher')return sendJson(response,403,{error:'Teacher access required.'}),true;
  const body=await readJson(request),team=String(body.team||'').toUpperCase();
  if(team&&!NFL_TEAMS.has(team))return sendJson(response,400,{error:'Choose a valid NFL team.'}),true;
  const result=await pool.query("UPDATE users SET selected_team=$1 WHERE id=$2 AND role='student' RETURNING id,selected_team",[team||null,match[1]]);
  if(!result.rowCount)return sendJson(response,404,{error:'Student not found.'}),true;
  sendJson(response,200,{student:result.rows[0]});return true;
}
async function handleStudentProgress(request,response,pathname,user){
  if(pathname!=='/api/progress'||request.method!=='POST')return false;
  if(!user)return sendJson(response,401,{error:'Please sign in.'}),true;
  const body=await readJson(request);
  if(body.page)await pool.query('INSERT INTO progress(user_id,page,completed) VALUES($1,$2,$3) ON CONFLICT(user_id,page) DO UPDATE SET completed=EXCLUDED.completed,updated_at=NOW()',[user.id,String(body.page).slice(0,32),Boolean(body.completed)]);
  sendJson(response,200,{ok:true,selectedTeam:user.selected_team});return true;
}

(async()=>{
  await initMathGame(pool);
  const createServer=http.createServer.bind(http);
  http.createServer=function classroomGameServer(originalListener){
    return createServer(async(request,response)=>{
      try{
        const pathname=decodeURIComponent(new URL(request.url,`http://${request.headers.host||'localhost'}`).pathname);
        if(pathname.startsWith('/api/math-game/')||pathname.includes('/team')||(pathname==='/api/progress'&&request.method==='POST')){
          const user=await getUser(request);
          if(await handleTeamAssignment(request,response,pathname,user))return;
          if(await handleStudentProgress(request,response,pathname,user))return;
          if(pathname.startsWith('/api/math-game/')){await handleMathGame({pool,req:request,res:response,path:pathname,user,sendJson,readJson});return;}
        }
        originalListener(request,response);
      }catch(error){console.error('Classroom extension request failed.',error);if(!response.headersSent)sendJson(response,500,{error:'Server error.'});else response.end();}
    });
  };
  require('./server');
})().catch(error=>{console.error('Classroom extension initialization failed.',error);process.exit(1)});
