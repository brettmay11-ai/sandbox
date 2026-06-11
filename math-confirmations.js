(() => {
  const feedback=document.getElementById('mg-feedback'),next=document.getElementById('mg-next-play');
  if(!feedback||!next)return;
  const original={html:next.innerHTML,classes:next.className};
  let timer;
  const observer=new MutationObserver(()=>{
    if(feedback.classList.contains('hidden')||!feedback.textContent.trim()||next.dataset.confirming==='true')return;
    clearTimeout(timer);next.dataset.confirming='true';next.disabled=true;
    next.className='math-game-button px-5 py-3 bg-green-600 text-white text-xs font-bold uppercase tracking-wider transition';
    next.innerHTML='<span class="inline-flex items-center gap-2"><iconify-icon icon="lucide:check"></iconify-icon>Answer Submitted!</span>';
    timer=setTimeout(()=>{next.disabled=false;next.className=original.classes.replace('hidden','').trim();next.innerHTML=original.html;delete next.dataset.confirming},1400);
  });
  observer.observe(feedback,{childList:true,attributes:true,subtree:true});
})();
