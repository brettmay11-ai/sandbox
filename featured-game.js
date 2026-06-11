/* Teacher-selected featured game and Wikimedia stadium/city photography. */
(() => {
  const fallback='https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1920&q=80&auto=format&fit=crop';
  async function api(url){const response=await fetch(url);const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not load featured game.');return data}
  async function findLocationPhoto(home){
    const searches=[`${home.stadium} stadium`,`${home.city} ${home.state} skyline`];
    for(const search of searches){
      const url=`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=5&gsrsearch=${encodeURIComponent(search)}&prop=pageimages&piprop=original|thumbnail&pithumbsize=1800`;
      try{const data=await fetch(url).then(response=>response.json());const pages=Object.values(data.query?.pages||{});const page=pages.find(item=>item.original?.source||item.thumbnail?.source);if(page)return {url:page.original?.source||page.thumbnail.source,title:page.title,search}}catch(error){console.warn('Location photo search failed.',error)}
    }
    return {url:STADIUM_IMAGES[home.abbr]||fallback,title:home.stadium,search:'classroom fallback'};
  }
  async function installFeaturedGame(){
    if(typeof renderFeaturedGame!=='function'||typeof FEATURED_GAME==='undefined')return;
    try{
      const {featuredGame}=await api('/api/featured-game');
      if(featuredGame){Object.assign(FEATURED_GAME,featuredGame);renderFeaturedGame()}
      const home=getTeam(FEATURED_GAME.home);if(!home)return;
      const photo=await findLocationPhoto(home),image=document.getElementById('featured-bg-img');if(image)image.src=photo.url;
      const location=document.getElementById('featured-location');if(location){location.title=`Photo: ${photo.title} via Wikimedia`;location.textContent=`${home.city}, ${home.state} · Photo via Wikimedia`}
    }catch(error){console.warn('Teacher-selected featured game could not load.',error)}
  }
  installFeaturedGame();
})();
