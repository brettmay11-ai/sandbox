(() => {
  const GAMES = [
    {away:'San Francisco 49ers',home:'Los Angeles Rams',time:'7:35 PM CT',stadium:'Melbourne Cricket Ground',city:'Melbourne, Australia',location:'Melbourne Cricket Ground • Melbourne, Australia'},
    {away:'Baltimore Ravens',home:'Dallas Cowboys',time:'3:25 PM CT',stadium:'Maracanã Stadium',city:'Rio de Janeiro, Brazil',location:'Maracanã Stadium • Rio de Janeiro, Brazil'},
    {away:'Indianapolis Colts',home:'Washington Commanders',time:'8:30 AM CT',stadium:'Tottenham Hotspur Stadium',city:'London, U.K.',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {away:'Philadelphia Eagles',home:'Jacksonville Jaguars',time:'8:30 AM CT',stadium:'Tottenham Hotspur Stadium',city:'London, U.K.',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {away:'Houston Texans',home:'Jacksonville Jaguars',time:'8:30 AM CT',stadium:'Wembley Stadium',city:'London, U.K.',location:'Wembley Stadium • London, U.K.'},
    {away:'Pittsburgh Steelers',home:'New Orleans Saints',time:'8:30 AM CT',stadium:'Stade de France',city:'Paris, France',location:'Stade de France • Paris, France'},
    {away:'Cincinnati Bengals',home:'Atlanta Falcons',time:'8:30 AM CT',stadium:'Bernabéu Stadium',city:'Madrid, Spain',location:'Bernabéu Stadium • Madrid, Spain'},
    {away:'New England Patriots',home:'Detroit Lions',time:'8:30 AM CT',stadium:'FC Bayern Munich Arena',city:'Munich, Germany',location:'FC Bayern Munich Arena • Munich, Germany'},
    {away:'Minnesota Vikings',home:'San Francisco 49ers',time:'7:20 PM CT',stadium:'Estadio Banorte',city:'Mexico City, Mexico',location:'Estadio Banorte • Mexico City, Mexico'}
  ];

  const TIME_RE = /\b(?:1[0-2]|0?[1-9]):[0-5]\d\s*(?:AM|PM)(?:\s*(?:ET|CT))?\b/i;
  const LOCATION_HINT_RE = /(stadium|arena|field|center|dome|park|melbourne|rio de janeiro|london|paris|madrid|munich|mexico city)/i;

  function setTextIfChanged(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function findGame(container) {
    const text = (container?.textContent || '').replace(/\s+/g,' ');
    return GAMES.find(item => text.includes(item.away) && text.includes(item.home));
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

  function patchTeamFocus(slot, game) {
    if (!slot || !game) return;
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
      if (!stadiumPatched && LOCATION_HINT_RE.test(text) && !text.includes(game.away) && !text.includes(game.home)) {
        setTextIfChanged(node, game.stadium);
        stadiumPatched = true;
        return;
      }
      if (!cityPatched && /(,\s*[A-Z]{2}\b|,\s*(Australia|Brazil|U\.K\.|France|Spain|Germany|Mexico)\b)/i.test(text)) {
        setTextIfChanged(node, game.city);
        cityPatched = true;
      }
    });

    if (!timePatched || !stadiumPatched) {
      let meta = slot.querySelector('[data-official-international-meta]');
      if (!meta) {
        meta = document.createElement('div');
        meta.dataset.officialInternationalMeta = 'true';
        meta.className = 'mt-3 flex flex-wrap items-center gap-2 text-xs text-brand-400';
        slot.firstElementChild?.appendChild(meta);
      }
      if (meta) meta.innerHTML = `<iconify-icon icon="lucide:globe"></iconify-icon><strong>${game.time}</strong><span>•</span><span>${game.location}</span><span class="ml-1 rounded bg-brand-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">International</span>`;
    }
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
