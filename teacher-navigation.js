(() => {
  const main = document.querySelector('main');
  const header = document.querySelector('header');
  if (!main || !header) return;

  const pages = [
    ['students', 'Students', 'users'],
    ['progress', 'Progress & Rankings', 'chart-no-axes-combined'],
    ['featured', 'Featured Game', 'star'],
    ['coach', 'Research Coach', 'graduation-cap'],
    ['writing', 'Writing Reviews', 'notebook-pen'],
    ['teks', 'TEKS Alignment', 'book-check']
  ];
  const requested = new URLSearchParams(location.search).get('page');
  const current = pages.some(([id]) => id === requested) ? requested : 'students';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const teamName = abbr => (typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(abbr)?.name : abbr) || abbr || 'Unassigned';
  const dateValue = value => value ? new Date(value).getTime() : 0;

  const nav = document.createElement('nav');
  nav.id = 'teacher-page-nav';
  nav.className = 'max-w-7xl mx-auto px-5 pt-6';
  nav.innerHTML = `<div class="flex gap-1 overflow-x-auto border-b border-white/10">${pages.map(([id, label, icon]) => `<a href="/teacher?page=${id}" data-teacher-link="${id}" class="relative shrink-0 flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 ${id === current ? 'border-blue-400 text-white bg-white/[.03]' : 'border-transparent text-white/45 hover:text-white'}"><iconify-icon icon="lucide:${icon}"></iconify-icon>${label}${id === 'writing' ? '<span data-writing-count class="hidden min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black items-center justify-center"></span>' : ''}${id === 'coach' ? '<span data-safety-count class="hidden min-w-5 h-5 px-1 rounded-full bg-amber-500 text-black text-[10px] font-black items-center justify-center"></span>' : ''}</a>`).join('')}</div>`;
  header.after(nav);

  const headingPage = text => text.includes('Featured Game of the Week') ? 'featured' : text.includes('Team Research Coach') ? 'coach' : text.includes('Student Progress and Rankings') ? 'progress' : text.includes('Writing Review Queue') ? 'writing' : null;
  function applyPages() {
    [...main.children].forEach((child, index) => {
      if (index === 0) { child.style.display = ''; return; }
      let page = child.dataset.teacherPage;
      if (!page) {
        page = headingPage(child.textContent) || ((child.querySelector('#create-form') || child.querySelector('#student-list')) ? 'students' : null);
        if (page) child.dataset.teacherPage = page;
      }
      child.style.display = page === current ? '' : 'none';
    });
    const active = pages.find(([id]) => id === current);
    document.title = `${active?.[1] || 'Teacher Dashboard'} | NFL Project`;
    const intro = main.firstElementChild;
    if (intro) {
      const title = intro.querySelector('h1');
      const copy = intro.querySelector('p:last-child');
      if (title) title.textContent = active?.[1] || 'Teacher Dashboard';
      if (copy) copy.textContent = {
        students: 'See what needs your attention today, then jump into the right classroom workflow.',
        progress: 'Review student XP, participation, and classroom rankings.',
        featured: 'Choose and publish the class Featured Game of the Week.',
        coach: 'Set the weekly research focus and review common student questions.',
        writing: 'Read student writing and return helpful feedback.',
        teks: 'Connect the Math, Writing, and Social Studies activities to Grade 4 Texas standards.'
      }[current];
    }
  }
  new MutationObserver(applyPages).observe(main, { childList: true });
  applyPages();

  const headerActions = header.lastElementChild;
  const bell = document.createElement('button');
  bell.type = 'button';
  bell.title = 'Writing submissions waiting for feedback';
  bell.className = 'relative w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 grid place-items-center';
  bell.innerHTML = '<iconify-icon icon="lucide:bell"></iconify-icon><span id="teacher-bell-count" class="hidden absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black items-center justify-center"></span>';
  bell.onclick = () => location.href = '/teacher?page=writing';
  const shield = document.createElement('button');
  shield.type = 'button';
  shield.title = 'Coach safety flags waiting for review';
  shield.className = 'relative w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 grid place-items-center';
  shield.innerHTML = '<iconify-icon icon="lucide:shield-alert"></iconify-icon><span id="teacher-safety-count" class="hidden absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-black text-[10px] font-black items-center justify-center"></span>';
  shield.onclick = () => location.href = '/teacher?page=coach';
  headerActions?.prepend(bell);
  headerActions?.prepend(shield);

  function setCard(key, value, detail, tone = '') {
    const card = document.querySelector(`[data-today-card="${key}"]`);
    if (!card) return;
    card.dataset.tone = tone;
    const strong = card.querySelector('strong');
    const span = card.querySelector('span:last-child');
    if (strong) strong.textContent = value;
    if (span) span.textContent = detail;
  }

  function renderCommandCenter(data) {
    const submissions = data.writing?.submissions || [];
    const writingCount = submissions.filter(item => item.status === 'submitted').length;
    const safetyCount = Number(data.safety?.unreadCount || 0);
    const students = data.analytics?.students || data.students?.students || [];
    const supportCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const supportCount = students.filter(student => student.active && dateValue(student.last_activity || student.last_login_at) < supportCutoff).length;
    const featured = data.featured?.featuredGame;
    const featuredLabel = featured ? `${teamName(featured.away)} at ${teamName(featured.home)}` : 'Needs setup';
    setCard('writing', writingCount, writingCount ? 'Ready for your feedback' : 'Nothing waiting right now', writingCount ? 'accent' : 'success');
    setCard('safety', safetyCount, safetyCount ? 'Review before the next class' : 'No unread reports', safetyCount ? 'alert' : 'success');
    setCard('support', supportCount, supportCount ? 'A quick check-in may help' : 'Everyone is recently active', supportCount ? 'warning' : 'success');
    setCard('featured', featured ? `Week ${featured.week || '?'}` : 'Setup', featuredLabel, featured ? 'accent' : 'warning');

    const achievements = document.getElementById('teacher-achievements');
    if (!achievements) return;
    const standouts = students.filter(student => student.active).sort((a, b) => Number(b.weekly_xp || b.total_xp || 0) - Number(a.weekly_xp || a.total_xp || 0)).slice(0, 3);
    achievements.innerHTML = standouts.length ? standouts.map((student, index) => `<div class="teacher-achievement-row"><span class="teacher-achievement-rank">0${index + 1}</span><span class="teacher-achievement-avatar">${esc(String(student.display_name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())}</span><span class="teacher-achievement-name"><strong>${esc(student.display_name)}</strong><small>${esc(teamName(student.selected_team))}</small></span><span class="teacher-achievement-score"><strong>${Number(student.weekly_xp || student.total_xp || 0).toLocaleString()} XP</strong><small>${Number(student.touchdowns || 0)} touchdowns</small></span></div>`).join('') : '<div class="teacher-achievement-empty">Student momentum will appear here after the first activity.</div>';
  }

  window.refreshTeacherNotifications = async () => {
    try {
      const responses = await Promise.all(['/api/teacher/writing', '/api/coach/safety-flags', '/api/teacher/students', '/api/teacher/analytics', '/api/featured-game'].map(url => fetch(url)));
      const [writingResponse, safetyResponse, studentsResponse, analyticsResponse, featuredResponse] = responses;
      const [writingData, safetyData, studentsData, analyticsData, featuredData] = await Promise.all(responses.map(response => response.json().catch(() => ({}))));
      const count = writingResponse.ok ? (writingData.submissions || []).filter(item => item.status === 'submitted').length : 0;
      const safety = safetyResponse.ok ? Number(safetyData.unreadCount || 0) : 0;
      const badge = document.getElementById('teacher-bell-count');
      const safetyBadge = document.getElementById('teacher-safety-count');
      document.querySelectorAll('[data-writing-count]').forEach(item => { item.textContent = count; item.classList.toggle('hidden', !count); item.classList.toggle('flex', Boolean(count)); });
      document.querySelectorAll('[data-safety-count]').forEach(item => { item.textContent = safety; item.classList.toggle('hidden', !safety); item.classList.toggle('flex', Boolean(safety)); });
      badge.textContent = count; badge.classList.toggle('hidden', !count); badge.classList.toggle('flex', Boolean(count));
      safetyBadge.textContent = safety; safetyBadge.classList.toggle('hidden', !safety); safetyBadge.classList.toggle('flex', Boolean(safety));
      bell.setAttribute('aria-label', count ? `${count} writing submissions waiting for feedback` : 'No writing submissions waiting for feedback');
      shield.setAttribute('aria-label', safety ? `${safety} coach safety flags waiting for review` : 'No coach safety flags waiting for review');
      renderCommandCenter({ writing: writingResponse.ok ? writingData : {}, safety: safetyResponse.ok ? safetyData : {}, students: studentsResponse.ok ? studentsData : {}, analytics: analyticsResponse.ok ? analyticsData : {}, featured: featuredResponse.ok ? featuredData : {} });
    } catch (error) {
      console.warn('Could not load teacher notifications.', error);
      setCard('writing', '—', 'Unable to load this queue');
      setCard('safety', '—', 'Unable to load this queue');
      setCard('support', '—', 'Unable to load class activity');
      setCard('featured', '—', 'Unable to load game setup');
    }
  };
  window.refreshTeacherNotifications();
})();
