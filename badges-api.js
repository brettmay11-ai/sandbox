const BADGES = [
  { id:'kickoff_complete', title:'Kickoff Complete', description:'Answer your first math play.', category:'Math', rarity:'Common', icon:'play-circle', accent:'#5b9bd5' },
  { id:'first_down', title:'First Down', description:'Get a math play correct.', category:'Math', rarity:'Common', icon:'move-right', accent:'#22c55e' },
  { id:'touchdown_math', title:'Math Touchdown', description:'Score your first touchdown in Road to the Super Bowl.', category:'Math', rarity:'Rare', icon:'trophy', accent:'#facc15' },
  { id:'hot_streak', title:'Hot Streak', description:'Build a 3-answer math streak.', category:'Math', rarity:'Rare', icon:'flame', accent:'#fb923c' },
  { id:'starter_level', title:'Starter Level', description:'Reach Starter level with 250 math XP.', category:'Math', rarity:'Common', icon:'badge-check', accent:'#38bdf8' },
  { id:'captain_level', title:'Team Captain', description:'Reach Captain level with 750 math XP.', category:'Math', rarity:'Epic', icon:'shield', accent:'#a78bfa' },
  { id:'all_pro_accuracy', title:'All-Pro Accuracy', description:'Answer 10 or more math questions with at least 80% accuracy.', category:'Math', rarity:'Epic', icon:'target', accent:'#f472b6' },
  { id:'press_pass', title:'Press Pass', description:'Submit your first writing assignment.', category:'Writing', rarity:'Common', icon:'newspaper', accent:'#34d399' },
  { id:'postgame_reporter', title:'Postgame Reporter', description:'Submit a postgame report.', category:'Writing', rarity:'Rare', icon:'mic-2', accent:'#60a5fa' },
  { id:'prediction_pro', title:'Prediction Pro', description:'Submit a prediction using evidence.', category:'Writing', rarity:'Rare', icon:'chart-no-axes-combined', accent:'#f97316' },
  { id:'season_journalist', title:'Season Journalist', description:'Submit a season journal entry.', category:'Writing', rarity:'Rare', icon:'book-open', accent:'#c084fc' },
  { id:'evidence_expert', title:'Evidence Expert', description:'Submit all three writing activities.', category:'Writing', rarity:'Epic', icon:'search-check', accent:'#2dd4bf' },
  { id:'city_scout', title:'City Scout', description:'Complete your first City Scout activity.', category:'Social Studies', rarity:'Common', icon:'map-pin', accent:'#fbbf24' },
  { id:'capital_champ', title:'Capital Champ', description:'Complete the capital challenge.', category:'Social Studies', rarity:'Common', icon:'landmark', accent:'#fde047' },
  { id:'region_ranger', title:'Region Ranger', description:'Complete the region challenge.', category:'Social Studies', rarity:'Common', icon:'compass', accent:'#84cc16' },
  { id:'city_comparer', title:'City Comparer', description:'Submit a comparison of two NFL places.', category:'Social Studies', rarity:'Rare', icon:'git-compare', accent:'#38bdf8' },
  { id:'civic_all_star', title:'Civic All-Star', description:'Complete all four City Scout activities.', category:'Social Studies', rarity:'Epic', icon:'map', accent:'#fb7185' },
  { id:'coach_challenger', title:'Coach Challenger', description:'Answer a Team Research Coach challenge correctly.', category:'Coach', rarity:'Rare', icon:'graduation-cap', accent:'#818cf8' }
];

const BADGE_MAP = new Map(BADGES.map(badge => [badge.id, badge]));

