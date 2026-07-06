/* Live NFL team leaders powered by SportsData.io.
   The existing static tables remain available whenever the API is unavailable. */

const NFL_STATS_API_KEY = 'ec29dd369c2544a980efca06d3e5b4ad';
const NFL_STATS_API = 'https://api.sportsdata.io/v3/nfl';
const liveStatsCache = new Map();
let liveStatsSeasonPromise = null;

const LIVE_LEADER_CATEGORIES = [
  { id: 'passing', label: 'Passing', icon: 'lucide:send', stat: 'PassingYards', attempts: 'PassingAttempts', detail: player => `${formatLiveStat(player.PassingCompletions)}/${formatLiveStat(player.PassingAttempts)} Cmp/Att · ${formatLiveStat(player.PassingTouchdowns)} TD` },
  { id: 'rushing', label: 'Rushing', icon: 'lucide:move-right', stat: 'RushingYards', attempts: 'RushingAttempts', detail: player => `${formatLiveStat(player.RushingAttempts)} carries · ${formatLiveStat(player.RushingTouchdowns)} TD` },
  { id: 'receiving', label: 'Receiving', icon: 'lucide:target', stat: 'ReceivingYards', attempts: 'Receptions', detail: player => `${formatLiveStat(player.Receptions)} catches · ${formatLiveStat(player.ReceivingTouchdowns)} TD` },
  { id: 'defense', label: 'Defense', icon: 'lucide:shield', stat: 'Tackles', secondaryStat: 'Sacks', detail: player => `${formatLiveStat(player.Tackles)} tackles · ${formatLiveStat(player.Sacks)} sacks · ${formatLiveStat(player.Interceptions)} INT` }
];

