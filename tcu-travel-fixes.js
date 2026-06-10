/* Classroom-friendly TCU travel labels and international map routes. */

const TCU_TRAVEL_ABBREVIATIONS = {
  BAYL: 'BAY',
  TXTECH: 'TTU',
  NCAR: 'UNC',
  KANST: 'KSU',
  WVIR: 'WVU',
  ARZ: 'ARIZ',
  ARZST: 'ASU',
  GRMBST: 'GRAM',
  ARKST: 'ARST'
};

function friendlyTCUOpponentAbbr(apiKey) {
  return TCU_TRAVEL_ABBREVIATIONS[apiKey] || apiKey;
}

function friendlyTCUTravelRegion(stadium) {
  if (stadium?.City === 'Dublin') return 'IRE';
  return stadium?.State || stadium?.Country || 'INTL';
}

async function getCurrentTCUTravelGames() {
  const current = Number(await fetchTCUTravelJson('scores/json/CurrentSeason'));
  for (const season of [current, current - 1]) {
    const games = await fetchTCUTravelJson(`scores/json/Games/${season}`);
    const tcuGames = games.filter(game => game.HomeTeam === 'TCU' || game.AwayTeam === 'TCU');
    if (tcuGames.length) return tcuGames;
  }
  return [];
}

function getTCUOpponentKey(game) {
  return game.AwayTeam === 'TCU' ? game.HomeTeam : game.AwayTeam;
}

function normalizeTCUTravelList(games) {
  const travelGames = games.filter(game => (game.AwayTeam === 'TCU' || game.NeutralVenue) && game.Stadium?.GeoLat && game.Stadium?.GeoLong);
  const listItems = [...document.querySelectorAll('#tcu-travel-list [data-tcu-week]')];

  listItems.forEach(item => {
    const game = travelGames.find(candidate => String(candidate.Week) === item.dataset.tcuWeek);
    if (!game) return;
    const region = friendlyTCUTravelRegion(game.Stadium);
    const details = item.querySelectorAll('div.text-white\/30');
    if (details.length > 1) {
      details[1].textContent = `${game.Stadium.City}, ${region}${game.Channel ? ` · ${game.Channel}` : ''}`;
    }
  });
}

function updateTCUMapPointLabels(games) {
  const travelGames = games.filter(game => (game.AwayTeam === 'TCU' || game.NeutralVenue) && game.Stadium?.GeoLat && game.Stadium?.GeoLong);
  const labels = [...document.querySelectorAll('#tcu-map-points text')].filter(label => /^W\d+$/.test(label.textContent));
  labels.forEach(label => {
    const week = Number(label.textContent.slice(1));
    const game = travelGames.find(candidate => Number(candidate.Week) === week);
    if (game) label.textContent = friendlyTCUOpponentAbbr(getTCUOpponentKey(game));
  });
}

function drawTCUInternationalRoute(games) {
  const game = games.find(candidate => candidate.NeutralVenue && !candidate.Stadium?.State && candidate.Stadium?.GeoLat && candidate.Stadium?.GeoLong);
  if (!game || typeof d3 === 'undefined') return;

  const svg = d3.select('#tcu-travel-map');
  if (svg.empty() || !document.getElementById('tcu-map-routes')) return;
  const projection = d3.geoAlbersUsa().scale(1070).translate([480, 300]);
  const home = projection([TCU_TRAVEL_HOME.lng, TCU_TRAVEL_HOME.lat]);
  if (!home) return;

  const destinationLng = Number(game.Stadium.GeoLong);
  const destinationLat = Number(game.Stadium.GeoLat);
  const closePoint = projection([
    TCU_TRAVEL_HOME.lng + (destinationLng - TCU_TRAVEL_HOME.lng) * 0.025,
    TCU_TRAVEL_HOME.lat + (destinationLat - TCU_TRAVEL_HOME.lat) * 0.025
  ]);
  if (!closePoint) return;

  const vx = closePoint[0] - home[0];
  const vy = closePoint[1] - home[1];
  const magnitude = Math.hypot(vx, vy);
  if (!magnitude) return;

  const routes = svg.select('#tcu-map-routes');
  routes.selectAll('[data-tcu-international-route]').remove();
  routes.append('line')
    .attr('data-tcu-international-route', 'true')
    .attr('x1', home[0]).attr('y1', home[1])
    .attr('x2', home[0] + (vx / magnitude) * 1800)
    .attr('y2', home[1] + (vy / magnitude) * 1800)
    .attr('stroke', 'rgba(139,92,246,0.8)')
    .attr('stroke-width', 2.5)
    .attr('stroke-linecap', 'round')
    .attr('stroke-dasharray', '8 6');

  const points = svg.select('#tcu-map-points');
  points.selectAll('[data-tcu-international-label]').remove();
  const edgeX = home[0] + (vx / magnitude) * 345;
  const edgeY = home[1] + (vy / magnitude) * 345;
  const marker = points.append('g').attr('data-tcu-international-label', 'true').attr('transform', `translate(${edgeX},${edgeY})`);
  marker.append('circle').attr('r', 8).attr('fill', '#4D1979').attr('stroke', '#fff').attr('stroke-width', 2.5);
  marker.append('text').attr('y', -14).attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', '8px').attr('font-weight', '800').text(friendlyTCUOpponentAbbr(getTCUOpponentKey(game)));
  marker.append('text').attr('y', 23).attr('text-anchor', 'middle').attr('fill', 'rgba(255,255,255,0.55)').attr('font-size', '8px').text('Dublin, IRE');
}

async function applyTCUTravelFixes() {
  try {
    const games = await getCurrentTCUTravelGames();
    let attempts = 0;
    const waitForMap = setInterval(() => {
      attempts += 1;
      if (document.getElementById('tcu-travel-map')) {
        clearInterval(waitForMap);
        normalizeTCUTravelList(games);
        updateTCUMapPointLabels(games);
        drawTCUInternationalRoute(games);
      } else if (attempts > 30) {
        clearInterval(waitForMap);
      }
    }, 250);
  } catch (error) {
    console.warn('TCU travel display fixes could not be applied.', error);
  }
}

applyTCUTravelFixes();
