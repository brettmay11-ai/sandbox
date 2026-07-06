/* Featured Game of the Week controls for the teacher dashboard. */
(() => {
  const teams=window.NFL_TEAM_BRANDS||[];let schedule=[];
  const teamName=abbr=>teams.find(team=>team.abbr===abbr)?.name||abbr;
  async function request(url,options={}){const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Request failed.');return data}
  const main=document.querySelector('main');if(!main)return;
  const panel=document.createElement('section');panel.className='panel rounded-xl p-5 mb-5';panel.innerHTML=`<div class="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5"><div><h2 class="font-semibold flex items-center gap-2"><iconify-icon icon="lucide:star" class="text-yellow-400"></iconify-icon>Featured Game of the Week</h2><p class="text-xs text-white/35 mt-1">Choose a matchup from the live 2026 schedule. The home stadium or city photo loads automatically.</p></div><span id="fg-status" class="text-xs text-white/40"></span></div><form id="fg-form" class="grid md:grid-cols-[110px_1fr_160px_auto] gap-3 items-end"><label class="text-xs text-white/50">Week<select id="fg-week" class="mt-2 w-full border border-white/10 rounded-lg px-3 py-2.5 outline-none">${Array.from({length:18},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label><label class="text-xs text-white/50">Scheduled matchup<select id="fg-matchup" class="mt-2 w-full border border-white/10 rounded-lg px-3 py-2.5 outline-none"></select></label><div class="text-xs text-white/50">Scheduled kickoff<div id="fg-kickoff" class="mt-2 w-full border border-white/10 rounded-lg px-3 py-2.5 bg-white/5 text-white/80">Schedule time</div></div><button class="bg-blue-700 hover:bg-blue-600 rounded-lg px-5 py-2.5 text-sm font-semibold">Publish Game</button><label class="md:col-span-4 text-xs text-white/50">Class discussion prompt<textarea id="fg-discussion" rows="2" class="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 outline-none" placeholder="Add a math, science, or social studies question about this matchup."></textarea></label></form>`;
  main.insertBefore(panel,main.children[1]||null);
  function easternKickoff(game){
    const source=game?.DateTimeUTC||game?.Date;
    if(!source)return {day:'Sunday',time:'1:00 PM ET'};
    if(game.DateTimeUTC){
      const date=new Date(`${source}Z`);
      return {
        day:date.toLocaleDateString('en-US',{weekday:'long',timeZone:'America/New_York'}),
        time:date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET'
      };
    }
    const [,hour='13',minute='00']=source.match(/T(\d{2}):(\d{2})/)||[];
    const date=new Date(`${source.slice(0,10)}T12:00:00Z`);
    const hourNumber=Number(hour),displayHour=hourNumber%12||12,period=hourNumber>=12?'PM':'AM';
    return {
      day:date.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),
      time:`${displayHour}:${minute} ${period} ET`
    };
  }
  function displayTime(game){return easternKickoff(game).time}
  function selectedGame(){const [away,home]=document.getElementById('fg-matchup').value.split('|'),week=Number(document.getElementById('fg-week').value);return schedule.find(game=>Number(game.Week)===week&&game.AwayTeam===away&&game.HomeTeam===home)}
  function updateKickoff(){const kickoff=document.getElementById('fg-kickoff');if(kickoff)kickoff.textContent=displayTime(selectedGame())}
  function renderMatchups(selectedAway,selectedHome){const week=Number(document.getElementById('fg-week').value),games=schedule.filter(game=>Number(game.Week)===week);document.getElementById('fg-matchup').innerHTML=games.map(game=>`<option value="${game.AwayTeam}|${game.HomeTeam}" ${game.AwayTeam===selectedAway&&game.HomeTeam===selectedHome?'selected':''}>${teamName(game.AwayTeam)} at ${teamName(game.HomeTeam)}</option>`).join('')||'<option value="">Schedule unavailable</option>';updateKickoff()}
  async function load(){try{const [saved,games]=await Promise.all([request('/api/featured-game'),request('/api/sportsdata/nfl/schedule/2026')]);const unique=new Map();if(Array.isArray(games))games.filter(game=>game.GameKey&&game.AwayTeam&&game.HomeTeam).forEach(game=>unique.set(game.GameKey,game));schedule=[...unique.values()];const featured=saved.featuredGame||{week:1,away:'NE',home:'SEA'};document.getElementById('fg-week').value=featured.week||1;renderMatchups(featured.away,featured.home);document.getElementById('fg-discussion').value=featured.discussion||'';document.getElementById('fg-status').textContent=`Currently: ${featured.away} at ${featured.home}`}catch(error){document.getElementById('fg-status').textContent=error.message}}
  document.getElementById('fg-week').addEventListener('change',()=>renderMatchups());document.getElementById('fg-matchup').addEventListener('change',updateKickoff);
  document.getElementById('fg-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const game=selectedGame();if(!game)throw new Error('Choose a scheduled matchup.');const kickoff=easternKickoff(game);const body={week:Number(game.Week),away:game.AwayTeam,home:game.HomeTeam,day:kickoff.day,time:kickoff.time,discussion:document.getElementById('fg-discussion').value};await request('/api/featured-game',{method:'PATCH',body:JSON.stringify(body)});document.getElementById('fg-status').textContent=`Published: ${body.away} at ${body.home}`}catch(error){alert(error.message)}finally{button.disabled=false}});load();
})();
