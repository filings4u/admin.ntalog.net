(() => {
'use strict';
const cfg=window.NTA_CONFIG,sb=window.NTAAdminClient;
if(!cfg||!sb)return;
const $=q=>document.querySelector(q),$$=q=>Array.from(document.querySelectorAll(q));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap=x=>String(x||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const dt=x=>x?new Date(x).toLocaleString():'—';
const localTime=x=>{if(!x)return '';const d=new Date(x);return isNaN(d.getTime())?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
let type='shipper',records=[],current=null,contacts=[],notes=[],tasks=[],quotes=[];
function msg(text,target='#accountsEditMessage',bad=false){const node=$(target);if(node){node.textContent=text;node.dataset.kind=bad?'error':'info'}}
async function verify(){
 const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sign in required.');
 const res=await fetch(cfg.adminFunctionUrl,{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'me'})});
 const body=await res.json().catch(()=>({}));if(!res.ok||body.admin?.active!==true)throw Error('Administrator permission required.');
 return session;
}
async function api(action,details={}){
 const session=await verify();
 const res=await fetch(cfg.adminFunctionUrl,{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,...details})});
 const body=await res.json().catch(()=>({}));if(!res.ok||body.error)throw Error(body.error||'Request failed');return body;
}
const go=(page,hash,opts={})=>window.NTAAdminNavigate?.(page,hash,opts);
const back=()=>{void open(type)};
function dataOf(form){
 const data={};
 for(const input of form.querySelectorAll('[name]')){
  if(input.disabled)continue;
  data[input.name]=input.type==='checkbox'?input.checked:(String(input.value||'').trim()||null);
 }
 return data;
}
function fill(form,record={}){
 form.reset();
 for(const [key,value] of Object.entries(record)){
  const input=form.elements.namedItem(key);
  if(!input||input instanceof RadioNodeList)continue;
  if(input.type==='checkbox')input.checked=!!value;
  else if(input.type==='datetime-local')input.value=localTime(value);
  else if(value!==null&&value!==undefined)input.value=String(value);
 }
}
function typeFields(){
 $$('[data-account-shipper]').forEach(el=>{el.hidden=type!=='shipper';el.querySelectorAll('input,select,textarea').forEach(i=>i.disabled=type!=='shipper')});
 $$('[data-account-carrier]').forEach(el=>{el.hidden=type!=='carrier';el.querySelectorAll('input,select,textarea').forEach(i=>i.disabled=type!=='carrier')});
}
function tab(name){
 $$('[data-account-tab]').forEach(el=>{const active=el.dataset.accountTab===name;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active))});
 $$('[data-account-content]').forEach(el=>{const active=el.dataset.accountContent===name;el.hidden=!active;el.classList.toggle('active',active)});
}
function summary(){
 const form=$('#accountsForm'),v=name=>form.elements.namedItem(name)?.value||'';
 $('#accountsSummaryStatus').textContent=cap(v('status')||'prospect');
 $('#accountsSummaryContacts').textContent=String(contacts.length);
 $('#accountsSummaryTasks').textContent=String(tasks.filter(r=>!['completed','cancelled'].includes(r.status)).length);
 $('#accountsSummaryUpdated').textContent=current?.updated_at?dt(current.updated_at):'Not saved';
 $('#accountsSideCompany').textContent=v('company_name')||'New company';
 $('#accountsSideContact').textContent=v('contact_name')||'—';
 $('#accountsSideEmail').textContent=v('contact_email')||'—';
 $('#accountsSidePhone').textContent=v('phone')||'—';
 $('#accountsSideType').textContent=cap(type);
 $('#accountsRecordStatus').textContent=current?.id?'Company record':'New company';
 $('#accountActionHint').textContent=current?.id?'Notes, tasks, and contacts are linked to this company.':'Save the company to enable linked records.';
}
async function load(){
 try{
  await verify();
  $('#accountsType').value=type;
  $('#accountsHeading').textContent=cap(type)+' CRM';
  let req=sb.from('nta_crm_accounts').select('*').eq('account_type',type).order('company_name',{ascending:true}).limit(500);
  const search=$('#accountsSearch').value.trim().replace(/[,()%]/g,''),status=$('#accountsStatus').value;
  if(search)req=req.or('company_name.ilike.%'+search+'%,contact_name.ilike.%'+search+'%,contact_email.ilike.%'+search+'%');
  if(status)req=req.eq('status',status);
  const {data,error}=await req;if(error)throw error;
  records=data||[];
  $('#accountsRows').innerHTML=records.map(r=>'<tr><td><strong>'+esc(r.company_name)+'</strong></td><td>'+esc(r.contact_name||'—')+'</td><td>'+esc(r.contact_email||'—')+'</td><td>'+esc(r.phone||'—')+'</td><td><span class="status-pill '+esc(r.status)+'">'+esc(cap(r.status))+'</span></td><td><button type="button" class="btn btn-primary" data-edit-account="'+esc(r.id)+'">Manage Company</button></td></tr>').join('')||'<tr><td colspan="6">No '+type+' companies yet. Add a company to create a record.</td></tr>';
  msg(records.length+' '+type+' company records.','#accountsMessage');
 }catch(error){msg(error.message,'#accountsMessage',true);$('#accountsRows').innerHTML='<tr><td colspan="6">Unable to load company accounts.</td></tr>'}
}
async function open(next,opts={}){
 type=next==='carrier'?'carrier':'shipper';$('#accountsType').value=type;
 $('#accountsEditor').hidden=true;
 go('accounts','#/accounts/'+type,opts);await load();
}
async function edit(record={},opts={}){
 current=record.id?record:null;contacts=[];notes=[];tasks=[];quotes=[];
 fill($('#accountsForm'),record.id?record:{status:'prospect',priority:'normal',country:'United States'});
 typeFields();
 $('#accountsEditor').hidden=false;
 $('#accountsEditorTitle').textContent=record.id?record.company_name:'New '+cap(type)+' Company';
 $('#accountsCompanySubheading').textContent='Manage company details, contacts, shipping operations and relationship activity.';
 $('#accountsBackLabel').textContent=cap(type)+' CRM';
 $('#accountsCRMTypeLabel').textContent=type.toUpperCase()+' CRM / COMPANY PROFILE';
 $('#accountAddContact').disabled=!record.id;$('#accountAddTask').disabled=!record.id;
 $('#accountNoteForm').querySelector('[type="submit"]').disabled=!record.id;
 $('#accountContactForm').hidden=true;$('#accountTaskForm').hidden=true;
 $('#accountContactsList').textContent='Save the company to manage contacts.';
 $('#accountNotesList').textContent='Save the company to record activity.';
 $('#accountTasksList').textContent='Save the company to manage tasks.';
 $('#accountQuotesList').textContent='Save the shipper to find matching quotes.';
 tab('details');msg('');summary();
 go('account-editor','#/accounts/'+type+'/'+(record.id||'new'),opts);
 if(record.id)await related();
}
window.NTAAccountsOpen=open;
window.NTAAccountsEdit=async(next,id,opts={})=>{
 type=next==='carrier'?'carrier':'shipper';$('#accountsType').value=type;
 if(id==='new'){await edit({},opts);return}
 try{await verify();const {data,error}=await sb.from('nta_crm_accounts').select('*').eq('id',id).eq('account_type',type).maybeSingle();if(error)throw error;if(!data)throw Error('Company not found');await edit(data,opts)}
 catch(error){await open(type,{skipHistory:true});msg(error.message,'#accountsMessage',true)}
};
function listContacts(){
 $('#accountContactsList').innerHTML=contacts.map(c=>'<div class="nta29-record-row"><div><strong>'+esc(c.full_name)+'</strong><small>'+esc([c.job_title,c.department].filter(Boolean).join(' · '))+'</small><p>'+esc([c.email,c.phone].filter(Boolean).join(' · '))+'</p></div><div>'+(c.is_primary?'<span class="nta29-tag">Primary</span>':'')+'<button data-company-contact="'+esc(c.id)+'" class="btn btn-ghost">Edit</button></div></div>').join('')||'<div class="nta29-record-empty">No additional contacts yet.</div>';
}
function listNotes(){
 $('#accountNotesList').innerHTML=notes.map(n=>'<div class="nta29-record-row"><div><strong>Internal note</strong><small>'+esc(dt(n.created_at))+'</small><p>'+esc(n.note)+'</p></div></div>').join('')||'<div class="nta29-record-empty">No activity yet.</div>';
}
function listTasks(){
 $('#accountTasksList').innerHTML=tasks.map(t=>'<div class="nta29-record-row"><div><strong>'+esc(t.title)+'</strong><small>'+esc(cap(t.priority))+' · '+esc(dt(t.due_at))+'</small><p>'+esc(t.description||'')+'</p></div><div><span class="nta29-tag">'+esc(cap(t.status))+'</span><button data-company-task="'+esc(t.id)+'" class="btn btn-ghost">Edit</button></div></div>').join('')||'<div class="nta29-record-empty">No tasks yet.</div>';
}
async function related(){
 if(!current?.id)return;
 const get=async(table,contact=false)=>{
  let q=sb.from(table).select('*');
  q=contact?q.eq('account_id',current.id):q.eq('entity_type',type).eq('entity_id',current.id);
  const {data,error}=await q.order('created_at',{ascending:false}).limit(200);
  if(error)throw error;return data||[];
 };
 const outcomes=await Promise.allSettled([get('nta_crm_account_contacts',true),get('nta_crm_notes'),get('nta_crm_tasks')]);
 contacts=outcomes[0].status==='fulfilled'?outcomes[0].value:[];notes=outcomes[1].status==='fulfilled'?outcomes[1].value:[];tasks=outcomes[2].status==='fulfilled'?outcomes[2].value:[];
 listContacts();listNotes();listTasks();summary();
 const issue=outcomes.find(r=>r.status==='rejected');
 if(issue)msg('Some CRM details could not load: '+issue.reason.message,'#accountsEditMessage',true);
 await loadQuotes();
}
async function loadQuotes(){
 const list=$('#accountQuotesList');
 if(type!=='shipper'){list.textContent='Quote requests are managed under shipper accounts.';return}
 if(!current?.id){list.textContent='Save the company to view related quotes.';return}
 try{
  const result=await api('crm_list',{entity_type:'quote',q:current.company_name,limit:100});
  quotes=(result.rows||[]).filter(r=>r.company_name?.trim().toLowerCase()===current.company_name.trim().toLowerCase());
  list.innerHTML=quotes.map(r=>'<button type="button" data-company-quote="'+esc(r.id)+'" class="nta29-quote-row"><strong>'+esc(r.reference_number||'Quote request')+'</strong><small>'+esc(cap(r.status))+' · '+esc(dt(r.created_at))+'</small></button>').join('')||'<div class="nta29-record-empty">No quotes matching this company name.</div>';
 }catch(error){list.textContent='Quote requests unavailable: '+error.message}
}
async function saveAccount(event){
 event.preventDefault();
 const form=$('#accountsForm'),button=form.querySelector('[type="submit"]'),top=$('#accountsSaveTop');
 if(button.disabled)return;
 const data=dataOf(form),id=data.id;delete data.id;
 if(!data.company_name){msg('Company name is required.','#accountsEditMessage',true);return}
 for(const key of ['monthly_shipments','annual_shipments']){
  if(key in data){const val=data[key];data[key]=val===null?null:Number(val);if(data[key]!==null&&(!Number.isInteger(data[key])||data[key]<0)){msg('Shipment volume must be a positive whole number.','#accountsEditMessage',true);return}}
 }
 for(const key of ['last_contacted_at','next_follow_up_at'])if(data[key])data[key]=new Date(data[key]).toISOString();
 data.account_type=type;data.status=data.status||'prospect';data.updated_at=new Date().toISOString();
 try{
  await verify();button.disabled=true;top.disabled=true;msg('Saving company…');
  const query=id?sb.from('nta_crm_accounts').update(data).eq('id',id).eq('account_type',type):sb.from('nta_crm_accounts').insert(data);
  const {data:record,error}=await query.select('*').single();if(error)throw error;
  current=record;fill(form,record);typeFields();
  $('#accountsEditorTitle').textContent=record.company_name;
  $('#accountAddContact').disabled=false;$('#accountAddTask').disabled=false;
  $('#accountNoteForm').querySelector('[type="submit"]').disabled=false;
  go('account-editor','#/accounts/'+type+'/'+record.id);
  await related();summary();msg('Company saved successfully.');
 }catch(error){msg(error.message,'#accountsEditMessage',true)}
 finally{button.disabled=false;top.disabled=false}
}
function formContact(c={}){if(!current?.id){msg('Save the company first.','#accountsEditMessage',true);return}fill($('#accountContactForm'),c);$('#accountContactForm').hidden=false;$('#accountContactFormHeading').textContent=c.id?'Edit Contact':'New Contact';msg('','#accountContactMessage')}
function formTask(t={}){if(!current?.id){msg('Save the company first.','#accountsEditMessage',true);return}fill($('#accountTaskForm'),t);$('#accountTaskForm').hidden=false;msg('','#accountTaskMessage')}
async function saveContact(event){
 event.preventDefault();if(!current?.id)return;
 const form=$('#accountContactForm'),data=dataOf(form),id=data.id;delete data.id;
 if(!data.full_name){msg('Full name is required.','#accountContactMessage',true);return}
 data.account_id=current.id;data.updated_at=new Date().toISOString();
 const button=form.querySelector('[type="submit"]');
 try{await verify();button.disabled=true;const query=id?sb.from('nta_crm_account_contacts').update(data).eq('id',id).eq('account_id',current.id):sb.from('nta_crm_account_contacts').insert(data);const {error}=await query;if(error)throw error;form.hidden=true;await related();msg('Contact saved.','#accountContactMessage')}
 catch(error){msg(error.message,'#accountContactMessage',true)}finally{button.disabled=false}
}
async function saveNote(event){
 event.preventDefault();if(!current?.id)return;
 const note=$('#accountNoteText').value.trim();if(!note)return;
 const button=$('#accountNoteForm').querySelector('[type="submit"]');
 try{await verify();button.disabled=true;const {error}=await sb.from('nta_crm_notes').insert({entity_type:type,entity_id:current.id,note});if(error)throw error;$('#accountNoteText').value='';await related();msg('Note recorded.','#accountNoteMessage')}
 catch(error){msg(error.message,'#accountNoteMessage',true)}finally{button.disabled=false}
}
async function saveTask(event){
 event.preventDefault();if(!current?.id)return;
 const form=$('#accountTaskForm'),data=dataOf(form),id=data.id;delete data.id;
 if(!data.title){msg('Task title required.','#accountTaskMessage',true);return}
 data.entity_type=type;data.entity_id=current.id;data.due_at=data.due_at?new Date(data.due_at).toISOString():null;
 data.updated_at=new Date().toISOString();data.completed_at=data.status==='completed'?new Date().toISOString():null;
 const button=form.querySelector('[type="submit"]');
 try{await verify();button.disabled=true;const query=id?sb.from('nta_crm_tasks').update(data).eq('id',id).eq('entity_id',current.id).eq('entity_type',type):sb.from('nta_crm_tasks').insert(data);const {error}=await query;if(error)throw error;form.hidden=true;await related();msg('Task saved.','#accountTaskMessage')}
 catch(error){msg(error.message,'#accountTaskMessage',true)}finally{button.disabled=false}
}
document.addEventListener('click',event=>{
 const typeButton=event.target.closest('[data-accounts-type]');if(typeButton){void open(typeButton.dataset.accountsType);return}
 const editorButton=event.target.closest('[data-edit-account]');if(editorButton){const row=records.find(x=>x.id===editorButton.dataset.editAccount);if(row)void edit(row);return}
 const tabButton=event.target.closest('[data-account-tab]');if(tabButton){tab(tabButton.dataset.accountTab);return}
 const quick=event.target.closest('[data-account-shortcut]');if(quick){tab(quick.dataset.accountShortcut);return}
 const contact=event.target.closest('[data-company-contact]');if(contact){const row=contacts.find(x=>x.id===contact.dataset.companyContact);if(row){tab('contacts');formContact(row)}return}
 const task=event.target.closest('[data-company-task]');if(task){const row=tasks.find(x=>x.id===task.dataset.companyTask);if(row){tab('tasks');formTask(row)}return}
 const quote=event.target.closest('[data-company-quote]');if(quote){go('crm-detail','#/crm/quote/'+quote.dataset.companyQuote);return}
});
$('#accountsNew')?.addEventListener('click',()=>{void edit({})});
['accountsCancel','accountsCancelBottom','accountsBackToList'].forEach(id=>$('#'+id)?.addEventListener('click',back));
$('#accountsType')?.addEventListener('change',()=>{void open($('#accountsType').value)});
$('#accountsStatus')?.addEventListener('change',()=>{void load()});
$('#accountsSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')void load()});
$('#accountsRefresh')?.addEventListener('click',()=>{void load()});
$('#accountsForm')?.addEventListener('submit',saveAccount);
$('#accountContactForm')?.addEventListener('submit',saveContact);
$('#accountNoteForm')?.addEventListener('submit',saveNote);
$('#accountTaskForm')?.addEventListener('submit',saveTask);
$('#accountAddContact')?.addEventListener('click',()=>formContact());
$('#accountAddTask')?.addEventListener('click',()=>formTask());
$('#accountContactCancel')?.addEventListener('click',()=>{$('#accountContactForm').hidden=true});
$('#accountTaskCancel')?.addEventListener('click',()=>{$('#accountTaskForm').hidden=true});
$('#accountViewQuotes')?.addEventListener('click',()=>{void loadQuotes()});
$('#accountsForm')?.addEventListener('input',summary);
})();