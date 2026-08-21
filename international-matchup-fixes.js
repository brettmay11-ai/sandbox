(() => {
  const GAMES = [
    {away:'San Francisco 49ers',home:'Los Angeles Rams',time:'7:35 PM CT',location:'Melbourne Cricket Ground • Melbourne, Australia'},
    {away:'Baltimore Ravens',home:'Dallas Cowboys',time:'3:25 PM CT',location:'Maracanã Stadium • Rio de Janeiro, Brazil'},
    {away:'Indianapolis Colts',home:'Washington Commanders',time:'8:30 AM CT',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {away:'Philadelphia Eagles',home:'Jacksonville Jaguars',time:'8:30 AM CT',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {away:'Houston Texans',home:'Jacksonville Jaguars',time:'8:30 AM CT',location:'Wembley Stadium • London, U.K.'},
    {away:'Pittsburgh Steelers',home:'New Orleans Saints',time:'8:30 AM CT',location:'Stade de France • Paris, France'},
    {away:'Cincinnati Bengals',home:'Atlanta Falcons',time:'8:30 AM CT',location:'Bernabéu Stadium • Madrid, Spain'},
    {away:'New England Patriots',home:'Detroit Lions',time:'8:30 AM CT',location:'FC Bayern Munich Arena • Munich, Germany'},
    {away:'Minnesota Vikings',home:'San Francisco 49ers',time:'7:20 PM CT',location:'Estadio Banorte • Mexico City, Mexico'}
  ];

  function setTextIfChanged(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function patchCard(card, game) {
    const rows = card.querySelectorAll(':scope > div');
    const topRow = rows[0];
    const footer = rows[2] || card.lastElementChild;
    if (topRow) {
      const spans = topRow.querySelectorAll('span');
      if (spans.length > 1) setTextIfChanged(spans[spans.length - 1], game.time);
    }
    if (footer) {
      const locationSpan = [...footer.querySelectorAll('span')].find(span => {
        const text = (span.textContent || '').trim();
        return text.includes('Stadium') || text.includes('Arena') || text.includes('Field') || text.includes('Center') || text.includes('Dome') || text.includes('Mexico') || text.includes('London') || text.includes('Madrid') || text.includes('Paris') || text.includes('Melbourne') || text.includes('Rio');
      });
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

  function apply() {
    document.querySelectorAll('#matchups .matchup-card').forEach(card => {
      const text = (card.textContent || '').replace(/\s+/g,' ');
      const game = GAMES.find(item => text.includes(item.away) && text.includes(item.home));
      if (game) patchCard(card, game);
    });
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
