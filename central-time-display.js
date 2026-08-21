(() => {
  const TIME_RE = /\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)(?:\s*(ET|CT))?\b/i;

  function shiftEtToCt(text, assumeEastern=false) {
    const match = String(text || '').match(TIME_RE);
    if (!match) return text;
    const zone = (match[4] || '').toUpperCase();
    if (zone === 'CT') return text;
    if (!assumeEastern && zone !== 'ET') return text;

    let hour = Number(match[1]) % 12;
    const minute = match[2];
    const meridiem = match[3].toUpperCase();
    if (meridiem === 'PM') hour += 12;
    hour = (hour + 23) % 24;
    const outMeridiem = hour >= 12 ? 'PM' : 'AM';
    let outHour = hour % 12;
    if (outHour === 0) outHour = 12;
    const replacement = `${outHour}:${minute} ${outMeridiem} CT`;
    return String(text).replace(TIME_RE, replacement);
  }

  function convertElement(element, assumeEastern=false) {
    if (!element) return false;
    const text = element.textContent || '';
    const converted = shiftEtToCt(text, assumeEastern);
    if (converted === text) return false;
    element.textContent = converted;
    return true;
  }

  function applyCentralTime() {
    convertElement(document.getElementById('featured-time'), true);

    document.querySelectorAll('#matchups .matchup-card').forEach(card => {
      const topRow = card.firstElementChild;
      const spans = topRow ? topRow.querySelectorAll('span') : [];
      if (spans.length > 1) convertElement(spans[spans.length - 1], true);
    });

    document.querySelectorAll('#international-games-list *').forEach(node => {
      if (node.children.length === 0 && /\b(?:AM|PM)\s*ET\b/i.test(node.textContent || '')) convertElement(node, false);
    });

    document.querySelectorAll('#featured, #matchups, #travel').forEach(section => {
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const current = node.nodeValue || '';
        if (!/\b(?:AM|PM)\s*ET\b/i.test(current)) return;
        const converted = shiftEtToCt(current, false);
        if (converted !== current) node.nodeValue = converted;
      });
    });
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyCentralTime();
    });
  }

  window.NFLCentralTime = { convert: shiftEtToCt, apply: applyCentralTime };
  window.addEventListener('DOMContentLoaded', () => {
    applyCentralTime();
    setTimeout(applyCentralTime, 350);
    setTimeout(applyCentralTime, 1200);
  });
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList:true, subtree:true, characterData:true });
})();
