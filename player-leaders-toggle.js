(() => {
  const SEASON = 2026;
  const TEAMS = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'];
  const aliases = { JAC:'JAX', LA:'LAR', WSH:'WAS' };
  const CATEGORIES = [
    { id:'passing', label:'Passing', statLabel:'Pass yds', fields:['PassingYards','PassYards','passing_yards'] },
    { id:'rushing', label:'Rushing', statLabel:'Rush yds', fields:['RushingYards','RushYards','rushing_yards'] },
    { id:'receiving', label:'Receiving', statLabel:'Rec yds', fields:['ReceivingYards','ReceivingYardsPerGame','RecYards','receiving_yards'] },
    { id:'touchdowns', label:'Touchdowns', statLabel:'TD', fields:['Touchdowns','TotalTouchdowns','ReceivingTouchdowns','RushingTouchdowns','PassingTouchdowns'] },
    { id:'defense', label:'Defense', statLabel:'Tackles', fields:['Tackles','SoloTackles','AssistedTackles'] },
    { id:'sacks', label:'Sacks', statLabel:'Sacks', fields:['Sacks'] },
    { id:'interceptions', label:'INT', statLabel:'INT', fields:['Interceptions'] }
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const teamCode = value => aliases[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
  const numberValue = (player, fields) => {
    if (fields.includes('Touchdowns')) {
      const explicit = Number(player.Touchdowns ?? player.TotalTouchdowns);
      if (Number.isFinite(explicit) && explicit > 0) return explicit;
      return Number(player.ReceivingTouchdowns || 0) + Number(player.RushingTouchdowns || 0) + Number(player.PassingTouchdowns || 0) + Number(player.ReturnTouchdowns || 0);
    }
    for (const field of fields) {
      const value = Number(player[field]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  };
  const playerName = player => player.Name || player.PlayerName || `${player.FirstName || ''} ${player.LastName || ''}`.trim() || 'Player';
  const playerTeam = player => teamCode(player.Team || player.TeamKey || player.GlobalTeamID || player.FantasyTeam || '');
  const playerPosition = player => player.Position || player.FantasyPosition || player.PositionCategory || 'NFL';
  async function api(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load player stats.');
    return data;
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
  async function teamStats(team) {
    const key = `NFL_PLAYER_STATS_${SEASON}_${team}`;
    if (window[key]) return window[key];
    const rows = await api(`/api/sportsdata/nfl/player-season-stats-by-team/${SEASON}/${team}`);
    window[key] = Array.isArray(rows) ? rows : [];
    return window[key];
  }
  async function scopeRows(scope, team) {
    if (scope === 'team') return team ? await teamStats(team) : [];
    if (window.NFL_LEAGUE_PLAYER_STATS_2026) return window.NFL_LEAGUE_PLAYER_STATS_2026;
    const results = await Promise.allSettled(TEAMS.map(teamStats));
    const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    window.NFL_LEAGUE_PLAYER_STATS_2026 = rows;
    return rows;
  }
  function leaders(rows, category) {
    return rows.map(player => ({ player, value:numberValue(player, category.fields) }))
      .filter(item => Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value || playerName(a.player).localeCompare(playerName(b.player)))
      .slice(0, 10);
  }
  function cardHtml(item, index, category) {
    const team = playerTeam(item.player);
    return `<article class="player-leader-card"><div class="player-leader-rank">#${index + 1}</div><div class="player-leader-name"><strong>${esc(playerName(item.player))}</strong><small>${esc(team || 'NFL')} · ${esc(playerPosition(item.player))}</small></div><div class="player-leader-stat">${Math.round(item.value).toLocaleString()}<span>${esc(category.statLabel)}</span></div></article>`;
  }
  function hideDuplicateLeaderSections(page, panel) {
    const duplicatePattern = /league\s+top\s*10|league\s+leaders|top\s+10\s+nfl|passing\s+leaders|rushing\s+leaders|receiving\s+leaders|touchdown\s+leaders|defensive\s+leaders|sack\s+leaders|interception\s+leaders/i;
    [...page.children].forEach(child => {
      if (child === panel || child.contains(panel)) return;
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (duplicatePattern.test(text)) {
        child.dataset.hiddenDuplicatePlayerLeaders = 'true';
        child.style.display = 'none';
      }
    });
  }
  function installPanel() {
    const page = document.getElementById('players');
    if (!page || document.getElementById('player-leaders-toggle-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'player-leaders-toggle-panel';
    panel.className = 'player-leaders-hero section-reveal visible';
    panel.innerHTML = `<div class="player-leaders-head"><div><p class="player-leaders-eyebrow">Player stat leaders</p><h2>League Top 10</h2><p id="player-leaders-subtitle">Compare the NFL leaders by category, then switch to your assigned team.</p></div><div class="player-leaders-scope" aria-label="Player leaderboard scope"><button type="button" data-player-scope="league" class="active">League Top 10</button><button type="button" data-player-scope="team">My Team</button></div></div><div class="player-leaders-cats" aria-label="Player stat categories">${CATEGORIES.map((cat, index) => `<button type="button" data-player-category="${cat.id}" class="${index === 0 ? 'active' : ''}">${cat.label}</button>`).join('')}</div><div id="player-leaders-status" class="player-leaders-status">Loading league leaders...</div><div id="player-leaders-grid" class="player-leaders-grid"></div>`;
    page.insertBefore(panel, page.firstElementChild?.nextSibling || page.firstChild);
    hideDuplicateLeaderSections(page, panel);
    setTimeout(() => hideDuplicateLeaderSections(page, panel), 600);
    setTimeout(() => hideDuplicateLeaderSections(page, panel), 1800);
    let scope = 'league';
    let category = CATEGORIES[0];
    let myTeam = '';
    const title = panel.querySelector('h2');
    const subtitle = panel.querySelector('#player-leaders-subtitle');
    const status = panel.querySelector('#player-leaders-status');
    const grid = panel.querySelector('#player-leaders-grid');
    async function render() {
      status.textContent = scope === 'team' ? 'Loading your team leaders...' : 'Loading league leaders...';
      grid.innerHTML = '';
      if (!myTeam) myTeam = await selectedTeam();
      const rows = await scopeRows(scope, myTeam);
      const top = leaders(rows, category);
      title.textContent = scope === 'team' ? 'My Team Leaders' : 'League Top 10';
      subtitle.textContent = scope === 'team' ? `Top ${myTeam || 'team'} players for ${category.label.toLowerCase()}.` : `Top NFL players for ${category.label.toLowerCase()}.`;
      status.textContent = top.length ? `${category.label} · ${scope === 'team' ? myTeam || 'My team' : 'League Top 10'}` : 'No player stats found for this view yet.';
      grid.innerHTML = top.map((item, index) => cardHtml(item, index, category)).join('');
    }
    panel.addEventListener('click', event => {
      const scopeButton = event.target.closest('[data-player-scope]');
      if (scopeButton) {
        scope = scopeButton.dataset.playerScope;
        panel.querySelectorAll('[data-player-scope]').forEach(button => button.classList.toggle('active', button === scopeButton));
        render();
      }
      const categoryButton = event.target.closest('[data-player-category]');
      if (categoryButton) {
        category = CATEGORIES.find(item => item.id === categoryButton.dataset.playerCategory) || CATEGORIES[0];
        panel.querySelectorAll('[data-player-category]').forEach(button => button.classList.toggle('active', button === categoryButton));
        render();
      }
    });
    render().catch(error => {
      console.warn('Could not load player leaders.', error);
      status.textContent = 'Player leaders are temporarily unavailable.';
    });
  }
  window.addEventListener('DOMContentLoaded', installPanel);
})();
