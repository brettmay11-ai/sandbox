/* Touch behaviour for the student portal on iPads.
   Covers the interactions that a mouse gets for free but a finger does not:
   map tooltips (hover-only), modal scroll locking, and the hover-to-read ticker. */
(() => {
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  /* ---------- Map dots: tap to open the tooltip ----------
     The map wires its tooltip to mouseenter/mousemove/mouseleave, which a finger
     never fires reliably. Tapping a dot now opens the same tooltip, and tapping
     anywhere else on the map closes it. Also widens the hit area: the dots are
     drawn at r=4-10 in a 960-wide viewBox that renders around 768px, so they land
     near 10px across -- far under the 44px a fingertip needs. */
  const HIT_RADIUS = 14; // viewBox units, ~22px on a rendered iPad map
  let openDot = null;

  function fireMouse(el, type, x, y) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  }

  function closeMapTooltip() {
    if (!openDot) return;
    fireMouse(openDot, 'mouseleave', 0, 0);
    openDot = null;
  }

  function addHitAreas(svg) {
    svg.querySelectorAll('g[data-abbr]').forEach(g => {
      if (g.querySelector('.tap-target')) return;
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('class', 'tap-target');
      hit.setAttribute('r', HIT_RADIUS);
      hit.setAttribute('fill', 'transparent');
      g.insertBefore(hit, g.firstChild);
    });
  }

  function initMapTouch() {
    const svg = document.getElementById('map-svg');
    if (!svg || svg.dataset.touchReady) return;
    svg.dataset.touchReady = '1';

    // Dots are drawn after data loads and redrawn when the team changes.
    addHitAreas(svg);
    new MutationObserver(() => addHitAreas(svg))
      .observe(svg, { childList: true, subtree: true });

    svg.addEventListener('click', event => {
      const dot = event.target.closest('g[data-abbr]');
      if (!dot) { closeMapTooltip(); return; }
      if (dot === openDot) { closeMapTooltip(); return; }
      closeMapTooltip();
      openDot = dot;
      const box = dot.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      fireMouse(dot, 'mouseenter', x, y);
      fireMouse(dot, 'mousemove', x, y);
    });

    // Tapping off the map dismisses it too.
    document.addEventListener('click', event => {
      if (openDot && !event.target.closest('#map-svg')) closeMapTooltip();
    });
  }

  /* ---------- Modals: keep the page behind them still ----------
     An open modal on iOS still lets the page scroll underneath once the modal
     hits its end, so students lose their scroll position. */
  const MODALS = ['team-modal', 'compare-modal', 'travel-modal'];

  function syncModalLock() {
    const open = MODALS.some(id => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
    document.body.classList.toggle('modal-open', open);
  }

  function watchModals() {
    MODALS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(syncModalLock)
        .observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    syncModalLock();
  }

  /* ---------- Ticker: tap to pause and read ----------
     The ticker reveals its full text on hover, which touch never triggers, and
     the target is moving. Tapping pauses the marquee and expands that item. */
  function initTicker() {
    if (!isTouch) return;
    const ticker = document.getElementById('ticker');
    if (!ticker || ticker.dataset.touchReady) return;
    ticker.dataset.touchReady = '1';

    ticker.addEventListener('click', event => {
      const item = event.target.closest('.ticker-item');
      if (!item) return;
      const wasOpen = item.classList.contains('ticker-item-open');
      ticker.querySelectorAll('.ticker-item-open')
        .forEach(el => el.classList.remove('ticker-item-open'));
      if (wasOpen) {
        ticker.classList.remove('ticker-paused');
      } else {
        item.classList.add('ticker-item-open');
        ticker.classList.add('ticker-paused');
      }
    });

    document.addEventListener('click', event => {
      if (event.target.closest('#ticker')) return;
      ticker.classList.remove('ticker-paused');
      ticker.querySelectorAll('.ticker-item-open')
        .forEach(el => el.classList.remove('ticker-item-open'));
    });
  }

  function init() {
    initMapTouch();
    watchModals();
    initTicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // The travel map and several panels render after their data resolves.
  window.addEventListener('load', init);
  setTimeout(init, 1500);
})();
