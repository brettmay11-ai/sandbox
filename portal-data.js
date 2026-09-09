(() => {
  const requests = new Map();
  async function feed(url) {
    if (!requests.has(url)) requests.set(url, (async () => {
      const response = await fetch(url, { signal:AbortSignal.timeout(12000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Feed unavailable');
      return { data, status:response.headers.get('X-Data-Status') || 'cached', updatedAt:response.headers.get('X-Data-Updated-At') };
    })());
    return requests.get(url);
  }
  function label(meta, season) {
    if (!meta) return `${season} season | Data unavailable; waiting for scheduled update`;
    const updated = meta.updatedAt ? new Date(meta.updatedAt).toLocaleString('en-US',{ timeZone:'America/Chicago', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })+' CT' : 'unknown';
    return `${season} season | SportsData.io | Updated ${updated}${meta.status==='stale'?' | Delayed update: showing last stored data':''}`;
  }
  window.NFLFeeds = { feed, label, season:null, players:null, schedule:null, teamStats:null };
  window.initializeSportsData = async function() {
    const state = window.NFLFeeds;
    const now = new Date();
    state.season = now.getMonth()<2 ? now.getFullYear()-1 : now.getFullYear();
    try { state.season = Number((await feed('/api/sportsdata/nfl/current-season')).data); } catch (error) { console.warn(error.message); }
    const results = await Promise.allSettled(['schedule','player-season-stats','team-season-stats'].map(kind => feed(`/api/sportsdata/nfl/${kind}/${state.season}`)));
    const value = index => results[index].status==='fulfilled' ? results[index].value : null;
    state.schedule=value(0); state.players=value(1); state.teamStats=value(2);
    const games=(state.schedule?.data || []).filter(g => (!g.SeasonType || g.SeasonType===1) && Number(g.Week)>=1 && Number(g.Week)<=18 && getTeam(g.AwayTeam) && getTeam(g.HomeTeam)).map(NFLSportsModel.normalizeGame);
    WEEKS.splice(0,WEEKS.length,...Array.from({length:18},(_,i)=>({week:i+1,games:games.filter(g=>g.week===i+1).sort((a,b)=>(a.kickoffUtc||'z').localeCompare(b.kickoffUtc||'z'))})));
    for (const team of NFL_TEAMS) {
      SCHED_2026[team.abbr]={home:[],away:[]};
      SCHED_2026_RAW[team.abbr]=Array(18).fill('BYE');
    }
    for (const game of games) {
      if (game.week<1 || game.week>18) continue;
      SCHED_2026[game.away].away.push(game.home); SCHED_2026[game.home].home.push(game.away);
      SCHED_2026_RAW[game.away][game.week-1]='@'+game.home; SCHED_2026_RAW[game.home][game.week-1]=game.away;
      REAL_GAME_TIMES[`${game.week}_${game.away}_${game.home}`]=game;
    }
    for (const game of INTERNATIONAL_GAMES) {
      const actual=games.find(g=>state.season===2026 && g.week===game.week && g.away===game.away && g.home===game.home);
      game.time=actual?.time || 'Time TBD'; game.available=Boolean(actual);
    }
    const players=NFLSportsModel.playerTables((state.players?.data || []).filter(player=>NFL_TEAMS.some(team=>team.abbr===player.Team)));
    for (const category of Object.keys(PLAYER_STATS)) PLAYER_STATS[category].players=players[category];
    PLAYER_STATS.passing.headers[8]='Passer Rating';
    PLAYER_STATS.defense.headers[3]='Solo Tkl';
    const teamStats=NFLSportsModel.teamTables((state.teamStats?.data || []).filter(row=>NFL_TEAMS.some(team=>team.abbr===row.Team)));
    for (const category of ['offensive','defensive']) TEAM_STATS[category].forEach((stat,i)=>{stat.data=teamStats[category][i]});
    try {
      const response=await fetch('/api/featured-game', { signal:AbortSignal.timeout(12000) });
      const data=await response.json();
      if (response.ok && data.featuredGame) Object.assign(FEATURED_GAME,data.featuredGame);
    } catch(error) { console.warn('Featured selection unavailable.',error); }
    for (const [id,meta] of [['home',state.schedule],['teams',state.teamStats],['stats',state.teamStats],['players',state.players],['matchups',state.schedule],['travel',state.schedule]]) {
      const section=document.getElementById(id==='home'?'featured':id);
      if (!section) continue;
      const note=document.createElement('p'); note.className='sports-data-status'; note.textContent=label(meta,state.season);
      section.querySelector('.max-w-6xl, .max-w-7xl')?.prepend(note);
    }
  };
})();
