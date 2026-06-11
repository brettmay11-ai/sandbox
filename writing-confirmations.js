(() => {
  const message=document.getElementById('wl-message'),submit=document.getElementById('wl-submit'),save=document.getElementById('wl-save');
  if(!message||!submit||!save)return;
  const defaults=new Map([[submit,{html:submit.innerHTML,classes:submit.className}],[save,{html:save.innerHTML,classes:save.className}]]);
  function confirm(button,label){
    if(button.dataset.confirming==='true')return;
    button.dataset.confirming='true';button.disabled=true;
    button.className='px-5 py-3 bg-green-600 text-white text-xs font-bold';
    button.innerHTML=`<span class="inline-flex items-center gap-2"><iconify-icon icon="lucide:check"></iconify-icon>${label}</span>`;
    setTimeout(()=>{const original=defaults.get(button);button.disabled=false;button.className=original.classes;button.innerHTML=original.html;delete button.dataset.confirming},1800);
  }
  const observer=new MutationObserver(()=>{
    if(message.classList.contains('hidden'))return;
    const text=message.textContent.trim().toLowerCase();
    if(text.startsWith('submitted'))confirm(submit,'Submitted!');
    if(text.startsWith('draft saved'))confirm(save,'Draft Saved!');
  });
  observer.observe(message,{childList:true,attributes:true,subtree:true});
})();
