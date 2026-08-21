(() => {
  const GAMES = [
    {week:1,awayAliases:['San Francisco 49ers','49ers','SF','San Francisco'],homeAliases:['Los Angeles Rams','Rams','LAR'],time:'7:35 PM CT',stadium:'Melbourne Cricket Ground',city:'Melbourne, Australia',location:'Melbourne Cricket Ground • Melbourne, Australia'},
    {week:3,awayAliases:['Baltimore Ravens','Ravens','BAL'],homeAliases:['Dallas Cowboys','Cowboys','DAL'],time:'3:25 PM CT',stadium:'Maracanã Stadium',city:'Rio de Janeiro, Brazil',location:'Maracanã Stadium • Rio de Janeiro, Brazil'},
    {week:4,awayAliases:['Indianapolis Colts','Colts','IND'],homeAliases:['Washington Commanders','Commanders','WAS','Washington'],time:'8:30 AM CT',stadium:'Tottenham Hotspur Stadium',city:'London, U.K.',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {week:5,awayAliases:['Philadelphia Eagles','Eagles','PHI'],homeAliases:['Jacksonville Jaguars','Jaguars','JAX','Jacksonville'],time:'8:30 AM CT',stadium:'Tottenham Hotspur Stadium',city:'London, U.K.',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {week:6,awayAliases:['Houston Texans','Texans','HOU'],homeAliases:['Jacksonville Jaguars','Jaguars','JAX','Jacksonville'],time:'8:30 AM CT',stadium:'Wembley Stadium',city:'London, U.K.',location:'Wembley Stadium • London, U.K.'},
    {week:7,awayAliases:['Pittsburgh Steelers','Steelers','PIT'],homeAliases:['New Orleans Saints','Saints','NO','New Orleans'],time:'8:30 AM CT',stadium:'Stade de France',city:'Paris, France',location:'Stade de France • Paris, France'},
    {week:9,awayAliases:['Cincinnati Bengals','Bengals','CIN'],homeAliases:['Atlanta Falcons','Falcons','ATL'],time:'8:30 AM CT',stadium:'Bernabéu Stadium',city:'Madrid, Spain',location:'Bernabéu Stadium • Madrid, Spain'},
    {week:10,awayAliases:['New England Patriots','Patriots','NE','New England'],homeAliases:['Detroit Lions','Lions','DET'],time:'8:30 AM CT',stadium:'FC Bayern Munich Arena',city:'Munich, Germany',location:'FC Bayern Munich Arena • Munich, Germany'},
    {week:11,awayAliases:['Minnesota Vikings','Vikings','MIN'],homeAliases:['San Francisco 49ers','49ers','SF','San Francisco'],time:'7:20 PM CT',stadium:'Estadio Banorte',city:'Mexico City, Mexico',location:'Estadio Banorte • Mexico City, Mexico'}
  ];

  const TIME_RE = /\b(?:1[0-2]|0?[1-9]):[0-5]\d\s*(?:AM|PM)(?:\s*(?:ET|CT))?\b/i;
  const LOCATION_HINT_RE = /(stadium|arena|field|center|dome|park|sofi|inglewood|melbourne|rio de janeiro|london|paris|madrid|munich|mexico city)/i;

  function setTextIfChanged(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function hasAlias(text, aliases) {
    const normalized = String(text || '').toLowerCase();
    return aliases.some(alias => normalized.includes(String(alias).toLowerCase()));
  }

  function currentWeek() {
    const text = document.getElementById('week-label')?.textContent || '';
    const match = text.match(/week\s*(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function findGame(container) {
    const text = (container?.textContent || '').replace(/\s+/g,' ');
    const week = currentWeek();
    return GAMES.find(item =>
      (!week || item.week === week) &&
      hasAlias(text, item.awayAliases) &&
      hasAlias(text, item.homeAliases)
    );
  }

  function patchStandardCard(card, game) {
    const rows = card.querySelectorAll(':scope > div');
    const topRow = rows[0];
    const footer = rows[2] || card.lastElementChild;
    if (topRow) {
      const spans = topRow.querySelectorAll('span');
      if (spans.length > 1) setTextIfChanged(spans[spans.length - 1], game.time);
    }
    if (footer) {
      const locationSpan = [...footer.querySelectorAll('span')].find(span => LOCATION_HINT_RE.test((span.textContent || '').trim()));
      setTextIfChanged(locationSpan, game.location);
      if (!footer.textContent.includes('International')) {
        const badge = document.createElement('span');
        badge.className = 'ml-auto text-[9px] text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded font-semibold uppercase tracking-wider';
        badge.textContent = 'International';
        footer.appendChild(badge);
      }
      const pin = footer.querySelector('iconify-icon');
      if (pin && pin.getAttribute('icon') !== 'lucide:globe') pin.setAttribute('icon','lucide:globe');
    }
    card.classList.add('border-brand-500/20');
    card.dataset.officialInternational = 'true';
  }

  function replaceFocusTextNodes(slot, game) {
    const walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(node => {
      const original = node.nodeValue || '';
      let next = original;
      if (/SoFi Stadium/i.test(next)) next = next.replace(/SoFi Stadium/gi, game.stadium);
      if (/Inglewood\s*,\s*CA/i.test(next)) next = next.replace(/Inglewood\s*,\s*CA/gi, game.city);
      else if (/\bInglewood\b/i.test(next)) next = next.replace(/\bInglewood\b/gi, game.city);
      if (TIME_RE.test(next)) next = next.replace(TIME_RE, game.time);
      if (next !== original) node.nodeValue = next;
    });
  }

  function patchTeamFocus(slot, game) {
    if (!slot || !game) return;
    replaceFocusTextNodes(slot, game);

    const existingMeta = slot.querySelector('[data-official-international-meta]');
    if (existingMeta) existingMeta.remove();

    const leaves = [...slot.querySelectorAll('*')].filter(node => node.children.length === 0);
    let timePatched = false;
    let stadiumPatched = false;
    let cityPatched = false;

    leaves.forEach(node => {
      const text = (node.textContent || '').trim();
      if (!text) return;
      if (!timePatched && TIME_RE.test(text)) {
        setTextIfChanged(node, game.time);
        timePatched = true;
        return;
      }
      if (!stadiumPatched && LOCATION_HINT_RE.test(text)) {
        setTextIfChanged(node, game.stadium);
        stadiumPatched = true;
        return;
      }
      if (!cityPatched && (/\bInglewood\b/i.test(text) || /,\s*[A-Z]{2}\b/.test(text) || /(Australia|Brazil|U\.K\.|France|Spain|Germany|Mexico)/i.test(text))) {
        setTextIfChanged(node, game.city);
        cityPatched = true;
      }
    });

    slot.dataset.officialInternational = 'true';
  }

  function apply() {
    document.querySelectorAll('#matchups .matchup-card').forEach(card => {
      const game = findGame(card);
      if (game) patchStandardCard(card, game);
    });

    const focus = document.getElementById('matchups-team-focus');
    const focusGame = findGame(focus);
    if (focusGame) patchTeamFocus(focus, focusGame);
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    apply();
    setTimeout(apply, 400);
    setTimeout(apply, 1200);
  });
  new MutationObserver(scheduleApply).observe(document.documentElement,{childList:true,subtree:true});
})();
