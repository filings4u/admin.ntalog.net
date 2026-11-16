(() => {
'use strict';
const cfg=window.NTA_CONFIG;if(!cfg||!window.supabase)return;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[];
const msg=(t,selector='#accountsMessage')=>{const el=$(selector);if(el)el.textContent=t;};
async function verifyAdmin(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session)throw Error('Sign in first.');
 const res=await fetch(cfg.adminFunctionUrl,{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'me'})});
 if(!res.ok)throw Error('Administrator access is required.');
}
async function load(){
 const type=$('#accountsType').value;
 $('#accountsHeading').textContent=type==='shipper'?'Shipper Accounts':'Carrier Accounts';
 try{
  await verifyAdmin();
  let query=sb.from('nta_crm_accounts').select('*').eq('account_type',type).order('company_name',{ascending:true}).limit(500);
  const q=$('#accountsSearch').value.trim().replace(/[,()%]/g,''),status=$('#accountsStatus').value;
  if(q)query=query.or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%,contact_email.ilike.%${q}%`);
  if(status)query=query.eq('status',status);
  const {data,error}=await query;if(error)throw error;records=data||[];
  $('#accountsRows').innerHTML=records.map(a=>`<tr><td><strong>${esc(a.company_name)}</strong></td><td>${esc(a.contact_name||'—')}</td><td>${esc(a.contact_email||'—')}</td><td>${esc(a.phone||'—')}</td><td><span class="status-pill">${esc(a.status)}</span></td><td><button class="btn btn-primary" data-edit-account="${esc(a.id)}">View / Edit</button></td></tr>`).join('')||'<tr><td colspan="6">No accounts found. Use Add Account to create one.</td></tr>';
  msg(`${records.length} ${type} accounts.`);
 }catch(e){msg(e.message);$('#accountsRows').innerHTML='<tr><td colspan="6">Unable to load accounts.</td></tr>'}
}
function edit(a={}){
 const form=$('#accountsForm');form.reset();
 for(const [k,v] of Object.entries(a)){const el=form.elements.namedItem(k);if(el&&typeof v==='string')el.value=v;}
 $('#accountsEditorTitle').textContent=a.id?'Edit Account':'Add Account';
 $('#accountsEditor').hidden=false;msg('','#accountsEditMessage');
 $('#accountsEditor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function open(type){
 $('#accountsType').value=type;
 document.querySelectorAll('[data-admin-panel]').forEach(b=>b.classList.remove('active'));
 document.querySelectorAll('.admin-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel==='accounts'));
 $('#accountsEditor').hidden=true;load();
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-accounts-type]');
 if(b)open(b.dataset.accountsType);
 const editBtn=e.target.closest('[data-edit-account]');
 if(editBtn){const row=records.find(x=>x.id===editBtn.dataset.editAccount);if(row)edit(row);}
});
$('#accountsNew')?.addEventListener('click',()=>edit({status:'prospect'}));
$('#accountsCancel')?.addEventListener('click',()=>{$('#accountsEditor').hidden=true});
$('#accountsType')?.addEventListener('change',load);
$('#accountsStatus')?.addEventListener('change',load);
$('#accountsSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')load()});
$('#accountsRefresh')?.addEventListener('click',load);
$('#accountsForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]');
 try{
  await verifyAdmin();button.disabled=true;msg('Saving…','#accountsEditMessage');
  const values=Object.fromEntries(new FormData(form).entries());const id=values.id;delete values.id;
  for(const k of Object.keys(values))values[k]=String(values[k]).trim()||null;
  if(!values.company_name)throw Error('A company name is required.');
  values.account_type=$('#accountsType').value;values.status=values.status||'prospect';values.updated_at=new Date().toISOString();
  const {error}=id?await sb.from('nta_crm_accounts').update(values).eq('id',id).eq('account_type',values.account_type):await sb.from('nta_crm_accounts').insert(values);
  if(error)throw error;
  $('#accountsEditor').hidden=true;await load();msg('Account saved.');
 }catch(err){msg(err.message,'#accountsEditMessage')}finally{button.disabled=false}
});
})();