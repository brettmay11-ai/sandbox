(() => {
  const GAMES = [
    {away:'San Francisco 49ers',home:'Los Angeles Rams',time:'8:35 PM ET',location:'Melbourne Cricket Ground • Melbourne, Australia'},
    {away:'Baltimore Ravens',home:'Dallas Cowboys',time:'4:25 PM ET',location:'Maracanã Stadium • Rio de Janeiro, Brazil'},
    {away:'Indianapolis Colts',home:'Washington Commanders',time:'9:30 AM ET',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {away:'Philadelphia Eagles',home:'Jacksonville Jaguars',time:'9:30 AM ET',location:'Tottenham Hotspur Stadium • London, U.K.'},
    {away:'Houston Texans',home:'Jacksonville Jaguars',time:'9:30 AM ET',location:'Wembley Stadium • London, U.K.'},
    {away:'Pittsburgh Steelers',home:'New Orleans Saints',time:'9:30 AM ET',location:'Stade de France • Paris, France'},
    {away:'Cincinnati Bengals',home:'Atlanta Falcons',time:'9:30 AM ET',location:'Bernabéu Stadium • Madrid, Spain'},
    {away:'New England Patriots',home:'Detroit Lions',time:'9:30 AM ET',location:'FC Bayern Munich Arena • Munich, Germany'},
    {away:'Minnesota Vikings',home:'San Francisco 49ers',time:'8:20 PM ET',location:'Estadio Banorte • Mexico City, Mexico'}
  ];

  function patchCard(card, game) {
    const rows = card.querySelectorAll(':scope > div');
    const topRow = rows[0];
    const footer = rows[2] || card.lastElementChild;
    if (topRow) {
      const spans = topRow.querySelectorAll('span');
      if (spans.length > 1) spans[spans.length - 1].textContent = game.time;
    }
    if (footer) {
      const locationSpan = [...footer.querySelectorAll('span')].find(span => {
        const text = (span.textContent || '').trim();
        return text.includes('Stadium') || text.includes('Arena') || text.includes('Field') || text.includes('Center') || text.includes('Dome') || text.includes('Mexico') || text.includes('London') || text.includes('Madrid') || text.includes('Paris') || text.includes('Melbourne') || text.includes('Rio');
      });
      if (locationSpan) locationSpan.textContent = game.location;
      if (!footer.textContent.includes('International')) {
        const badge = document.createElement('span');
        badge.className = 'ml-auto text-[9px] text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded font-semibold uppercase tracking-wider';
        badge.textContent = 'International';
        footer.appendChild(badge);
      }
      const pin = footer.querySelector('iconify-icon');
      if (pin) pin.setAttribute('icon','lucide:globe');
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

  window.addEventListener('DOMContentLoaded', () => {
    apply();
    setTimeout(apply, 400);
    setTimeout(apply, 1200);
  });
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
