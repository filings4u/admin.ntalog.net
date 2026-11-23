(() => {
  "use strict";
  const cfg = window.NTA_CONFIG;
  if (!cfg || !window.supabase) return;
  const sb = window.NTAAdminClient; if (!sb) return;
  const $ = s => document.querySelector(s);
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rows=[];
  const message = (s,where='#factorListMessage') => {const el=$(where);if(el)el.textContent=s;};
  async function authorized(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session) throw Error('Sign in to NTA Management before accessing factoring companies.');
    const res=await fetch(cfg.adminFunctionUrl,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.publishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'me'})});
    if(!res.ok)throw Error('Administrator access is required.');
    return true;
  }
  async function load(){
    try {
      await authorized();
      let query=sb.from('nta_factoring_companies').select('id,company_name,contact_name,contact_email,phone,website,address,payment_terms,status,notes,created_at').order('company_name',{ascending:true}).limit(500);
      const q=$('#factorSearch').value.trim(),status=$('#factorStatus').value;
      if(q)query=query.or(`company_name.ilike.%${q.replace(/[,()%]/g,'')}%,contact_name.ilike.%${q.replace(/[,()%]/g,'')}%,contact_email.ilike.%${q.replace(/[,()%]/g,'')}%`);
      if(status)query=query.eq('status',status);
      const {data,error}=await query;
      if(error)throw error;
      rows=data||[];
      $('#factorRows').innerHTML=rows.map(r=>`<tr><td><strong>${esc(r.company_name)}</strong></td><td>${esc(r.contact_name||'—')}</td><td>${esc(r.contact_email||'—')}</td><td>${esc(r.phone||'—')}</td><td><span class="status-pill">${esc(r.status)}</span></td><td><button type="button" class="btn btn-primary" data-edit-factor="${esc(r.id)}">Edit</button></td></tr>`).join('')||'<tr><td colspan="6">No factoring companies found.</td></tr>';
      message(`${rows.length} factoring companies displayed.`);
    }catch(e){message(e.message);$('#factorRows').innerHTML='<tr><td colspan="6">Could not load factoring company records.</td></tr>';}
  }
  function edit(r={},opts={}){
    const form=$('#factorForm');form.reset();
    for(const [key,value] of Object.entries(r||{})){const el=form.elements.namedItem(key);if(el&&typeof value==='string')el.value=value;}
    $('#factorTitle').textContent=r?.id?'Edit Factoring Company':'Add Factoring Company';
    $('#factorEditor').hidden=false;
    message('','#factorMessage');
    window.NTAAdminNavigate?.('factoring-editor','#/factoring/'+encodeURIComponent(r.id||'new'),opts);
  }
  async function openList({skipHistory=false}={}){
    $('#factorEditor').hidden=true;
    window.NTAAdminNavigate?.('factoring','#/page/factoring',{skipHistory});
    await load();
  }
  window.NTAFactoringOpen=openList;
  window.NTAFactoringEdit=async(id,{skipHistory=false}={})=>{
    await openList({skipHistory:true});
    if(id==='new'){edit({status:'prospect'},{skipHistory});return;}
    const record=rows.find(r=>r.id===id);
    if(record)edit(record,{skipHistory});
    else message('Factoring company not found. Refresh the directory.');
  };
  document.addEventListener('click', e=>{
    const shortcut=e.target.closest('[data-crm-shortcut]');
    if(shortcut){const select=$('#crmType');select.value=shortcut.dataset.crmShortcut;document.querySelector('[data-admin-panel="crm"]')?.click();}
    const panel=e.target.closest('[data-admin-panel="factoring"]');
    if(panel)setTimeout(load,0);
    const item=e.target.closest('[data-edit-factor]');
    if(item) {const row=rows.find(r=>r.id===item.dataset.editFactor);if(row)edit(row);}
  });
  $('#factorNew')?.addEventListener('click',()=>edit({status:'prospect'}));
  $('#factorCancel')?.addEventListener('click',()=>{void openList();});
  $('#factoringBackToList')?.addEventListener('click',()=>{void openList();});
  $('#factorRefresh')?.addEventListener('click',load);
  $('#factorStatus')?.addEventListener('change',load);
  $('#factorSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')load()});
  $('#factorForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;const submit=form.querySelector('[type="submit"]');
    try{
      await authorized();submit.disabled=true;message('Saving…','#factorMessage');
      const vals=Object.fromEntries(new FormData(form).entries());
      const id=vals.id;delete vals.id;
      for(const [k,v] of Object.entries(vals))vals[k]=String(v).trim()||null;
      if(!vals.company_name)throw Error('Company name is required.');
      vals.status=vals.status||'prospect';
      vals.updated_at=new Date().toISOString();
      const {error}=id?await sb.from('nta_factoring_companies').update(vals).eq('id',id):await sb.from('nta_factoring_companies').insert(vals);
      if(error)throw error;
      await openList();message('Factoring company saved.');
    }catch(err){message(err.message,'#factorMessage')}finally{submit.disabled=false}
  });
})();