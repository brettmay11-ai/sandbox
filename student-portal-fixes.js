(() => {
  function removeTcuMenuItems() {
    document.querySelectorAll('a[href*="page=tcu"],button[data-page="tcu"],button[data-nav="tcu"],[data-page="tcu"],[data-nav="tcu"]').forEach(element => element.remove());
    document.querySelectorAll('nav a,nav button,header a,header button,[role="navigation"] a,[role="navigation"] button').forEach(element => {
      if ((element.textContent || '').trim().toUpperCase() === 'TCU') element.remove();
    });
    if (document.documentElement.dataset.portalPage === 'tcu') {
      window.location.replace('/');
    }
  }
  window.addEventListener('DOMContentLoaded', removeTcuMenuItems);
  window.addEventListener('load', removeTcuMenuItems);
  new MutationObserver(removeTcuMenuItems).observe(document.documentElement, { childList:true, subtree:true });
})();
