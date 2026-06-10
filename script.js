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
    if (PORTAL_PAGES.some(page => page.id === target)) {
      link.href = portalPageUrl(target);
    }
  });
}

function buildPortalPagePicker(pageId) {
  const nav = document.querySelector('nav');
  if (!nav) return;

  const oldLinks = nav.querySelector('.hidden.lg\\:flex');
  if (oldLinks) oldLinks.style.display = 'none';

  const rightSide = nav.lastElementChild;
  if (!rightSide) return;

  const pickerWrap = document.createElement('label');
  pickerWrap.className = 'flex items-center gap-2';
  pickerWrap.innerHTML = `
    <span class="hidden sm:inline text-[10px] text-white/40 uppercase tracking-wider">Page</span>
    <select id="portal-page-picker" aria-label="Choose a page" class="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none cursor-pointer">
      ${PORTAL_PAGES.map(page => `<option value="${page.id}"${page.id === pageId ? ' selected' : ''}>${page.label}</option>`).join('')}
    </select>`;

  rightSide.prepend(pickerWrap);
  pickerWrap.querySelector('select').addEventListener('change', event => {
    window.location.href = portalPageUrl(event.target.value);
  });

  const brand = nav.firstElementChild;
  if (brand) {
    brand.setAttribute('role', 'link');
    brand.setAttribute('tabindex', '0');
    brand.setAttribute('aria-label', 'Go to home page');
    brand.style.cursor = 'pointer';
    brand.addEventListener('click', () => { window.location.href = portalPageUrl('home'); });
    brand.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') window.location.href = portalPageUrl('home');
    });
  }
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
  navigation.innerHTML = `
    ${previous ? `<a href="${portalPageUrl(previous.id)}" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 transition"><iconify-icon icon="lucide:arrow-left"></iconify-icon>${previous.label}</a>` : '<span></span>'}
    ${next ? `<a href="${portalPageUrl(next.id)}" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 transition">${next.label}<iconify-icon icon="lucide:arrow-right"></iconify-icon></a>` : '<span></span>'}`;
  footer.prepend(navigation);
}

document.addEventListener('DOMContentLoaded', () => {
  const pageId = getCurrentPortalPage();
  rewritePortalLinks();
  showCurrentPortalPage(pageId);
  buildPortalPagePicker(pageId);
  addPageFooterNavigation(pageId);
});
