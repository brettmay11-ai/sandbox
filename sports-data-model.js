(function(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.NFLSportsModel = model;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  function kickoff(game) {
    let value = game?.DateTimeUTC;
    let date;
    if (value) date = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`);
    else if (game?.Date) {
      // SportsData's unzoned Date is Eastern time, not the browser's local time.
      value = game.Date;
      if (/(?:Z|[+-]\d\d:\d\d)$/i.test(value)) date = new Date(value);
      else {
        const wall = Date.parse(`${value}Z`);
        if (!Number.isFinite(wall)) return { day:'Date TBD', date:'', time:'Time TBD', iso:null, kickoffUtc:null };
        let candidate = wall + 5 * 3600000;
        for (let i=0;i<2;i++) {
          const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(new Date(candidate)).map(part => [part.type,part.value]));
          const rendered = Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
          candidate += wall-rendered;
        }
        date = new Date(candidate);
      }
    }
    if (!date || !Number.isFinite(date.getTime()) || game?.DateTimeIsTBD) return { day:'Date TBD', date:'', time:'Time TBD', iso:null, kickoffUtc:null };
    const options = { timeZone:'America/Chicago' };
    const isoParts = new Intl.DateTimeFormat('en-CA', { ...options, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
    const part = type => isoParts.find(p => p.type === type).value;
    return {
      day:date.toLocaleDateString('en-US', { ...options, weekday:'long' }),
      date:date.toLocaleDateString('en-US', { ...options, month:'short', day:'numeric' }),
      time:date.toLocaleTimeString('en-US', { ...options, hour:'numeric', minute:'2-digit' })+' CT',
      iso:`${part('year')}-${part('month')}-${part('day')}`, kickoffUtc:date.toISOString()
    };
  }
  function normalizeGame(game) {
    const venue = game.StadiumDetails || (typeof game.Stadium === 'object' ? game.Stadium : {});
    return { week:Number(game.Week), away:game.AwayTeam, home:game.HomeTeam, season:Number(game.Season), gameKey:game.GameKey,
      ...kickoff(game), status:game.Status || (game.IsOver ? 'Final' : 'Scheduled'),
      stadium:venue.Name || (typeof game.Stadium === 'string' ? game.Stadium : ''),
      city:venue.City || '', state:venue.State || '', country:venue.Country || '',
      lat:venue.GeoLat ?? null, lng:venue.GeoLong ?? null };
  }
  function playerTables(players) {
    const fields = {
      passing:['PassingCompletions','PassingAttempts','PassingYards','PassingTouchdowns','PassingInterceptions','PassingRating'],
      rushing:['RushingAttempts','RushingYards','RushingYardsPerAttempt','RushingTouchdowns','RushingLong','Fumbles'],
      receiving:['Receptions','ReceivingTargets','ReceivingYards','ReceivingYardsPerReception','ReceivingTouchdowns','ReceivingLong'],
      defense:['SoloTackles','Sacks','Interceptions','FumblesForced','PassesDefended','DefensiveTouchdowns']
    };
    const sort = { passing:'PassingYards', rushing:'RushingYards', receiving:'ReceivingYards', defense:'Sacks' };
    return Object.fromEntries(Object.entries(fields).map(([category, columns]) => [category, players
      .filter(p => p.Team && p.Name && Number(p[sort[category]])>0)
      .sort((a,b) => Number(b[sort[category]])-Number(a[sort[category]]))
      .map((p,index) => [index+1,p.Name,p.Team,...columns.map(field => p[field] == null ? '--' : Number(p[field]))])]));
  }
  function teamTables(teams) {
    const map = (field, perGame, ascending=false) => teams.filter(t => t.Team && Number(t.Games)>0 && t[field]!=null)
      .map(t => ({ team:t.Team, val:Number((Number(t[field])/(perGame?Number(t.Games):1)).toFixed(1)) }))
      .sort((a,b) => ascending?a.val-b.val:b.val-a.val);
    return { offensive:[map('Score',true),map('OffensiveYards',true),map('PassingYards',true),map('RushingYards',true)],
      defensive:[map('OpponentScore',true,true),map('OpponentOffensiveYards',true,true),map('Sacks',false),map('InterceptionReturns',false)] };
  }
  return { kickoff, normalizeGame, playerTables, teamTables };
});
