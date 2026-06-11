(() => {
  const button=document.getElementById('wl-submit'),message=document.getElementById('wl-message');
  if(!button||!message)return;
  const original=button.innerHTML;
  const observer=new MutationObserver(()=>{
    if(message.classList.contains('hidden')||!message.textContent.trim().toLowerCase().startsWith('submitted'))return;
    button.disabled=true;
    button.className='px-5 py-3 bg-green-600 text-white text-xs font-bold';
    button.innerHTML='<span class="inline-flex items-center gap-2"><iconify-icon icon="lucide:check"></iconify-icon>Submitted!</span>';
    setTimeout(()=>{button.disabled=false;button.className='px-5 py-3 bg-brand-500 hover:bg-brand-400 text-xs font-bold';button.innerHTML=original},1800);
  });
  observer.observe(message,{childList:true,attributes:true,subtree:true});
})();