async function initBadges(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS student_badges(
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id VARCHAR(48) NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY(user_id,badge_id)
  );
  CREATE INDEX IF NOT EXISTS student_badges_earned_idx ON student_badges(user_id,earned_at DESC);`);
}

function publicBadge(definition, earnedAt = null) {
  return { ...definition, earned:Boolean(earnedAt), earnedAt:earnedAt || null };
}

async function awardBadges(pool, userId, badgeIds, context = {}) {
  const ids = [...new Set(badgeIds)].filter(id => BADGE_MAP.has(id));
  const awarded = [];
  for (const id of ids) {
    const result = await pool.query(
      'INSERT INTO student_badges(user_id,badge_id,trigger_context) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING badge_id,earned_at',
      [userId, id, context]
    );
    if (result.rowCount) awarded.push(publicBadge(BADGE_MAP.get(id), result.rows[0].earned_at));
  }
  return awarded;
}

async function badgeProfile(pool, userId) {
  const result = await pool.query('SELECT badge_id,earned_at FROM student_badges WHERE user_id=$1 ORDER BY earned_at DESC', [userId]);
  const earnedMap = new Map(result.rows.map(row => [row.badge_id, row.earned_at]));
  const badges = BADGES.map(badge => publicBadge(badge, earnedMap.get(badge.id)));
  const earned = badges.filter(badge => badge.earned).sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));
  const categories = [...new Set(BADGES.map(badge => badge.category))].map(category => {
    const categoryBadges = badges.filter(badge => badge.category === category);
    return { category, earned:categoryBadges.filter(badge => badge.earned).length, total:categoryBadges.length };
  });
  return { badges, earned, earnedCount:earned.length, total:BADGES.length, categories };
}

async function awardMathBadges(pool, userId, profile, context = {}) {
  const answered = Number(profile.questions_answered || 0);
  const correct = Number(profile.correct_answers || 0);
  const totalXp = Number(profile.total_xp || 0);
  const accuracy = answered ? Math.round(correct / answered * 100) : 0;
  const ids = [];
  if (answered >= 1) ids.push('kickoff_complete');
  if (correct >= 1) ids.push('first_down');
  if (Number(profile.touchdowns || 0) >= 1) ids.push('touchdown_math');
  if (Number(profile.best_streak || 0) >= 3) ids.push('hot_streak');
  if (totalXp >= 250) ids.push('starter_level');
  if (totalXp >= 750) ids.push('captain_level');
  if (answered >= 10 && accuracy >= 80) ids.push('all_pro_accuracy');
  return awardBadges(pool, userId, ids, { source:'math', ...context });
}

async function awardWritingBadges(pool, userId, { activity, profile }, context = {}) {
  const ids = [];
  if (Number(profile.submissions || 0) >= 1) ids.push('press_pass');
  if (activity === 'postgame') ids.push('postgame_reporter');
  if (activity === 'prediction') ids.push('prediction_pro');
  if (activity === 'journal') ids.push('season_journalist');
  if (Number(profile.submissions || 0) >= 3) ids.push('evidence_expert');
  return awardBadges(pool, userId, ids, { source:'writing', activity, ...context });
}

async function awardSocialBadges(pool, userId, { activity, profile }, context = {}) {
  const ids = [];
  if (Number(profile.completed || 0) >= 1) ids.push('city_scout');
  if (activity === 'capital') ids.push('capital_champ');
  if (activity === 'region') ids.push('region_ranger');
  if (activity === 'compare') ids.push('city_comparer');
  if (Number(profile.completed || 0) >= 4) ids.push('civic_all_star');
  return awardBadges(pool, userId, ids, { source:'social-studies', activity, ...context });
}

async function awardCoachBadges(pool, userId, { correct }, context = {}) {
  return correct ? awardBadges(pool, userId, ['coach_challenger'], { source:'coach', ...context }) : [];
}

async function handleBadges({ pool, req, res, path, user, sendJson }) {
  if (!path.startsWith('/api/badges/')) return false;
  if (!user) { sendJson(res, 401, { error:'Please sign in.' }); return true; }
  if (path === '/api/badges/profile' && req.method === 'GET') { sendJson(res, 200, await badgeProfile(pool, user.id)); return true; }
  if (path === '/api/badges/definitions' && req.method === 'GET') { sendJson(res, 200, { badges:BADGES }); return true; }
  sendJson(res, 404, { error:'Badge endpoint not found.' });
  return true;
}

module.exports = { initBadges, handleBadges, badgeProfile, awardBadges, awardMathBadges, awardWritingBadges, awardSocialBadges, awardCoachBadges };
