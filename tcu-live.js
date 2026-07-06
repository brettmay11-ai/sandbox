/* Live TCU section powered through the classroom sports-data cache. */

let liveTCUSeason = null;
let liveTCUPlayers = [];

async function fetchTCUJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { signal:controller.signal });
    if (!response.ok) throw new Error(`TCU sports data returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function formatTCUValue(value) {
  const number = Number(value || 0);
  if (Number.isInteger(number)) return number.toLocaleString();
  return number.toLocaleString(undefined, { maximumFractionDigits:1 });
}

async function resolveTCUSeason() {
  const current = Number(await fetchTCUJson('/api/sportsdata/cfb/current-season'));
  for (const season of [current, current - 1]) {
    try {
      const players = await fetchTCUJson(`/api/sportsdata/cfb/player-season-stats-by-team/${season}/TCU`);
      if (Array.isArray(players) && players.some(player => Number(player.Games) > 0)) {
        liveTCUPlayers = players;
        return season;
      }
    } catch (error) {
      console.warn(`TCU season ${season} is unavailable.`, error);
    }
  }
  return current;
}

function buildTCULeaderRows(field, fields, count = 8) {
  return [...liveTCUPlayers]
    .filter(player => Number(player[field] || 0) > 0)
    .sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0))
    .slice(0, count)
    .map(player => fields.map(key => key === 'Name' ? player.Name : formatTCUValue(player[key])));
}

function updateTCUPlayerStats() {
  TCU_STATS.passing = {
    headers: ['Player', 'Cmp', 'Att', 'Yds', 'TD', 'INT', 'Rate'],
    players: buildTCULeaderRows('PassingYards', ['Name', 'PassingCompletions', 'PassingAttempts', 'PassingYards', 'PassingTouchdowns', 'PassingInterceptions', 'PassingRating'])
  };
  TCU_STATS.rushing = {
    headers: ['Player', 'Att', 'Yds', 'Avg', 'TD', 'Lng'],
    players: buildTCULeaderRows('RushingYards', ['Name', 'RushingAttempts', 'RushingYards', 'RushingYardsPerAttempt', 'RushingTouchdowns', 'RushingLong'])
  };
  TCU_STATS.receiving = {
    headers: ['Player', 'Rec', 'Tgt', 'Yds', 'Avg', 'TD', 'Lng'],
    players: buildTCULeaderRows('ReceivingYards', ['Name', 'Receptions', 'ReceivingTargets', 'ReceivingYards', 'ReceivingYardsPerReception', 'ReceivingTouchdowns', 'ReceivingLong'])
  };
  TCU_STATS.defense = {
    headers: ['Player', 'Solo', 'Ast', 'TFL', 'Sacks', 'INT', 'PD'],
    players: [...liveTCUPlayers]
      .filter(player => Number(player.SoloTackles || 0) + Number(player.AssistedTackles || 0) > 0)
      .sort((a, b) => (Number(b.SoloTackles || 0) + Number(b.AssistedTackles || 0)) - (Number(a.SoloTackles || 0) + Number(a.AssistedTackles || 0)))
      .slice(0, 8)
      .map(player => ['Name', 'SoloTackles', 'AssistedTackles', 'TacklesForLoss', 'Sacks', 'Interceptions', 'PassesDefended'].map(key => key === 'Name' ? player.Name : formatTCUValue(player[key])))
  };

  const tabs = document.querySelector('[data-tcutab="receiving"]')?.parentElement;
  if (tabs && !tabs.querySelector('[data-tcutab="defense"]')) {
    tabs.insertAdjacentHTML('beforeend', '<button onclick="switchTCUTab(\'defense\')" data-tcutab="defense" class="tcutab-btn text-[10px] px-3 py-1.5 rounded-full bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition">Defense</button>');
  }
  renderTCUStats();
}

function renderLiveTCUSchedule(games) {
  const list = document.getElementById('tcu-schedule-list');
  if (!list) return;
  list.innerHTML = games.sort((a, b) => Number(a.Week) - Number(b.Week)).map(game => {
    const isHome = game.HomeTeam === 'TCU';
    const opponent = isHome ? game.AwayTeamName : game.HomeTeamName;
    const tcuScore = isHome ? game.HomeTeamScore : game.AwayTeamScore;
    const opponentScore = isHome ? game.AwayTeamScore : game.HomeTeamScore;
    const final = game.Status === 'Final' || game.IsClosed;
    const won = final && Number(tcuScore) > Number(opponentScore);
    const date = new Date(game.DateTime || game.Day).toLocaleDateString(undefined, { month:'short', day:'numeric' });
    return `<div class="tcu-row flex items-center justify-between p-3">
      <div class="flex items-center gap-3 min-w-0"><span class="grid place-items-center text-[10px] font-black text-white bg-[#4D1979] border border-white/15 w-8 h-8">W${game.Week}</span><span class="text-[12px] font-semibold truncate">${isHome ? '' : '@ '}${opponent}</span></div>
      <div class="text-right shrink-0"><div class="text-[9px] text-white/35">${date}${game.Channel ? ` · ${game.Channel}` : ''}</div>${final ? `<div class="text-[10px] font-semibold ${won ? 'text-green-300' : 'text-red-300'}">${won ? 'W' : 'L'} ${formatTCUValue(tcuScore)}-${formatTCUValue(opponentScore)}</div>` : '<div class="text-[9px] tcu-purple font-bold">Upcoming</div>'}</div>
    </div>`;
  }).join('');
}

function renderTCUSeasonSummary(team, teamStats) {
  const header = document.getElementById('tcu-header');
  if (!header) return;

  document.getElementById('tcu-team-name').textContent = `${team.School} ${team.Name}`;
  document.getElementById('tcu-team-subtitle').textContent = `Fort Worth, TX · Amon G. Carter Stadium · ${team.Conference} · ${liveTCUSeason} Season`;

  let summary = document.getElementById('tcu-live-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'tcu-live-summary';
    summary.className = 'grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 text-left';
    header.querySelector('.relative.z-10 > div:first-child')?.appendChild(summary);
  }

  const record = teamStats ? `${teamStats.Wins}-${teamStats.Losses}` : `${team.Wins}-${team.Losses}`;
  const conferenceRecord = teamStats ? `${teamStats.ConferenceWins}-${teamStats.ConferenceLosses}` : `${team.ConferenceWins}-${team.ConferenceLosses}`;
  summary.innerHTML = [
    ['Overall Record', record],
    ['Big 12 Record', conferenceRecord],
    ['Points For', formatTCUValue(teamStats?.PointsFor)],
    ['Points Against', formatTCUValue(teamStats?.PointsAgainst)]
  ].map(([label, value]) => `<div class="tcu-stat-card p-4"><div class="text-[9px] text-white/35 uppercase tracking-wider font-black">${label}</div><div class="text-xl font-black mt-1">${value}</div></div>`).join('');
}

async function initializeLiveTCU() {
  const section = document.getElementById('TCU');
  if (document.documentElement.dataset.portalPage !== 'tcu') return;
  if (!section) return;
  try {
    liveTCUSeason = await resolveTCUSeason();
    const [teams, games, teamStats] = await Promise.all([
      fetchTCUJson('/api/sportsdata/cfb/teams'),
      fetchTCUJson(`/api/sportsdata/cfb/games/${liveTCUSeason}`),
      fetchTCUJson(`/api/sportsdata/cfb/team-season-stats/${liveTCUSeason}`)
    ]);

    const tcu = teams.find(team => team.Key === 'TCU');
    const tcuGames = games.filter(game => game.HomeTeam === 'TCU' || game.AwayTeam === 'TCU');
    const tcuSeasonStats = teamStats.find(team => team.Team === 'TCU');
    if (!tcu) throw new Error('TCU profile was not returned.');

    renderTCUSeasonSummary(tcu, tcuSeasonStats);
    renderLiveTCUSchedule(tcuGames);
    updateTCUPlayerStats();
  } catch (error) {
    console.warn('Live TCU data could not be loaded; keeping classroom fallback.', error);
    document.getElementById('tcu-team-name').textContent = 'TCU Horned Frogs';
    document.getElementById('tcu-team-subtitle').textContent = 'Live TCU data is temporarily unavailable. Showing classroom fallback.';
    if (typeof renderTCUSection === 'function') renderTCUSection();
  }
}

initializeLiveTCU();
