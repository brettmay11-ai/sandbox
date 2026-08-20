(() => {
  const SEASON = 2026;
  const DIVISION_ORDER = ['AFC East','AFC North','AFC South','AFC West','NFC East','NFC North','NFC South','NFC West'];
  const CONFERENCE_ORDER = ['AFC','NFC'];
  const TEAM_DIVISIONS = {
    BUF:'AFC East', MIA:'AFC East', NE:'AFC East', NYJ:'AFC East',
    BAL:'AFC North', CIN:'AFC North', CLE:'AFC North', PIT:'AFC North',
    HOU:'AFC South', IND:'AFC South', JAX:'AFC South', TEN:'AFC South',
    DEN:'AFC West', KC:'AFC West', LV:'AFC West', LAC:'AFC West',
    DAL:'NFC East', NYG:'NFC East', PHI:'NFC East', WAS:'NFC East',
    CHI:'NFC North', DET:'NFC North', GB:'NFC North', MIN:'NFC North',
    ATL:'NFC South', CAR:'NFC South', NO:'NFC South', TB:'NFC South',
    ARI:'NFC West', LAR:'NFC West', SEA:'NFC West', SF:'NFC West'
  };
  const TEAM_CONFERENCES = Object.fromEntries(Object.entries(TEAM_DIVISIONS).map(([team, division]) => [team, division.slice(0, 3)]));
  const aliases = { JAC:'JAX', LA:'LAR', WSH:'WAS' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const teamCode = value => aliases[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
  const num = (...values) => {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };
  const pct = team => {
    const explicit = Number(team.Percentage ?? team.WinPercentage ?? team.WinningPercentage);
    if (Number.isFinite(explicit) && explicit > 0) return explicit > 1 ? explicit / 100 : explicit;
    const wins = num(team.Wins, team.W, team.wins), losses = num(team.Losses, team.L, team.losses), ties = num(team.Ties, team.T, team.ties);
    const games = wins + losses + ties;
    return games ? (wins + ties * 0.5) / games : 0;
  };
  const record = team => `${num(team.Wins, team.W, team.wins)}-${num(team.Losses, team.L, team.losses)}${num(team.Ties, team.T, team.ties) ? '-' + num(team.Ties, team.T, team.ties) : ''}`;
  const divisionRecord = team => {
    const wins = num(team.DivisionWins, team.DivisionW, team.DivisionRecordWins);
    const losses = num(team.DivisionLosses, team.DivisionL, team.DivisionRecordLosses);
    const ties = num(team.DivisionTies, team.DivisionT, team.DivisionRecordTies);
    return wins || losses || ties ? `${wins}-${losses}${ties ? '-' + ties : ''}` : '—';
  };
  const pointDiff = team => num(team.PointsFor, team.ScoreFor, team.PF) - num(team.PointsAgainst, team.ScoreAgainst, team.PA);
  const teamName = abbr => {
    if (typeof getNFLTeamBrand === 'function') return getNFLTeamBrand(abbr)?.name || abbr;
    if (typeof getTeam === 'function') {
      const team = getTeam(abbr);
      if (team) return team.name || team.displayName || abbr;
    }
    return abbr;
  };
  async function api(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load standings.');
    return data;
  }
  async function loadStandings() {
    if (window.NFL_STANDINGS_2026) return window.NFL_STANDINGS_2026;
    const rows = await api(`/api/sportsdata/nfl/standings/${SEASON}`);
    const normalized = (Array.isArray(rows) ? rows : []).map(row => {
      const abbr = teamCode(row.Team || row.Key || row.TeamKey || row.Abbreviation);
      const division = row.Division || TEAM_DIVISIONS[abbr] || 'NFL';
      const conference = row.Conference || TEAM_CONFERENCES[abbr] || division.slice(0, 3);
      return { ...row, abbr, division, conference, pct:pct(row), record:record(row), divisionRecord:divisionRecord(row), pointDiff:pointDiff(row) };
    }).filter(row => row.abbr);
    normalized.sort((a, b) => b.pct - a.pct || b.pointDiff - a.pointDiff || teamName(a.abbr).localeCompare(teamName(b.abbr)));
    window.NFL_STANDINGS_2026 = normalized;
    return normalized;
  }
  async function selectedTeam() {
    if (window.currentUser?.selectedTeam) return teamCode(window.currentUser.selectedTeam);
    try {
      const data = await api('/api/me');
      return teamCode(data.user?.selectedTeam || data.user?.selected_team || data.selectedTeam);
    } catch (error) {
      return '';
    }
  }
  function rankInGroup(rows, team, field) {
    const group = rows.filter(row => row[field] === team[field]).sort((a, b) => b.pct - a.pct || b.pointDiff - a.pointDiff);
    const index = group.findIndex(row => row.abbr === team.abbr);
    return index >= 0 ? index + 1 : null;
  }
  function rowHtml(row, index) {
    const diff = row.pointDiff > 0 ? `+${row.pointDiff}` : String(row.pointDiff);
    return `<tr data-standing-team="${esc(row.abbr)}"><td>${index + 1}</td><td><strong>${esc(teamName(row.abbr))}</strong><small>${esc(row.division)}</small></td><td>${esc(row.record)}</td><td>${(row.pct * 100).toFixed(1)}%</td><td>${esc(row.divisionRecord)}</td><td>${num(row.PointsFor, row.ScoreFor, row.PF)}</td><td>${num(row.PointsAgainst, row.ScoreAgainst, row.PA)}</td><td>${diff}</td><td>${esc(row.Streak || row.CurrentStreak || '—')}</td></tr>`;
  }
  function tableHtml(rows) {
    return `<div class="standings-table-wrap"><table class="standings-table"><thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Win %</th><th>Div.</th><th>PF</th><th>PA</th><th>Diff</th><th>Streak</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
  }
  function installStatsStandings(rows) {
    const stats = document.getElementById('stats');
    if (!stats || document.getElementById('nfl-standings-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'nfl-standings-panel';
    panel.className = 'glass-panel standings-panel section-reveal visible';
    panel.innerHTML = `<div class="standings-head"><div><p class="standings-eyebrow">League context</p><h2>NFL Standings</h2><p>Track where every team sits before you compare player and team stats.</p></div><div class="standings-tabs"><button data-standings-view="division" class="active">Division</button><button data-standings-view="conference">Conference</button><button data-standings-view="wildcard">Wild Card</button></div></div><div id="standings-content"></div>`;
    stats.insertBefore(panel, stats.firstElementChild?.nextSibling || stats.firstChild);
    const content = panel.querySelector('#standings-content');
    function render(view = 'division') {
      panel.querySelectorAll('[data-standings-view]').forEach(button => button.classList.toggle('active', button.dataset.standingsView === view));
      if (view === 'conference') {
        content.innerHTML = CONFERENCE_ORDER.map(conf => `<section class="standings-group"><h3>${conf}</h3>${tableHtml(rows.filter(row => row.conference === conf).sort((a,b)=>b.pct-a.pct||b.pointDiff-a.pointDiff))}</section>`).join('');
        return;
      }
      if (view === 'wildcard') {
        content.innerHTML = CONFERENCE_ORDER.map(conf => `<section class="standings-group"><h3>${conf} Playoff Picture</h3>${tableHtml(rows.filter(row => row.conference === conf).sort((a,b)=>b.pct-a.pct||b.pointDiff-a.pointDiff).slice(0, 7))}</section>`).join('');
        return;
      }
      content.innerHTML = DIVISION_ORDER.map(division => `<section class="standings-group"><h3>${division}</h3>${tableHtml(rows.filter(row => row.division === division).sort((a,b)=>b.pct-a.pct||b.pointDiff-a.pointDiff))}</section>`).join('');
    }
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-standings-view]');
      if (button) render(button.dataset.standingsView);
    });
    render('division');
  }
  async function installDashboardCard(rows) {
    const dashboard = document.getElementById('dashboard') || document.getElementById('facts');
    if (!dashboard || document.getElementById('selected-team-standings-card')) return;
    const selected = await selectedTeam();
    const team = rows.find(row => row.abbr === selected);
    if (!team) return;
    const divRank = rankInGroup(rows, team, 'division');
    const confRank = rankInGroup(rows, team, 'conference');
    const card = document.createElement('article');
    card.id = 'selected-team-standings-card';
    card.className = 'glass-panel selected-standing-card section-reveal visible';
    card.innerHTML = `<p class="standings-eyebrow">Your team standing</p><div class="selected-standing-main"><div><h2>${esc(teamName(team.abbr))}</h2><p>${esc(team.record)} • ${divRank ? `${ordinal(divRank)} in ${team.division}` : team.division}</p></div><strong>${confRank ? `#${confRank}` : '—'} <span>${esc(team.conference)}</span></strong></div><div class="selected-standing-metrics"><span><small>Win %</small>${(team.pct * 100).toFixed(1)}%</span><span><small>Point diff</small>${team.pointDiff > 0 ? '+' : ''}${team.pointDiff}</span><span><small>Streak</small>${esc(team.Streak || team.CurrentStreak || '—')}</span></div>`;
    dashboard.insertBefore(card, dashboard.firstElementChild?.nextSibling || dashboard.firstChild);
  }
  function ordinal(value) {
    const suffix = value % 10 === 1 && value % 100 !== 11 ? 'st' : value % 10 === 2 && value % 100 !== 12 ? 'nd' : value % 10 === 3 && value % 100 !== 13 ? 'rd' : 'th';
    return `${value}${suffix}`;
  }
  async function installFeaturedContext(rows) {
    const featured = document.getElementById('featured');
    if (!featured || document.getElementById('featured-standings-context')) return;
    let game = window.FEATURED_GAME;
    try {
      const data = await api('/api/featured-game');
      if (data.featuredGame) game = { ...(game || {}), ...data.featuredGame };
    } catch (error) {}
    const away = rows.find(row => row.abbr === teamCode(game?.away));
    const home = rows.find(row => row.abbr === teamCode(game?.home));
    if (!away || !home) return;
    const context = document.createElement('div');
    context.id = 'featured-standings-context';
    context.className = 'featured-standings-context';
    context.innerHTML = `<div><span>Standings context</span><strong>${esc(teamName(away.abbr))}: ${esc(away.record)} · ${ordinal(rankInGroup(rows, away, 'division') || 0)} in ${esc(away.division)}</strong></div><div><span>&nbsp;</span><strong>${esc(teamName(home.abbr))}: ${esc(home.record)} · ${ordinal(rankInGroup(rows, home, 'division') || 0)} in ${esc(home.division)}</strong></div>`;
    const target = featured.querySelector('.featured-content') || featured.firstElementChild || featured;
    target.appendChild(context);
  }
  async function installStandings() {
    try {
      const rows = await loadStandings();
      installStatsStandings(rows);
      await installDashboardCard(rows);
      await installFeaturedContext(rows);
    } catch (error) {
      console.warn('Could not install NFL standings.', error);
    }
  }
  window.addEventListener('DOMContentLoaded', installStandings);
})();
