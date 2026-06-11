/* Shared NFL team names and account-branding colors. */
window.NFL_TEAM_BRANDS = [
  ['ARI','Arizona Cardinals','#97233F','#FFB612'],['ATL','Atlanta Falcons','#A71930','#000000'],['BAL','Baltimore Ravens','#241773','#9E7C0C'],['BUF','Buffalo Bills','#00338D','#C60C30'],
  ['CAR','Carolina Panthers','#0085CA','#101820'],['CHI','Chicago Bears','#0B162A','#C83803'],['CIN','Cincinnati Bengals','#FB4F14','#000000'],['CLE','Cleveland Browns','#311D00','#FF3C00'],
  ['DAL','Dallas Cowboys','#003594','#869397'],['DEN','Denver Broncos','#FB4F14','#002244'],['DET','Detroit Lions','#0076B6','#B0B7BC'],['GB','Green Bay Packers','#203731','#FFB612'],
  ['HOU','Houston Texans','#03202F','#A71930'],['IND','Indianapolis Colts','#002C5F','#A2AAAD'],['JAX','Jacksonville Jaguars','#006778','#D7A22A'],['KC','Kansas City Chiefs','#E31837','#FFB81C'],
  ['LV','Las Vegas Raiders','#000000','#A5ACAF'],['LAC','Los Angeles Chargers','#0080C6','#FFC20E'],['LAR','Los Angeles Rams','#003594','#FFA300'],['MIA','Miami Dolphins','#008E97','#FC4C02'],
  ['MIN','Minnesota Vikings','#4F2683','#FFC62F'],['NE','New England Patriots','#002244','#C60C30'],['NO','New Orleans Saints','#D3BC8D','#101820'],['NYG','New York Giants','#0B2265','#A71930'],
  ['NYJ','New York Jets','#125740','#FFFFFF'],['PHI','Philadelphia Eagles','#004C54','#A5ACAF'],['PIT','Pittsburgh Steelers','#FFB612','#101820'],['SF','San Francisco 49ers','#AA0000','#B3995D'],
  ['SEA','Seattle Seahawks','#002244','#69BE28'],['TB','Tampa Bay Buccaneers','#D50A0A','#FF7900'],['TEN','Tennessee Titans','#0C2340','#4B92DB'],['WAS','Washington Commanders','#5A1414','#FFB612']
].map(([abbr,name,primary,secondary])=>({abbr,name,primary,secondary}));
window.getNFLTeamBrand = abbreviation => window.NFL_TEAM_BRANDS.find(team=>team.abbr===abbreviation) || null;
if(location.pathname.startsWith('/teacher')){const script=document.createElement('script');script.src='teacher-featured-game.js';document.body.appendChild(script)}
