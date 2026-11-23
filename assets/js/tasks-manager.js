(()=>{'use strict';
const cfg=window.NTA_CONFIG||{},client=window.NTAAdminClient;
if(!client)return;
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap=v=>String(v||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const fmt=v=>v?new Date(v).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not set';
const local=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const state={rows:[],current:null,records:[],staff:[],loading:false,nonce:0};
async function api(action,payload={}){
 const {data,error}=await client.auth.getSession();if(error||!data?.session)throw Error('Please sign in again.');
 const res=await fetch(cfg.adminFunctionUrl,{method:'POST',
 headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,Authorization:'Bearer '+data.session.access_token},
 body:JSON.stringify({action,...payload})});
 const body=await res.json().catch(()=>({}));
 if(!res.ok||body.error)throw Error(body.error||'Unable to complete request');
 return body;
}
function err(message=''){$('#tasksError').textContent=message;$('#tasksError').hidden=!message}
function showEditorMessage(message='',isError=false){const n=$('#taskEditorMessage');n.textContent=message;n.dataset.error=String(isError)}
const active=()=>document.querySelector('.admin-panel.active')?.dataset.panel;
function navigate(page,route,opts={}){window.NTAAdminNavigate?.(page,route,opts)}
function dueFilter(row,filter){
 const date=row.due_at?new Date(row.due_at):null,now=new Date();
 if(filter==='no_date')return !date;
 if(!date)return false;
 const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
 const tomorrow=todayStart+86400000;
 if(filter==='overdue')return date.getTime()<now.getTime()&&!['completed','cancelled'].includes(row.status);
 if(filter==='today')return date.getTime()>=todayStart&&date.getTime()<tomorrow;
 if(filter==='week')return date.getTime()>=todayStart&&date.getTime()<todayStart+7*86400000;
 return true;
}
function render(){
 const rows=state.rows,now=Date.now();
 const count=(id,n)=>{$(id).textContent=String(n)};
 count('#tasksCountAll',rows.length);
 count('#tasksCountOpen',rows.filter(x=>x.status==='open').length);
 count('#tasksCountProgress',rows.filter(x=>x.status==='in_progress').length);
 count('#tasksCountOverdue',rows.filter(x=>x.due_at&&new Date(x.due_at).getTime()<now&&!['completed','cancelled'].includes(x.status)).length);
 count('#tasksCountCompleted',rows.filter(x=>x.status==='completed').length);
 const search=$('#tasksSearch').value.trim().toLowerCase(),status=$('#tasksFilterStatus').value;
 const priority=$('#tasksFilterPriority').value,due=$('#tasksFilterDue').value;
 const filtered=rows.filter(x=>(!status||x.status===status)&&(!priority||x.priority===priority)&&(!due||dueFilter(x,due))&&(!search||[
 x.title,x.description,x.entity_type,x.entity_id,state.records.find(r=>r.id===x.entity_id)?.label].some(v=>String(v||'').toLowerCase().includes(search))));
 $('#tasksResultCount').textContent=filtered.length+' of '+rows.length+' tasks';
 $('#tasksBody').innerHTML=filtered.map(x=>{
  const link=state.records.find(r=>r.id===x.entity_id);
  const label=x.entity_type==='general'?'Standalone task':(link?.label||cap(x.entity_type)+' record');
  return '<tr><td><strong>'+esc(x.title)+'</strong><small>'+esc(x.description||'')+'</small></td>'+
  '<td><strong>'+esc(label)+'</strong><small>'+esc(x.entity_type==='general'?'Internal':cap(x.entity_type))+'</small></td>'+
  '<td><span class="nta30-task-pill '+esc(x.priority)+'">'+esc(cap(x.priority))+'</span></td>'+
  '<td>'+esc(fmt(x.due_at))+'</td>'+
  '<td><span class="nta30-task-pill '+esc(x.status)+'">'+esc(cap(x.status))+'</span></td>'+
  '<td><button type="button" data-task-edit="'+esc(x.id)+'">Manage</button></td></tr>';
 }).join('')||'<tr><td class="nta30-task-empty" colspan="6">'+(rows.length?'No tasks match your filters.':'No tasks yet. Use New Task to create one.')+'</td></tr>';
}
async function load(){
 if(state.loading)return;
 state.loading=true;const ticket=++state.nonce;err('');
 $('#tasksResultCount').textContent='Loading tasks…';
 try{
  const response=await api('tasks',{open_only:false});
  if(ticket!==state.nonce)return;
  state.rows=response.tasks||[];render();
 }catch(e){
  if(ticket!==state.nonce)return;
  err('Unable to load tasks: '+e.message);
  $('#tasksResultCount').textContent='Unable to load';
  $('#tasksBody').innerHTML='<tr><td colspan="6" class="nta30-task-empty">Tasks could not be loaded. Select Refresh to retry.</td></tr>';
 }finally{state.loading=false}
}
function setForm(row={}){
 const form=$('#taskEditorForm');form.reset();
 for(const name of ['title','status','priority','description','assigned_to','entity_type']){
  if(row[name]!==null&&row[name]!==undefined)form.elements.namedItem(name).value=String(row[name]);
 }
 form.elements.namedItem('due_at').value=local(row.due_at);
 form.elements.namedItem('entity_type').value=row.entity_type||'general';
 $('#taskEditorHeading').textContent=row.id?'Manage Task':'New Task';
 $('#taskSideCreated').textContent=row.created_at?fmt(row.created_at):'New task';
 updateSnapshot();
 showEditorMessage();
}
function updateSnapshot(){
 const f=$('#taskEditorForm').elements;
 $('#taskSideStatus').textContent=cap(f.namedItem('status').value);
 $('#taskSideRecord').textContent=f.namedItem('entity_type').value==='general'?'Standalone':cap(f.namedItem('entity_type').value);
 $('#taskMarkComplete').hidden=!state.current||f.namedItem('status').value==='completed';
 $('#taskReopen').hidden=!state.current||f.namedItem('status').value!=='completed';
}
async function loadTeam(){
 const select=$('#taskAssignedTo');if(!select)return;
 try{
  const result=await api('team');
  state.staff=(result.team||[]).filter(x=>x.active);
  const value=select.value;
  select.innerHTML='<option value="">Unassigned</option>'+state.staff.map(x=>'<option value="'+esc(x.user_id)+'">'+esc(x.display_name||x.email)+'</option>').join('');
  if(value)select.value=value;
 }catch(e){$('#taskEditorMessage').textContent='Team members could not be loaded: '+e.message}
}
async function loadRecords(type,wanted=null){
 const select=$('#taskEntityId'),ticket=++state.nonce;
 select.disabled=true;select.innerHTML='<option value="">'+(type==='general'?'No linked record':'Loading records…')+'</option>';
 $('#taskSourceHelp').textContent=type==='general'?'Standalone tasks are not attached to a company.':'Select an existing '+type+' record.';
 if(type==='general'){state.records=[];return}
 try{
  const result=await api('task_records',{entity_type:type});
  if(ticket!==state.nonce)return;
  state.records=result.records||[];
  select.innerHTML='<option value="">Select record…</option>'+state.records.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.label)+(r.reference?' · '+esc(r.reference):'')+'</option>').join('');
  select.disabled=false;
  if(wanted){select.value=wanted;if(select.value!==wanted){
   const o=document.createElement('option');o.value=wanted;o.textContent='Previously linked record ('+wanted.slice(0,8)+')';select.appendChild(o);select.value=wanted;
  }}
 }catch(e){if(ticket!==state.nonce)return;select.innerHTML='<option value="">Unable to load records</option>';showEditorMessage('Unable to load CRM records: '+e.message,true)}
}
async function open(id=null,opts={}){
 state.current=id?state.rows.find(x=>x.id===id)||null:null;
 if(id&&!state.current){
  const data=await api('tasks',{open_only:false});state.rows=data.tasks||[];
  state.current=state.rows.find(x=>x.id===id)||null;
  if(!state.current){err('Task not found');navigate('tasks','#/page/tasks',opts);return}
 }
 setForm(state.current||{status:'open',priority:'normal',entity_type:'general'});
 navigate('task-editor','#/tasks/'+(id||'new'),opts);
 await Promise.allSettled([loadTeam(),loadRecords(state.current?.entity_type||'general',state.current?.entity_id)]);
 const f=$('#taskEditorForm').elements;
 if(state.current?.assigned_to)f.namedItem('assigned_to').value=state.current.assigned_to;
 updateSnapshot();
}
function close(opts={}){navigate('tasks','#/page/tasks',opts);void load()}
async function save(event){
 event.preventDefault();const form=$('#taskEditorForm'),data=new FormData(form);
 const title=String(data.get('title')||'').trim(),type=String(data.get('entity_type')||'general');
 const id=state.current?.id||null;
 if(!title){showEditorMessage('Task title is required.',true);return}
 const record=String(data.get('entity_id')||'').trim();
 if(type!=='general'&&!record){showEditorMessage('Select the related CRM record.',true);return}
 const rawDue=String(data.get('due_at')||'');
 const due=rawDue?new Date(rawDue).toISOString():null;
 const payload={id,title,description:String(data.get('description')||'').trim(),
  status:String(data.get('status')||'open'),priority:String(data.get('priority')||'normal'),
  due_at:due,assigned_to:String(data.get('assigned_to')||'')||null,
  entity_type:type,entity_id:type==='general'?null:record};
 const buttons=[...form.querySelectorAll('button[type="submit"]'),$('#taskSaveTop')];
 buttons.forEach(b=>{if(b)b.disabled=true});showEditorMessage('Saving task…');
 try{
  const result=await api('task_save',payload);
  state.current=result.task;showEditorMessage('Task saved successfully.');
  await load();close();
 }catch(e){showEditorMessage(e.message,true)}
 finally{buttons.forEach(b=>{if(b)b.disabled=false})}
}
window.NTATasks={load,open,onRoute:(page)=>{
 if(page==='tasks')void load();
}};
$('#tasksRefresh')?.addEventListener('click',()=>{void load()});
$('#tasksCreate')?.addEventListener('click',()=>{void open()});
$('#taskEditorForm')?.addEventListener('submit',save);
for(const id of ['taskBack','taskCancel','taskCancelBottom'])$('#'+id)?.addEventListener('click',()=>close());
for(const id of ['tasksSearch','tasksFilterStatus','tasksFilterPriority','tasksFilterDue'])$('#'+id)?.addEventListener(id==='tasksSearch'?'input':'change',render);
$('#tasksResetFilters')?.addEventListener('click',()=>{for(const id of ['tasksSearch','tasksFilterStatus','tasksFilterPriority','tasksFilterDue'])$('#'+id).value='';render()});
$('#taskEntityType')?.addEventListener('change',()=>{void loadRecords($('#taskEntityType').value);updateSnapshot()});
$('#taskEditorForm')?.addEventListener('change',updateSnapshot);
$('#taskMarkComplete')?.addEventListener('click',()=>{$('#taskEditorForm').elements.namedItem('status').value='completed';updateSnapshot();$('#taskEditorForm').requestSubmit()});
$('#taskReopen')?.addEventListener('click',()=>{$('#taskEditorForm').elements.namedItem('status').value='open';updateSnapshot();$('#taskEditorForm').requestSubmit()});
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-task-edit]');
 if(button){void open(button.dataset.taskEdit)}
});
})();