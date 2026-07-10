(() => {
  const page = document.documentElement.dataset.portalPage;
  const supportedPages = ['teams', 'matchups', 'stats', 'players', 'travel'];
  if (!supportedPages.includes(page) || typeof NFL_TEAMS === 'undefined') return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
  const formatNumber = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits:digits,
    maximumFractionDigits:digits
  });

  let assignedTeam = null;

  function metric(category, teamAbbr, suffix = '') {
    const item = category?.data?.find(entry => entry.team === teamAbbr);
    const rank = category?.data?.findIndex(entry => entry.team === teamAbbr) + 1;
    if (!item || rank < 1) return { value:'Not ranked', note:'No season value' };
    const digits = Number.isInteger(Number(item.val)) ? 0 : 1;
    return { value:`${formatNumber(item.val, digits)}${suffix}`, note:`#${rank} in the NFL` };
  }

  function insightMarkup(item) {
    return `<div class="team-focus-insight">
      <div>
        <div class="team-focus-insight-label"><iconify-icon icon="${item.icon}"></iconify-icon>${escapeHtml(item.label)}</div>
        ${item.note ? `<div class="team-focus-insight-note">${escapeHtml(item.note)}</div>` : ''}
      </div>
      <div class="team-focus-insight-value">${escapeHtml(item.value)}</div>
    </div>`;
  }

  function actionMarkup(action, index) {
    return `<button type="button" class="team-focus-action ${index === 0 ? 'primary' : ''}" onclick="${action.onclick}"><iconify-icon icon="${action.icon}"></iconify-icon>${escapeHtml(action.label)}</button>`;
  }

  function focusCard({ eyebrow, title, subtitle, insights, actions }) {
    return `<div class="team-focus-card" style="--focus-primary:${assignedTeam.color};--focus-secondary:${assignedTeam.secColor || assignedTeam.color}">
      <div class="team-focus-brand">
        <div class="team-focus-logo">${logo(assignedTeam.abbr, 58)}</div>
        <div class="min-w-0">
          <div class="team-focus-eyebrow">${escapeHtml(eyebrow)}</div>
          <div class="team-focus-name">${escapeHtml(title)}</div>
          <div class="team-focus-subtitle">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <div class="team-focus-insights">${insights.map(insightMarkup).join('')}</div>
      <div class="team-focus-actions">${actions.map(actionMarkup).join('')}</div>
    </div>`;
  }

  function teamsFocus() {
    return focusCard({
      eyebrow:'Your Team',
      title:fullName(assignedTeam),
      subtitle:`${assignedTeam.city}, ${assignedTeam.state}`,
      insights:[
        { label:'Division', value:assignedTeam.div, note:assignedTeam.conf, icon:'lucide:shield' },
        { label:'Home Field', value:assignedTeam.stadium, note:`${formatNumber(assignedTeam.stadiumCap)} seats`, icon:'lucide:building-2' },
        { label:'Established', value:String(assignedTeam.founded), note:`${new Date().getFullYear() - assignedTeam.founded} seasons of history`, icon:'lucide:history' }
      ],
      actions:[{ label:'Open Team', icon:'lucide:arrow-up-right', onclick:`showTeamInfoModal('${assignedTeam.abbr}')` }]
    });
  }

  function matchupFocus() {
    const week = WEEKS[currentWeek];
    const game = week?.games?.find(item => item.away === assignedTeam.abbr || item.home === assignedTeam.abbr);
    if (!game) {
      return focusCard({
        eyebrow:`Your Week ${week?.week || currentWeek + 1}`,
        title:'Bye Week',
        subtitle:`${fullName(assignedTeam)} do not play this week.`,
        insights:[
          { label:'Status', value:'No game', note:'Bye week', icon:'lucide:calendar-off' },
          { label:'Home Base', value:assignedTeam.city, note:assignedTeam.stadium, icon:'lucide:map-pin-house' },
          { label:'Division', value:assignedTeam.div, note:assignedTeam.conf, icon:'lucide:shield' }
        ],
        actions:[{ label:'Team Details', icon:'lucide:arrow-up-right', onclick:`showTeamInfoModal('${assignedTeam.abbr}')` }]
      });
    }

    const isAway = game.away === assignedTeam.abbr;
    const opponent = getTeam(isAway ? game.home : game.away);
    const venue = getTeam(game.home);
    const distance = isAway ? Math.round(haversine(assignedTeam.lat, assignedTeam.lng, opponent.lat, opponent.lng)) : 0;
    const cleanDay = String(game.day || 'Game Day').replace(/'/g, '');
    return focusCard({
      eyebrow:`Your Week ${week.week} Matchup`,
      title:`${assignedTeam.name} ${isAway ? 'at' : 'vs'} ${opponent.name}`,
      subtitle:isAway ? `Road game in ${opponent.city}` : `Home game at ${assignedTeam.stadium}`,
      insights:[
        { label:'Opponent', value:fullName(opponent), note:opponent.div, icon:'lucide:swords' },
        { label:'Kickoff', value:`${game.day} ${game.time}`, note:isAway ? `${distance.toLocaleString()} miles away` : 'Home game', icon:'lucide:clock-3' },
        { label:'Venue', value:venue.stadium, note:`${venue.city}, ${venue.state}`, icon:'lucide:map-pin' }
      ],
      actions:[{ label:'Open Matchup', icon:'lucide:arrow-up-right', onclick:`showMatchupModal('${game.away}','${game.home}',${week.week},'${cleanDay}')` }]
    });
  }

  function statsFocus() {
    const scoring = metric(TEAM_STATS.offensive[0], assignedTeam.abbr, ' PPG');
    const offense = metric(TEAM_STATS.offensive[1], assignedTeam.abbr, ' YPG');
    const allowed = metric(TEAM_STATS.defensive[0], assignedTeam.abbr, ' PPG');
    return focusCard({
      eyebrow:'Your Team Snapshot',
      title:fullName(assignedTeam),
      subtitle:'Offense and defense at a glance',
      insights:[
        { label:'Scoring', value:scoring.value, note:scoring.note, icon:'lucide:zap' },
        { label:'Total Offense', value:offense.value, note:offense.note, icon:'lucide:gauge' },
        { label:'Points Allowed', value:allowed.value, note:allowed.note, icon:'lucide:shield-check' }
      ],
      actions:[
        { label:'Show My Team', icon:'lucide:filter', onclick:'showAssignedTeamStats()' },
        { label:'Show All Teams', icon:'lucide:list', onclick:'showAllTeamStats()' }
      ]
    });
  }

  function staticLeader(category, teamAbbr) {
    return PLAYER_STATS[category]?.players?.find(player => player[2] === teamAbbr) || null;
  }

  function playersFocus() {
    const passer = staticLeader('passing', assignedTeam.abbr);
    const receiver = staticLeader('receiving', assignedTeam.abbr);
    const rusher = staticLeader('rushing', assignedTeam.abbr);
    const defender = staticLeader('defense', assignedTeam.abbr);
    const playmaker = receiver || rusher;
    const playmakerYards = receiver ? receiver[5] : rusher ? rusher[4] : null;
    return focusCard({
      eyebrow:'Your Team Leaders',
      title:fullName(assignedTeam),
      subtitle:'Top performers from the current classroom data',
      insights:[
        { label:'Passing', value:passer?.[1] || 'Team update', note:passer ? `${formatNumber(passer[5])} passing yards` : 'Latest leaders below', icon:'lucide:send' },
        { label:'Playmaker', value:playmaker?.[1] || 'Team update', note:playmakerYards ? `${formatNumber(playmakerYards)} yards` : 'Latest leaders below', icon:'lucide:target' },
        { label:'Defense', value:defender?.[1] || 'Team update', note:defender ? `${formatNumber(defender[4], Number.isInteger(defender[4]) ? 0 : 1)} sacks` : 'Latest leaders below', icon:'lucide:shield' }
      ],
      actions:[{ label:'Team Leaders', icon:'lucide:arrow-down', onclick:'openAssignedTeamLeaders()' }]
    });
  }

  function travelFocus() {
    const trips = getTeamTravelDestinations(assignedTeam.abbr).map(trip => ({
      ...trip,
      distance:haversine(assignedTeam.lat, assignedTeam.lng, trip.lat, trip.lng)
    }));
    const total = trips.reduce((sum, trip) => sum + trip.distance, 0);
    const farthest = trips.reduce((best, trip) => !best || trip.distance > best.distance ? trip : best, null);
    return focusCard({
      eyebrow:'Your Team Travel',
      title:fullName(assignedTeam),
      subtitle:`Starting from ${assignedTeam.city}, ${assignedTeam.state}`,
      insights:[
        { label:'Road Games', value:String(trips.length), note:'Season travel stops', icon:'lucide:calendar-range' },
        { label:'Total Travel', value:`${formatNumber(Math.round(total))} mi`, note:'Approximate road distance', icon:'lucide:plane' },
        { label:'Longest Trip', value:farthest ? `${formatNumber(Math.round(farthest.distance))} mi` : 'No trips', note:farthest ? `${farthest.city}, ${farthest.state}` : 'Home schedule', icon:'lucide:route' }
      ],
      actions:[
        { label:'Show My Team', icon:'lucide:locate-fixed', onclick:'showAssignedTeamTravel()' },
        { label:'Season Details', icon:'lucide:arrow-down', onclick:'openTravelSeasonDetails()' }
      ]
    });
  }

  function renderFocus() {
    if (!assignedTeam) return;
    const slot = document.getElementById(`${page}-team-focus`);
    if (!slot) return;
    const renderers = { teams:teamsFocus, matchups:matchupFocus, stats:statsFocus, players:playersFocus, travel:travelFocus };
    slot.innerHTML = renderers[page]();
  }

  window.refreshDataExperience = renderFocus;
  window.showAssignedTeamStats = () => {
    const select = document.getElementById('stats-team-select');
    if (!select || !assignedTeam) return;
    select.value = assignedTeam.abbr;
    renderTeamStats();
  };
  window.showAllTeamStats = () => {
    const select = document.getElementById('stats-team-select');
    if (!select) return;
    select.value = 'all';
    renderTeamStats();
  };
  window.openAssignedTeamLeaders = () => {
    const target = document.getElementById('live-team-leader-panel') || document.getElementById('players-team-leaders');
    target?.scrollIntoView({ behavior:'smooth', block:'start' });
  };
  window.showAssignedTeamTravel = () => {
    const select = document.getElementById('travel-team-select');
    if (!select || !assignedTeam) return;
    select.value = assignedTeam.abbr;
    renderTravel();
  };
  window.openTravelSeasonDetails = () => {
    const details = document.querySelector('#travel .data-expander');
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior:'smooth', block:'start' });
  };

  async function initialize() {
    const slot = document.getElementById(`${page}-team-focus`);
    try {
      const response = await fetch('/api/me');
      if (!response.ok) throw new Error('Team assignment unavailable.');
      const data = await response.json();
      assignedTeam = NFL_TEAMS.find(team => team.abbr === data.user?.selectedTeam) || null;
      if (!assignedTeam) {
        if (slot) slot.innerHTML = '<div class="team-focus-skeleton"><span>No team is assigned yet.</span></div>';
        return;
      }
      window.assignedTeamAbbr = assignedTeam.abbr;
      if (page === 'teams') renderTeamCards();
      renderFocus();
    } catch (error) {
      if (slot) slot.innerHTML = '<div class="team-focus-skeleton"><span>Your team summary is temporarily unavailable.</span></div>';
    }
  }

  initialize();
})();
