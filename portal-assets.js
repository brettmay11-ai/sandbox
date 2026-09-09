const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assets = Object.fromEntries(fs.readdirSync(__dirname).filter(name => /\.(js|css)$/.test(name))
  .map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex').slice(0,12)]));

function versionHtml(html) {
  if (html.includes('class="teacher-portal"')) html=html.replace('</head>','<style>html:not(.teacher-navigation-ready) main{visibility:hidden}</style></head>');
  if (!html.includes('sports-data-model.js')) html=html.replace('</head>','<script defer src="/sports-data-model.js"></script></head>');
  const bootstrap = `<script>window.PORTAL_ASSETS=${JSON.stringify(assets)};window.portalAssetUrl=function(source){var name=source.replace(/^\\//,'').split('?')[0];return '/'+name+(window.PORTAL_ASSETS[name]?'?v='+window.PORTAL_ASSETS[name]:'')};</script>`;
  return html.replace(/((?:src|href)=["'])\/?([a-z0-9_-]+\.(?:js|css))(?:\?[^"']*)?(["'])/gi,
    (match, prefix, name, quote) => assets[name] ? `${prefix}/${name}?v=${assets[name]}${quote}` : match)
    .replace('</head>', `${bootstrap}</head>`);
}
function renderStudentHtml(html) {
  const extra = ['student-portal-fixes.css','standings-integration.css','player-leaders-toggle.css'].map(name => `<link rel="stylesheet" href="/${name}">`).join('') +
    ['sports-data-model.js','portal-data.js','standings-integration.js','student-portal-fixes.js','player-leaders-toggle.js'].map(name => `<script defer src="/${name}"></script>`).join('');
  return versionHtml(html.replace('</head>', `${extra}</head>`));
}
module.exports = { versionHtml, renderStudentHtml };
