/* Page navigation for the NFL classroom portal.
   Each page keeps the shared data engine in index.html, but only shows the
   selected classroom section. This avoids duplicating data across many files. */

const PORTAL_PAGES = [
  { id: 'home', label: 'Home' },
  { id: 'teams', label: 'Teams' },
  { id: 'matchups', label: 'Matchups' },
  { id: 'stats', label: 'Team Stats' },
  { id: 'players', label: 'Player Stats' },
  { id: 'travel', label: 'Travel' },
  { id: 'math', label: 'Math Lab' },
  { id: 'writing', label: 'Writing' },
  { id: 'cities', label: 'Cities & States' },
  { id: 'facts', label: 'Fun Facts' },
  { id: 'tcu', label: 'TCU' }
];

function portalPageUrl(pageId) {
  return pageId === 'home' ? 'index.html' : `index.html?page=${pageId}`;
}

function getCurrentPortalPage() {
  const requested = new URLSearchParams(window.location.search).get('page');
  return PORTAL_PAGES.some(page => page.id === requested) ? requested : 'home';
}

function showCurrentPortalPage(pageId) {
  const pageSections = [...document.querySelectorAll('body > section')];
  pageSections.forEach(section => {
    const sectionId = section.id ? section.id.toLowerCase() : 'home';
    const showOnHome = pageId === 'home' && (!section.id || section.id === 'featured');
    const showSelected = sectionId === pageId;
    section.style.display = showOnHome || showSelected ? '' : 'none';
    if (showOnHome || showSelected) section.classList.add('visible');
  });
  const current = PORTAL_PAGES.find(page => page.id === pageId);
  document.title = `${current.label} | NFL Project Student Portal`;
}

function rewritePortalLinks() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    const target = link.getAttribute('href').slice(1).toLowerCase();
    if (PORTAL_PAGES.some(page => page.id === target)) link.href = portalPageUrl(target);
  });
}

function buildPortalTopNavigation(pageId) {
  const nav = document.querySelector('nav');
  if (!nav) return;
  const brand = nav.firstElementChild;
  const rightSide = nav.lastElementChild;
  if (!brand || !rightSide) return;
  const oldLinks = rightSide.firstElementChild;
  if (oldLinks) oldLinks.style.display = 'none';
  nav.classList.add('gap-3');
  brand.classList.add('shrink-0');
  rightSide.classList.add('flex-1', 'min-w-0', 'justify-end');
  const menu = document.createElement('div');
  menu.className = 'flex-1 min-w-0 overflow-x-auto';
  menu.setAttribute('aria-label', 'Main pages');
  menu.style.scrollbarWidth = 'none';
  menu.innerHTML = `<div class="flex items-center justify-start lg:justify-end gap-1 min-w-max px-1">${PORTAL_PAGES.map(page => {
    const active = page.id === pageId;
    return `<a href="${portalPageUrl(page.id)}"${active ? ' aria-current="page"' : ''} class="whitespace-nowrap px-3 py-2 rounded-lg text-[11px] font-medium transition ${active ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-white/55 border border-transparent hover:text-white hover:bg-white/5'}">${page.label}</a>`;
  }).join('')}</div>`;
  rightSide.prepend(menu);
  const activeLink = menu.querySelector('[aria-current="page"]');
  if (activeLink) activeLink.scrollIntoView({ block: 'nearest', inline: 'center' });
  brand.setAttribute('role', 'link');
  brand.setAttribute('tabindex', '0');
  brand.setAttribute('aria-label', 'Go to home page');
  brand.style.cursor = 'pointer';
  brand.addEventListener('click', () => { window.location.href = portalPageUrl('home'); });
  brand.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') window.location.href = portalPageUrl('home');
  });
}

function addPageFooterNavigation(pageId) {
  const footer = document.querySelector('footer');
  if (!footer) return;
  const currentIndex = PORTAL_PAGES.findIndex(page => page.id === pageId);
  const previous = PORTAL_PAGES[currentIndex - 1];
  const next = PORTAL_PAGES[currentIndex + 1];
  const navigation = document.createElement('div');
  navigation.className = 'max-w-6xl mx-auto mb-8 flex items-center justify-between gap-4';
  navigation.setAttribute('aria-label', 'Page navigation');
  navigation.innerHTML = `${previous ? `<a href="${portalPageUrl(previous.id)}" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 transition"><iconify-icon icon="lucide:arrow-left"></iconify-icon>${previous.label}</a>` : '<span></span>'}${next ? `<a href="${portalPageUrl(next.id)}" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 transition">${next.label}<iconify-icon icon="lucide:arrow-right"></iconify-icon></a>` : '<span></span>'}`;
  footer.prepend(navigation);
}

function loadPortalEnhancement(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const pageId = getCurrentPortalPage();
  rewritePortalLinks();
  showCurrentPortalPage(pageId);
  buildPortalTopNavigation(pageId);
  addPageFooterNavigation(pageId);
  setTimeout(async () => {
    loadPortalEnhancement('live-stats.js');
    loadPortalEnhancement('tcu-live.js');
    try {
      await loadPortalEnhancement('tcu-travel.js');
      await loadPortalEnhancement('tcu-travel-fixes.js');
    } catch (error) {
      console.warn('A TCU travel enhancement could not be loaded.', error);
    }
  }, 0);
});
