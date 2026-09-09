/* Teacher-selected featured game and Wikimedia stadium/city photography. */
(() => {
  const fallback='/assets/login-stadium.png';
  const VENUES={
    ARI:{stadium:'State Farm Stadium',city:'Glendale, Arizona'},ATL:{stadium:'Mercedes-Benz Stadium',city:'Atlanta'},BAL:{stadium:'M&T Bank Stadium',city:'Baltimore'},BUF:{stadium:'Highmark Stadium',city:'Orchard Park, New York'},
    CAR:{stadium:'Bank of America Stadium',city:'Charlotte, North Carolina'},CHI:{stadium:'Soldier Field',city:'Chicago'},CIN:{stadium:'Paycor Stadium',city:'Cincinnati'},CLE:{stadium:'Huntington Bank Field',city:'Cleveland'},
    DAL:{stadium:'AT&T Stadium',city:'Arlington, Texas'},DEN:{stadium:'Empower Field at Mile High',city:'Denver'},DET:{stadium:'Ford Field',city:'Detroit'},GB:{stadium:'Lambeau Field',city:'Green Bay, Wisconsin'},
    HOU:{stadium:'NRG Stadium',label:'Reliant Stadium',city:'Houston'},IND:{stadium:'Lucas Oil Stadium',city:'Indianapolis'},JAX:{stadium:'EverBank Stadium',city:'Jacksonville, Florida'},KC:{stadium:'Arrowhead Stadium',city:'Kansas City, Missouri'},
    LV:{stadium:'Allegiant Stadium',city:'Paradise, Nevada'},LAC:{stadium:'SoFi Stadium',city:'Inglewood, California'},LAR:{stadium:'SoFi Stadium',city:'Inglewood, California'},MIA:{stadium:'Hard Rock Stadium',city:'Miami Gardens, Florida'},
    MIN:{stadium:'U.S. Bank Stadium',city:'Minneapolis'},NE:{stadium:'Gillette Stadium',city:'Foxborough, Massachusetts'},NO:{stadium:'Caesars Superdome',city:'New Orleans'},NYG:{stadium:'MetLife Stadium',city:'East Rutherford, New Jersey'},
    NYJ:{stadium:'MetLife Stadium',city:'East Rutherford, New Jersey'},PHI:{stadium:'Lincoln Financial Field',city:'Philadelphia'},PIT:{stadium:'Acrisure Stadium',city:'Pittsburgh'},SF:{stadium:"Levi's Stadium",city:'Santa Clara, California'},
    SEA:{stadium:'Lumen Field',city:'Seattle'},TB:{stadium:'Raymond James Stadium',city:'Tampa, Florida'},TEN:{stadium:'Nissan Stadium',city:'Nashville, Tennessee'},WAS:{stadium:'Northwest Stadium',city:'Landover, Maryland'}
  };
  async function exactWikipediaPhoto(title){
    const url=`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original|thumbnail&pithumbsize=1800`;
    const data=await fetch(url,{signal:AbortSignal.timeout(5000)}).then(response=>response.json()),page=Object.values(data.query?.pages||{})[0],source=page?.original?.source||page?.thumbnail?.source;
    return source?{url:source,title:page.title}:null;
  }
  async function verifiedLocationPhoto(home,overrideVenue=null){
    const venue=overrideVenue||VENUES[home.abbr];if(!venue)return {url:fallback,title:'Football field',kind:'fallback'};
    try{const stadiumPhoto=await exactWikipediaPhoto(venue.stadium);if(stadiumPhoto)return {...stadiumPhoto,kind:'stadium',venue}}catch(error){console.warn(`Could not load verified photo for ${venue.stadium}.`,error)}
    try{const cityPhoto=await exactWikipediaPhoto(venue.city);if(cityPhoto)return {...cityPhoto,kind:'city',venue}}catch(error){console.warn(`Could not load verified photo for ${venue.city}.`,error)}
    return {url:fallback,title:'Football field',kind:'fallback',venue};
  }
  async function installFeaturedGame(){
    if(document.documentElement.dataset.portalPage!=='home')return;
    if(typeof renderFeaturedGame!=='function'||typeof FEATURED_GAME==='undefined')return;
    const image=document.getElementById('featured-bg-img');if(image){image.src=fallback;image.style.opacity='1'}
    try{
      await window.portalDataReady;
      if(!FEATURED_GAME.away||!FEATURED_GAME.home){
        const section=document.getElementById('featured');section.classList.add('featured-ready');
        document.getElementById('featured-week-badge').textContent='Featured matchup not selected';
        return;
      }
      FEATURED_GAME.bgImage=fallback;renderFeaturedGame();
      const home=getTeam(FEATURED_GAME.home);if(!home)return;
      const international=window.NFLFeeds?.season===2026?getInternationalGame(FEATURED_GAME.week,FEATURED_GAME.away,FEATURED_GAME.home):null;
      const overrideVenue=FEATURED_GAME.stadium?{stadium:FEATURED_GAME.stadium,city:[FEATURED_GAME.city,FEATURED_GAME.state,FEATURED_GAME.country].filter(Boolean).join(', ')}:international?{stadium:international.stadium,city:international.city+', '+international.country}:null;
      const photo=await verifiedLocationPhoto(home,overrideVenue),venue=photo.venue||overrideVenue||VENUES[home.abbr];
      if(image){
        image.onerror=()=>{image.onerror=null;image.src=fallback};
        image.src=photo.url;
        image.alt=photo.kind==='stadium'?`${venue?.label||venue?.stadium||home.stadium}`:`${venue?.city||`${home.city}, ${home.state}`}`;
        try{await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Photo timed out')),5000))])}catch(decodeError){image.src=fallback}
        image.style.background='';image.style.opacity='1';
      }
      const venueLabel=document.getElementById('featured-venue');if(venueLabel&&venue)venueLabel.textContent=venue.label||venue.stadium;
      const location=document.getElementById('featured-location');if(location){location.title=`Photo: ${photo.title} via Wikimedia`;location.textContent=venue?.city||`${home.city}, ${home.state}`}
    }catch(error){if(image)image.style.opacity='1';console.warn('Teacher-selected featured game could not load.',error)}
  }
  window.featuredPhotoReady=installFeaturedGame();
})();