async function fetchStatsJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${NFL_STATS_API}/${path}${separator}key=${NFL_STATS_API_KEY}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`SportsData.io returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveLiveStatsSeason() {
  if (liveStatsSeasonPromise) return liveStatsSeasonPromise;

  liveStatsSeasonPromise = (async () => {
    const currentSeason = Number(await fetchStatsJson('scores/json/CurrentSeason'));
    const testTeams = ['KC', 'BUF'];

    for (const season of [currentSeason, currentSeason - 1]) {
      for (const team of testTeams) {
        try {
          const players = await fetchStatsJson(`stats/json/PlayerSeasonStatsByTeam/${season}/${team}`);
          if (Array.isArray(players) && players.some(player => Number(player.Played) > 0)) return season;
        } catch (error) {
          console.warn(`Stats season ${season} is unavailable.`, error);
        }
      }
    }

    return currentSeason;
  })();

  return liveStatsSeasonPromise;
}

async function fetchTeamLiveStats(teamAbbr) {
  const season = await resolveLiveStatsSeason();
  const cacheKey = `${season}-${teamAbbr}`;
  if (!liveStatsCache.has(cacheKey)) {
    liveStatsCache.set(cacheKey, fetchStatsJson(`stats/json/PlayerSeasonStatsByTeam/${season}/${teamAbbr}`));
  }
  const players = await liveStatsCache.get(cacheKey);
  return { season, players: Array.isArray(players) ? players : [] };
}

function formatLiveStat(value) {
  const number = Number(value || 0);
  if (Number.isInteger(number)) return number.toLocaleString();
  return number.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function getCategoryLeaders(players, category, count = 3) {
  return [...players]
    .filter(player => Number(player[category.stat] || 0) > 0 || Number(player[category.secondaryStat] || 0) > 0)
    .sort((a, b) => {
      const primary = Number(b[category.stat] || 0) - Number(a[category.stat] || 0);
      return primary || Number(b[category.secondaryStat] || 0) - Number(a[category.secondaryStat] || 0);
    })
    .slice(0, count);
}

function liveLeaderCard(category, players) {
  const leaders = getCategoryLeaders(players, category);
  return `<div class="glass-panel rounded-xl p-4">
    <div class="flex items-center gap-2 mb-3">
      <iconify-icon icon="${category.icon}" class="text-brand-400"></iconify-icon>
      <span class="text-[10px] font-mono text-white/50 uppercase tracking-wider">${category.label} Leaders</span>
    </div>
    <div class="space-y-2">
      ${leaders.length ? leaders.map((player, index) => `<div class="flex items-start gap-2 ${index ? 'pt-2 border-t border-white/5' : ''}">
        <span class="text-[10px] font-mono text-white/25 w-4">${index + 1}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[12px] font-semibold truncate">${player.Name || 'Player'}</span>
            <span class="text-[12px] font-bold text-brand-400 font-mono">${formatLiveStat(player[category.stat])}</span>
          </div>
          <div class="text-[9px] text-white/35">${player.Position || ''} · ${category.detail(player)}</div>
        </div>
      </div>`).join('') : '<div class="text-[11px] text-white/30 italic">No season statistics yet.</div>'}
    </div>
  </div>`;
}

function liveLeadersMarkup(teamAbbr, season, players) {
  const team = getTeam(teamAbbr);
  return `<div class="mb-6" data-live-team-leaders="${teamAbbr}">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h3 class="text-sm font-semibold text-white/75 flex items-center gap-2"><iconify-icon icon="lucide:activity" class="text-brand-400"></iconify-icon>${fullName(team)} Stat Leaders</h3>
      <span class="text-[9px] font-mono text-green-400 uppercase tracking-wider">Live API · ${season} Season</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${LIVE_LEADER_CATEGORIES.map(category => liveLeaderCard(category, players)).join('')}</div>
    <p class="text-[9px] text-white/25 mt-3">Source: SportsData.io. Figures depend on the connected API subscription and update schedule.</p>
  </div>`;
}

async function loadLiveLeadersInto(container, teamAbbr) {
  container.innerHTML = '<div class="glass-panel rounded-xl p-5 text-[11px] text-white/40 flex items-center gap-2"><iconify-icon icon="lucide:loader-2" class="animate-spin text-brand-400"></iconify-icon>Loading updated team leaders...</div>';
  try {
    const { season, players } = await fetchTeamLiveStats(teamAbbr);
    container.innerHTML = liveLeadersMarkup(teamAbbr, season, players);
  } catch (error) {
    console.warn('Live team statistics could not be loaded.', error);
    container.innerHTML = '<div class="glass-panel rounded-xl p-5 text-[11px] text-white/40">Updated statistics are temporarily unavailable. The classroom fallback data is still available below.</div>';
  }
}

function installTeamModalLiveLeaders() {
  const originalShowTeamInfoModal = window.showTeamInfoModal;
  if (typeof originalShowTeamInfoModal !== 'function') return;

  window.showTeamInfoModal = function showTeamInfoModalWithLiveStats(teamAbbr) {
    const originalResult = originalShowTeamInfoModal(teamAbbr);
    const content = document.getElementById('team-modal-content');
    const impactHeading = [...content.querySelectorAll('h3')].find(heading => heading.textContent.includes('Impact Players'));
    const oldCards = impactHeading ? impactHeading.nextElementSibling : null;
    const liveContainer = document.createElement('div');
    liveContainer.className = 'mb-6';

    if (impactHeading) impactHeading.replaceWith(liveContainer);
    if (oldCards) oldCards.remove();
    loadLiveLeadersInto(liveContainer, teamAbbr);
    return originalResult;
  };
}

async function getAssignedTeamAbbr() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) return null;
    const data = await response.json();
    const assigned = data.user?.selectedTeam;
    return NFL_TEAMS.some(team => team.abbr === assigned) ? assigned : null;
  } catch (error) {
    console.warn('Could not load assigned team for stat leaders.', error);
    return null;
  }
}

async function installPlayerPageTeamLeaders() {
  const playerTable = document.getElementById('player-table');
  if (!playerTable || document.getElementById('live-team-leader-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'live-team-leader-panel';
  panel.className = 'mb-8';
  panel.innerHTML = `<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
    <div><div class="text-[10px] font-mono text-brand-400 uppercase tracking-widest">Updated By Team</div><h3 class="text-xl font-bold mt-1">Team Stat Leaders</h3></div>
    <select id="live-leader-team-select" class="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white/80 outline-none">
      ${NFL_TEAMS.map(team => `<option value="${team.abbr}">${fullName(team)}</option>`).join('')}
    </select>
  </div><div id="live-team-leader-results"></div>`;

  const tableWrap = playerTable.closest('.glass-panel');
  tableWrap.parentElement.insertBefore(panel, tableWrap);
  const select = panel.querySelector('#live-leader-team-select');
  const results = panel.querySelector('#live-team-leader-results');
  const assignedTeam = await getAssignedTeamAbbr();
  if (assignedTeam) select.value = assignedTeam;
  select.addEventListener('change', () => loadLiveLeadersInto(results, select.value));
  loadLiveLeadersInto(results, select.value);
}

async function installLiveStatistics() {
  installTeamModalLiveLeaders();
  await installPlayerPageTeamLeaders();
}

installLiveStatistics();
