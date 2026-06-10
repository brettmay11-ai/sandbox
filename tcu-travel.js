/* Dedicated TCU travel tracker using live SportsData.io schedule data. */

const TCU_TRAVEL_API_KEY = 'ec29dd369c2544a980efca06d3e5b4ad';
const TCU_TRAVEL_HOME = { name: 'Amon G. Carter Stadium', city: 'Fort Worth', state: 'TX', lat: 32.709722, lng: -97.368056 };
const TCU_OPPONENT_ABBR = { BAYL:'BAY', TXTECH:'TTU', NCAR:'UNC', KANST:'KSU', WVIR:'WVU', ARZ:'ARIZ', ARZST:'ASU', GRMBST:'GRAM', ARKST:'ARST' };

async function fetchTCUTravelJson(path) {
  const response = await fetch(`https://api.sportsdata.io/v3/cfb/${path}?key=${TCU_TRAVEL_API_KEY}`);
  if (!response.ok) throw new Error(`TCU travel API returned ${response.status}`);
  return response.json();
}

async function resolveTCUTravelSeason() {
  const current = Number(await fetchTCUTravelJson('scores/json/CurrentSeason'));
  for (const season of [current, current - 1]) {
    const games = await fetchTCUTravelJson(`scores/json/Games/${season}`);
    if (games.some(game => game.HomeTeam === 'TCU' || game.AwayTeam === 'TCU')) return { season, games };
  }
  return { season: current, games: [] };
}

function tcuTravelMiles(destination) {
  return haversine(TCU_TRAVEL_HOME.lat, TCU_TRAVEL_HOME.lng, destination.lat, destination.lng);
}

function getTCUTravelDestinations(games) {
  return games.filter(game => (game.AwayTeam === 'TCU' || game.NeutralVenue) && game.Stadium?.GeoLat && game.Stadium?.GeoLong).map(game => {
    const isAway = game.AwayTeam === 'TCU';
    const opponentKey = isAway ? game.HomeTeam : game.AwayTeam;
    const region = game.Stadium.City === 'Dublin' ? 'IRE' : (game.Stadium.State || 'INTL');
    const destination = {
      week: game.Week,
      opponent: isAway ? game.HomeTeamName : game.AwayTeamName,
      opponentKey,
      abbr: TCU_OPPONENT_ABBR[opponentKey] || opponentKey,
      stadium: game.Stadium.Name,
      city: game.Stadium.City,
      state: region,
      lat: Number(game.Stadium.GeoLat),
      lng: Number(game.Stadium.GeoLong),
      neutral: Boolean(game.NeutralVenue),
      international: !game.Stadium.State,
      channel: game.Channel || ''
    };
    return { ...destination, distance: tcuTravelMiles(destination) };
  }).sort((a, b) => Number(a.week) - Number(b.week));
}

function createTCUTravelSection(season) {
  const tcuSection = document.getElementById('TCU');
  if (!tcuSection || document.getElementById('tcu-travel-tracker')) return null;
  const tracker = document.createElement('div');
  tracker.id = 'tcu-travel-tracker';
  tracker.className = 'max-w-7xl mx-auto mt-16 pt-12 border-t border-white/6';
  tracker.innerHTML = `<div class="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-8"><div><span class="text-[10px] font-mono text-brand-400 uppercase tracking-widest mb-2 block">Distance & Geography</span><h3 class="text-3xl font-bold tracking-tight">TCU Travel Tracker</h3><p class="text-sm text-white/45 mt-2">Follow the Horned Frogs from Fort Worth to every road game.</p></div><span class="text-[10px] font-mono text-white/35">${season} Season · Live Schedule</span></div><div id="tcu-travel-summary" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"></div><div class="grid grid-cols-1 lg:grid-cols-3 gap-4"><div class="lg:col-span-2 glass-panel rounded-2xl overflow-hidden"><div class="relative w-full min-h-[420px]" id="tcu-map-wrap"><svg id="tcu-travel-map" viewBox="0 0 960 600" class="w-full h-full min-h-[420px]"><rect width="960" height="600" fill="#0a0a0a"/><g id="tcu-map-states"></g><g id="tcu-map-routes"></g><g id="tcu-map-points"></g></svg><div id="tcu-map-tooltip" class="map-tooltip"></div></div></div><div class="glass-panel rounded-2xl p-5"><h4 class="text-sm font-semibold mb-1 flex items-center gap-2"><iconify-icon icon="lucide:plane" class="text-brand-400"></iconify-icon> Road Games</h4><p class="text-[10px] text-white/30 mb-4">Distances from Fort Worth</p><div id="tcu-travel-list" class="space-y-2 max-h-[520px] overflow-y-auto pr-1"></div></div></div>`;
  tcuSection.appendChild(tracker);
  return tracker;
}

