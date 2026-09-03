const RSS_CACHE_TTL_SECONDS = 24 * 60 * 60;
const RSS_FEEDS = {
  ARI:'https://www.azcardinals.com/rss/news', ATL:'https://www.atlantafalcons.com/rss/news', BAL:'https://www.baltimoreravens.com/rss/news', BUF:'https://www.buffalobills.com/rss/news',
  CAR:'https://www.panthers.com/rss/news', CHI:'https://www.chicagobears.com/rss/news', CIN:'https://www.bengals.com/rss/news', CLE:'https://www.clevelandbrowns.com/rss/news',
  DAL:'https://www.dallascowboys.com/rss/news', DEN:'https://www.denverbroncos.com/rss/news', DET:'https://www.detroitlions.com/rss/news', GB:'https://www.packers.com/rss/news',
  HOU:'https://www.houstontexans.com/rss/news', IND:'https://www.colts.com/rss/news', JAX:'https://www.jaguars.com/rss/news', KC:'https://www.chiefs.com/rss/news',
  LV:'https://www.raiders.com/rss/news', LAC:'https://www.chargers.com/rss/news', LAR:'https://www.therams.com/rss/news', MIA:'https://www.miamidolphins.com/rss/news',
  MIN:'https://www.vikings.com/rss/news', NE:'https://www.patriots.com/rss/news', NO:'https://www.neworleanssaints.com/rss/news', NYG:'https://www.giants.com/rss/news',
  NYJ:'https://www.newyorkjets.com/rss/news', PHI:'https://www.philadelphiaeagles.com/rss/news', PIT:'https://www.steelers.com/rss/news', SF:'https://www.49ers.com/rss/news',
  SEA:'https://www.seahawks.com/rss/news', TB:'https://www.buccaneers.com/rss/news', TEN:'https://www.tennesseetitans.com/rss/news', WAS:'https://www.commanders.com/rss/news'
};
const inFlightFeeds = new Map();

function validTeam(value) { const team = String(value || '').toUpperCase(); return RSS_FEEDS[team] ? team : null; }
function decodeXml(value) { return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim(); }
function stripMarkup(value) { return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function tagValue(block, tag) { const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')); return match ? decodeXml(match[1]) : ''; }
function parseFeed(xml) {
  return [...String(xml || '').matchAll(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi)].map(match => {
    const block = match[0], linkTag = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i), linkAttribute = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?\s*>/i);
    return { title:stripMarkup(tagValue(block, 'title')) || 'Team News', description:stripMarkup(tagValue(block, 'description') || tagValue(block, 'summary')).slice(0, 240), link:decodeXml(linkAttribute?.[1] || linkTag?.[1] || '#'), publishedAt:tagValue(block, 'pubDate') || tagValue(block, 'published') || tagValue(block, 'updated') || null };
  }).filter(item => item.title && item.link !== '#').slice(0, 10);
}
async function fetchRss(url) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try { const response = await fetch(url, { signal:controller.signal, headers:{ Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml' } }); if (!response.ok) throw new Error(`RSS feed returned ${response.status}`); return parseFeed(await response.text()); }
  finally { clearTimeout(timeout); }
}
async function initRssNewsCache(pool) { await pool.query(`CREATE TABLE IF NOT EXISTS nfl_rss_cache(team VARCHAR(3) PRIMARY KEY,data JSONB NOT NULL,fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL)`); }
async function cachedTeamNews(pool, team) {
  const cached = await pool.query('SELECT data,expires_at FROM nfl_rss_cache WHERE team=$1', [team]), row = cached.rows[0];
  if (row && new Date(row.expires_at).getTime() > Date.now()) return row.data;
  if (inFlightFeeds.has(team)) return inFlightFeeds.get(team);
  const refresh = (async () => {
    const latest = await pool.query('SELECT data,expires_at FROM nfl_rss_cache WHERE team=$1', [team]), latestRow = latest.rows[0];
    if (latestRow && new Date(latestRow.expires_at).getTime() > Date.now()) return latestRow.data;
    try {
      const data = await fetchRss(RSS_FEEDS[team]);
      await pool.query(`INSERT INTO nfl_rss_cache(team,data,expires_at) VALUES($1,$2,NOW()+($3 || ' seconds')::interval) ON CONFLICT(team) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [team, JSON.stringify(data), RSS_CACHE_TTL_SECONDS]);
      return data;
    } catch (error) { if (latestRow || row) return (latestRow || row).data; throw error; }
  })();
  inFlightFeeds.set(team, refresh);
  try { return await refresh; } finally { inFlightFeeds.delete(team); }
}
async function handleRssNews({ pool, req, res, path, user, sendJson }) {
  if (!path.startsWith('/api/nfl-news/')) return false;
  if (!user) return sendJson(res, 401, { error:'Please sign in.' }), true;
  if (req.method !== 'GET') return sendJson(res, 405, { error:'Method not allowed.' }), true;
  const parts = path.split('/').filter(Boolean), team = parts[1] === 'team' ? validTeam(parts[2]) : null;
  if (!team) return sendJson(res, 404, { error:'Choose a valid NFL team.' }), true;
  try { return sendJson(res, 200, await cachedTeamNews(pool, team)), true; }
  catch (error) { console.error(`NFL RSS feed failed for ${team}.`, error); return sendJson(res, 502, { error:'Team news is temporarily unavailable.' }), true; }
}
module.exports = { initRssNewsCache, handleRssNews };
