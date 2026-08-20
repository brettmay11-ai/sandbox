(() => {
  const TEAMS = [
    ['','No team'],['ARI','Arizona Cardinals'],['ATL','Atlanta Falcons'],['BAL','Baltimore Ravens'],['BUF','Buffalo Bills'],['CAR','Carolina Panthers'],['CHI','Chicago Bears'],['CIN','Cincinnati Bengals'],['CLE','Cleveland Browns'],['DAL','Dallas Cowboys'],['DEN','Denver Broncos'],['DET','Detroit Lions'],['GB','Green Bay Packers'],['HOU','Houston Texans'],['IND','Indianapolis Colts'],['JAX','Jacksonville Jaguars'],['KC','Kansas City Chiefs'],['LV','Las Vegas Raiders'],['LAC','Los Angeles Chargers'],['LAR','Los Angeles Rams'],['MIA','Miami Dolphins'],['MIN','Minnesota Vikings'],['NE','New England Patriots'],['NO','New Orleans Saints'],['NYG','New York Giants'],['NYJ','New York Jets'],['PHI','Philadelphia Eagles'],['PIT','Pittsburgh Steelers'],['SF','San Francisco 49ers'],['SEA','Seattle Seahawks'],['TB','Tampa Bay Buccaneers'],['TEN','Tennessee Titans'],['WAS','Washington Commanders']
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const options = selected => TEAMS.map(([code,name]) => `<option value="${code}" ${String(code)===String(selected||'')?'selected':''}>${esc(name)}</option>`).join('');

  function enhanceTeacherForm(){
    const form=document.getElementById('teacher-form');
    if(!form||document.getElementById('teacher-team'))return;
    const addButton=form.querySelector('button[type="submit"]');
    const label=document.createElement('label');
    label.innerHTML='<span class="text-sm text-white/50">NFL Team</span><select id="teacher-team" class="input mt-2">'+options('')+'</select>';
    if(addButton)form.insertBefore(label,addButton);else form.appendChild(label);
  }

  function enhanceTeacherTable(){
    const table=document.querySelector('#teachers-panel table');
    if(!table)return;
    const head=table.querySelector('thead tr');
    if(head&&!head.querySelector('[data-teacher-team-head]')){
      const th=document.createElement('th');
      th.dataset.teacherTeamHead='true';
      th.textContent='NFL Team';
      const actions=head.lastElementChild;
      head.insertBefore(th,actions);
    }
    document.querySelectorAll('#teachers-table tr').forEach(row=>{
      if(row.querySelector('[data-teacher-team-cell]'))return;
      const save=row.querySelector('[data-save-teacher]');
      if(!save)return;
      const id=save.dataset.saveTeacher;
      const teacher=window.state?.teachers?.find?.(item=>String(item.id)===String(id));
      const td=document.createElement('td');
      td.dataset.teacherTeamCell='true';
      td.innerHTML='<select class="input !py-2 min-w-[190px]" data-teacher-team="'+esc(id)+'">'+options(teacher?.selected_team||'')+'</select>';
      row.insertBefore(td,row.lastElementChild);
    });
  }

  function installSaveCapture(){
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-save-teacher]');
      if(!button)return;
      const id=button.dataset.saveTeacher;
      const select=document.querySelector(`[data-teacher-team="${CSS.escape(String(id))}"]`);
      if(!select)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const classSelect=document.querySelector(`[data-teacher-class="${CSS.escape(String(id))}"]`);
      try{
        await window.api(`/api/admin/teachers/${id}`,{method:'PATCH',body:JSON.stringify({classId:classSelect?.value||undefined,selectedTeam:select.value})});
        if(typeof window.toast==='function')window.toast('Teacher updated.');
        if(typeof window.loadAll==='function')await window.loadAll();
      }catch(error){
        if(typeof window.toast==='function')window.toast(error.message||'Could not update teacher.',true);
      }
    },true);
  }

  function installCreateCapture(){
    const form=document.getElementById('teacher-form');
    if(!form||form.dataset.teamCaptureInstalled)return;
    form.dataset.teamCaptureInstalled='true';
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const payload={
        classId:document.getElementById('teacher-class')?.value,
        username:document.getElementById('teacher-username')?.value,
        displayName:document.getElementById('teacher-name')?.value,
        pin:document.getElementById('teacher-pin')?.value,
        selectedTeam:document.getElementById('teacher-team')?.value||''
      };
      try{
        await window.api('/api/admin/teachers',{method:'POST',body:JSON.stringify(payload)});
        form.reset();
        if(typeof window.toast==='function')window.toast('Teacher added.');
        if(typeof window.loadAll==='function')await window.loadAll();
      }catch(error){
        if(typeof window.toast==='function')window.toast(error.message||'Could not add teacher.',true);
      }
    },true);
  }

  function refresh(){enhanceTeacherForm();enhanceTeacherTable();installCreateCapture();}
  window.addEventListener('DOMContentLoaded',()=>{refresh();installSaveCapture();setTimeout(refresh,300);setTimeout(refresh,1200);});
  new MutationObserver(()=>refresh()).observe(document.documentElement,{childList:true,subtree:true});
})();