function renderTCUTravelSummary(destinations) {
  const total = destinations.reduce((sum, destination) => sum + destination.distance, 0);
  const farthest = destinations.reduce((best, destination) => destination.distance > (best?.distance || 0) ? destination : best, null);
  document.getElementById('tcu-travel-summary').innerHTML = [['Road Trips', destinations.length], ['Season Travel', `${Math.round(total).toLocaleString()} mi`], ['Average Trip', `${destinations.length ? Math.round(total / destinations.length).toLocaleString() : 0} mi`], ['Farthest Trip', farthest ? `${farthest.city}, ${farthest.state}` : '—']].map(([label,value]) => `<div class="glass-panel rounded-xl p-4"><div class="text-[9px] text-white/30 uppercase tracking-wider">${label}</div><div class="text-lg font-bold mt-1">${value}</div></div>`).join('');
  document.getElementById('tcu-travel-list').innerHTML = destinations.map(destination => `<div class="away-item p-3 rounded-lg border border-white/6"><div class="flex items-center justify-between gap-2"><span class="text-[11px] font-semibold truncate">${destination.neutral ? 'vs' : 'at'} ${destination.opponent}</span><span class="text-[11px] font-mono text-brand-400 shrink-0">${Math.round(destination.distance).toLocaleString()} mi</span></div><div class="text-[9px] text-white/30 mt-1">Week ${destination.week} · ${destination.stadium}</div><div class="text-[9px] text-white/30">${destination.city}, ${destination.state}${destination.channel ? ` · ${destination.channel}` : ''}</div></div>`).join('');
}

function drawTCUDomesticDestination(routes, points, home, target, destination, index) {
  const length = Math.hypot(target[0] - home[0], target[1] - home[1]);
  routes.append('line').attr('x1',home[0]).attr('y1',home[1]).attr('x2',target[0]).attr('y2',target[1]).attr('stroke','rgba(139,92,246,0.65)').attr('stroke-width',2).attr('stroke-linecap','round').attr('stroke-dasharray',length).attr('stroke-dashoffset',length).style('animation',`draw-line 1.2s ease ${index * .08}s forwards`);
  const point = points.append('g').attr('transform',`translate(${target[0]},${target[1]})`).style('cursor','pointer');
  point.append('circle').attr('r',7).attr('fill','#fff').attr('stroke','#4D1979').attr('stroke-width',3);
  point.append('text').attr('y',-12).attr('text-anchor','middle').attr('fill','#fff').attr('font-size','8px').attr('font-weight','700').text(destination.abbr);
  point.on('mouseenter',event=>showTCUTravelTooltip(event,destination)).on('mousemove',event=>showTCUTravelTooltip(event,destination)).on('mouseleave',()=>document.getElementById('tcu-map-tooltip').classList.remove('visible'));
}

function drawTCUInternationalDestination(routes, points, home, projection, destination) {
  const close = projection([TCU_TRAVEL_HOME.lng + (destination.lng - TCU_TRAVEL_HOME.lng) * .025, TCU_TRAVEL_HOME.lat + (destination.lat - TCU_TRAVEL_HOME.lat) * .025]);
  if (!close) return;
  const vx = close[0] - home[0], vy = close[1] - home[1], magnitude = Math.hypot(vx,vy);
  const edge = [home[0] + vx / magnitude * 345, home[1] + vy / magnitude * 345];
  routes.append('line').attr('x1',home[0]).attr('y1',home[1]).attr('x2',home[0] + vx / magnitude * 1800).attr('y2',home[1] + vy / magnitude * 1800).attr('stroke','rgba(139,92,246,0.8)').attr('stroke-width',2.5).attr('stroke-dasharray','8 6');
  const point = points.append('g').attr('transform',`translate(${edge[0]},${edge[1]})`).style('cursor','pointer');
  point.append('circle').attr('r',8).attr('fill','#4D1979').attr('stroke','#fff').attr('stroke-width',2.5);
  point.append('text').attr('y',-14).attr('text-anchor','middle').attr('fill','#fff').attr('font-size','8px').attr('font-weight','800').text(destination.abbr);
  point.append('text').attr('y',23).attr('text-anchor','middle').attr('fill','rgba(255,255,255,.55)').attr('font-size','8px').text(`${destination.city}, ${destination.state}`);
  point.on('mouseenter',event=>showTCUTravelTooltip(event,destination)).on('mousemove',event=>showTCUTravelTooltip(event,destination)).on('mouseleave',()=>document.getElementById('tcu-map-tooltip').classList.remove('visible'));
}

async function renderTCUTravelMap(destinations) {
  const us = await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
  const states = topojson.feature(us,us.objects.states), projection = d3.geoAlbersUsa().scale(1070).translate([480,300]), path = d3.geoPath().projection(projection), svg = d3.select('#tcu-travel-map');
  svg.select('#tcu-map-states').selectAll('path').data(states.features).enter().append('path').attr('class','state-path').attr('d',path);
  const home = projection([TCU_TRAVEL_HOME.lng,TCU_TRAVEL_HOME.lat]); if (!home) return;
  const routes = svg.select('#tcu-map-routes'), points = svg.select('#tcu-map-points');
  destinations.forEach((destination,index) => { const target = projection([destination.lng,destination.lat]); if (target) drawTCUDomesticDestination(routes,points,home,target,destination,index); else drawTCUInternationalDestination(routes,points,home,projection,destination); });
  const homePoint = points.append('g').attr('transform',`translate(${home[0]},${home[1]})`); homePoint.append('circle').attr('r',10).attr('fill','#4D1979').attr('stroke','#fff').attr('stroke-width',3); homePoint.append('text').attr('y',-16).attr('text-anchor','middle').attr('fill','#fff').attr('font-size','9px').attr('font-weight','800').text('TCU');
}

function showTCUTravelTooltip(event,destination) {
  const tooltip=document.getElementById('tcu-map-tooltip'), wrap=document.getElementById('tcu-map-wrap'), rect=wrap.getBoundingClientRect();
  tooltip.innerHTML=`<div class="text-xs font-bold text-brand-400">${destination.abbr}: ${destination.opponent}</div><div class="text-[10px] text-white/50 mt-1">${destination.stadium}</div><div class="text-[10px] text-white/40">${destination.city}, ${destination.state}</div><div class="text-[10px] font-mono text-brand-400 mt-2">${Math.round(destination.distance).toLocaleString()} miles from TCU</div>`;
  tooltip.style.left=`${Math.min(event.clientX-rect.left+14,rect.width-200)}px`; tooltip.style.top=`${Math.max(event.clientY-rect.top-20,10)}px`; tooltip.classList.add('visible');
}

async function initializeTCUTravel() {
  if (!document.getElementById('TCU')) return;
  try { const {season,games}=await resolveTCUTravelSeason(); const destinations=getTCUTravelDestinations(games.filter(game=>game.HomeTeam==='TCU'||game.AwayTeam==='TCU')); createTCUTravelSection(season); renderTCUTravelSummary(destinations); await renderTCUTravelMap(destinations); } catch(error) { console.warn('TCU travel tracker could not be loaded.',error); }
}

initializeTCUTravel();
