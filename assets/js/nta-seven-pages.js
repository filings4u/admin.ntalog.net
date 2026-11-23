/* NTA Logistics - focused seven-page management portal.
   One authenticated Supabase client, one router, no legacy panel dependencies. */
(() => {
  'use strict';
  const config=window.NTA_CONFIG;
  const client=window.NTAAdminClient;
  const routes={
    'shipper-crm':{title:'Shipper CRM',kind:'account',type:'shipper',source:'https://ntalog.net/shipper-onboarding.html',table:'nta_crm_accounts'},
    'carrier-crm':{title:'Carrier CRM',kind:'account',type:'carrier',source:'https://ntalog.net/carrier-onboarding.html',table:'nta_crm_accounts'},
    'quotes':{title:'Quote requests',kind:'intake',type:'quote',source:'https://ntalog.net/request-quote.html',table:'nta_quote_requests'},
    'carrier-applications':{title:'Carrier applications',kind:'intake',type:'carrier',source:'https://ntalog.net/carrier-onboarding.html',table:'nta_carrier_applications'},
    'shipper-applications':{title:'Shipper applications',kind:'intake',type:'shipper',source:'https://ntalog.net/shipper-onboarding.html',table:'nta_shipper_profiles'},
    'inquiries':{title:'Inquiries',kind:'intake',type:'inquiry',source:'https://ntalog.net/contact.html',table:'nta_contact_inquiries'},
    'tasks':{title:'My tasks',kind:'task',table:'nta_crm_tasks'}
  };
  const types={quote:'quotes',carrier:'carrier-applications',shipper:'shipper-applications',inquiry:'inquiries'};
  const statuses=['','new','submitted','pending','reviewing','approved','quoted','won','lost','completed','rejected','cancelled','active','inactive','prospect','contacted'];
  const $=sel=>document.querySelector(sel);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
  const showDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):String(value)};
  const showStatus=value=>String(value||'new').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const state={session:null,admin:null,taskRows:[],accountRows:[],loading:0,scrollTop:0};
  const panel=$('#workspaceContent'),auth=$('#adminAuth'),app=$('#adminApp');
  const showLogin=(msg='')=>{auth.hidden=false;app.hidden=true;$('#authStatus').textContent=msg;$('#authStatus').classList.toggle('show',!!msg)};
  const showPortal=()=>{auth.hidden=true;app.hidden=false};
  const flash=(message,kind='ok')=>{const el=$('#workspaceNotice');el.textContent=message;el.hidden=!message;el.dataset.kind=kind;el.setAttribute('role',kind==='error'?'alert':'status')};
  const setBusy=(busy)=>{panel.setAttribute('aria-busy',String(busy))};
  const authApi=async(action,payload={})=>{
    const {data,error}=await client.auth.getSession();if(error)throw error;
    const session=data?.session;if(!session)throw Error('Your session has expired. Sign in again.');
    const res=await fetch(config.adminFunctionUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,...payload})});
    const result=await res.json().catch(()=>({}));
    if(!res.ok||result.error)throw Error(result.error||'Request failed');
    return result;
  };
  const renderLoading=()=>{panel.innerHTML='<div class="nta29-card nta29-loading">Loading records…</div>';flash('')};
  const renderError=err=>{flash(err?.message||'Could not load this page.','error');panel.innerHTML='<div class="nta29-card nta29-loading">Unable to load records. <button type="button" data-command="refresh">Retry</button></div>'};
  const navItems=Object.keys(routes);
  const parse=()=>{let bits;try{bits=decodeURIComponent(location.hash.replace(/^#\/?/,'' )).split('/').filter(Boolean)}catch{return {page:'shipper-crm'}};const [prefix,a,b]=bits;if(prefix==='record'&&types[a]&&isUuid(b))return {page:types[a],kind:'record',type:a,id:b};if(prefix==='account'&&['shipper','carrier'].includes(a)&&(b==='new'||isUuid(b)))return {page:a+'-crm',kind:'account-edit',type:a,id:b};if(prefix==='task'&&(a==='new'||isUuid(a)))return {page:'tasks',kind:'task-edit',id:a};if(prefix==='page'&&routes[a])return {page:a};return {page:'shipper-crm'}};
  const pageLink=page=>'#/page/'+page;
  const sourceAction=page=>page?.source?'<a class="nta29-secondary" href="'+esc(page.source)+'" target="_blank" rel="noopener noreferrer">Open public form</a>':'';
  const commonHeader=(title,sub,actions='')=>'<div class="nta29-page-heading"><div><h1>'+esc(title)+'</h1>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</div><div class="nta29-page-actions">'+actions+'</div></div>';
  const escapeStatusOptions=(chosen='')=>statuses.map(s=>'<option value="'+esc(s)+'"'+(chosen===s?' selected':'')+'>'+esc(s?showStatus(s):'All statuses')+'</option>').join('');
  const statusTag=s=>'<span class="nta29-pill">'+esc(showStatus(s))+'</span>';
  const colText=(row,keys)=>{for(const key of keys)if(row[key]!==undefined&&row[key]!==null&&row[key]!=='')return String(row[key]);return '—'};
  const pageControls=(page,account=false)=>'<form id="listFilters" class="nta29-filters"><label class="nta29-sr" for="recordSearch">Search records</label><input id="recordSearch" type="search" placeholder="Search company, contact, email or reference" value="'+esc(state.search||'')+'"><label class="nta29-sr" for="recordStatusFilter">Status</label><select id="recordStatusFilter">'+escapeStatusOptions(state.filterStatus||'')+'</select><button type="submit" class="nta29-primary">Search</button><button type="button" class="nta29-secondary" data-command="clear-filters">Clear</button></form>';
  const th=names=>'<thead><tr>'+names.map(n=>'<th scope="col">'+esc(n)+'</th>').join('')+'</tr></thead>';
  const emptyRow=cols=>'<tr><td colspan="'+cols+'" class="nta29-empty">No records found for this filter.</td></tr>';
  const recordTable=(page,rows)=>{
    const account=page.kind==='account';
    const head=account?['Company','Contact','Email','Phone','Status','Updated']:page.type==='quote'?['Reference','Company','Contact','Route','Status','Submitted']:page.type==='inquiry'?['Reference','Name / Company','Email','Topic','Status','Submitted']:['Reference','Company','Contact','Email','Status','Submitted'];
    const body=rows.map(r=>{
      const title=colText(r,account?['company_name']:page.type==='carrier'?['legal_company_name','company_name']:page.type==='inquiry'?['company_name','name']:['company_name']);
      const name=colText(r,account?['contact_name']:page.type==='quote'?['contact_name']:page.type==='inquiry'?['name']:['primary_contact_name']);
      const email=colText(r,account?['contact_email']:page.type==='quote'?['contact_email']:page.type==='inquiry'?['email']:['primary_contact_email']);
      const href=account?'#/account/'+page.type+'/'+encodeURIComponent(r.id):'#/record/'+page.type+'/'+encodeURIComponent(r.id);
      const values=account?[title,name,email,colText(r,['phone']),statusTag(r.status),showDate(r.updated_at||r.created_at)]
      :page.type==='quote'?[colText(r,['reference_number']),title,name,[r.pickup_city,r.pickup_state].filter(Boolean).join(', ')+' → '+[r.delivery_city,r.delivery_state].filter(Boolean).join(', '),statusTag(r.status),showDate(r.created_at)]
      :page.type==='inquiry'?[colText(r,['reference_number']),title,email,colText(r,['topic']),statusTag(r.status),showDate(r.created_at)]
      :[colText(r,['reference_number']),title,name,email,statusTag(r.status),showDate(r.created_at)];
      const cells=values.map((v,i)=>'<td>'+(i===0?'<a class="nta29-record-link" href="'+esc(href)+'">'+(String(v).startsWith('<span')?v:esc(v))+'</a>':String(v).startsWith('<span class="nta29-pill">')?v:esc(v))+'</td>').join('');
      return '<tr>'+cells+'</tr>';
    }).join('');
    return '<div class="nta29-table-wrap"><table class="nta29-table">'+th(head)+'<tbody>'+(body||emptyRow(head.length))+'</tbody></table></div>';
  };
  const listPage=async(page)=>{
    renderLoading();
    let rows=[],total=0;
    const q=(state.search||'').trim().slice(0,120),status=state.filterStatus||'';
    if(page.kind==='account'){
      let query=client.from('nta_crm_accounts').select('*',{count:'exact'}).eq('account_type',page.type).order('updated_at',{ascending:false}).limit(200);
      if(q){const safe=q.replace(/[,()%]/g,'');query=query.or('company_name.ilike.%'+safe+'%,contact_name.ilike.%'+safe+'%,contact_email.ilike.%'+safe+'%');}
      if(status)query=query.eq('status',status);
      const {data,error,count}=await query;if(error)throw error;rows=data||[];total=count??rows.length;state.accountRows=rows;
    }else{
      const res=await authApi('crm_list',{entity_type:page.type,q,status,limit:100});rows=res.rows||[];total=res.count??rows.length;
    }
    panel.innerHTML=commonHeader(page.title,page.kind==='account'?'Manage your '+page.type+' relationships and business records.':'Manage submissions received from the NTA Logistics website.',sourceAction(page)+(page.kind==='account'?'<a href="#/account/'+page.type+'/new" class="nta29-primary">Add account</a>':''))+pageControls(page)+
      '<section class="nta29-card"><div class="nta29-table-heading"><strong>'+esc(page.title)+'</strong><span>'+total+' records</span></div>'+recordTable(page,rows)+'</section>';
  };
  const detailsPage=async(type,id)=>{
    renderLoading();
    const res=await authApi('crm_detail',{entity_type:type,entity_id:id});
    const page=routes[types[type]],rec=res.record;
    if(!rec)throw Error('This request was not found.');
    const company=colText(rec,type==='carrier'?['legal_company_name','company_name']:type==='inquiry'?['company_name','name']:['company_name']);
    const title=company==='—'?page.title:company;
    panel.innerHTML=commonHeader(title,page.title+' · '+(rec.reference_number||id),'<a class="nta29-secondary" href="'+pageLink(types[type])+'">Back to '+esc(page.title)+'</a>'+sourceAction(page))+
      '<div id="crmRecordFeedback" class="nta29-notice" hidden></div>'+
      '<div id="crmRecordBody" class="nta27-crm-body">'+window.NTACrmManagementView.render(type,rec,res)+'</div>';
    state.record={type,id};
  };
  const accountEditor=async(type,id)=>{
    renderLoading();const route=routes[type+'-crm'];
    let row={account_type:type,status:'prospect'};
    if(id!=='new'){
      let {data,error}=await client.from('nta_crm_accounts').select('*').eq('id',id).eq('account_type',type).single();
      if(error)throw error;row=data;
    }
    const fields=[['Company name','company_name','text',true],['Contact name','contact_name'],['Email','contact_email','email'],['Phone','phone','tel'],['Website','website','url'],['Industry','industry'],['DOT number','dot_number'],['MC number','mc_number'],['Equipment types','equipment_types'],['Preferred lanes','preferred_lanes'],['Address','address']];
    const visible=fields.filter(([label,key])=>type==='carrier'||!['dot_number','mc_number','equipment_types'].includes(key));
    const inputs=visible.map(([label,key,t='text',required=false])=>'<label>'+esc(label)+'<input name="'+esc(key)+'" type="'+esc(t)+'" value="'+esc(row[key]||'')+'"'+(required?' required':'')+'></label>').join('');
    panel.innerHTML=commonHeader(id==='new'?'Add '+type+' account':'Manage '+colText(row,['company_name']),route.title,'<a class="nta29-secondary" href="'+pageLink(type+'-crm')+'">Back to '+esc(route.title)+'</a>')+
      '<form id="accountForm" class="nta29-card nta29-editor">'+
      '<div class="nta29-form-grid">'+inputs+'<label>Status<select name="status">'+['prospect','contacted','active','inactive'].map(s=>'<option value="'+s+'"'+(row.status===s?' selected':'')+'>'+showStatus(s)+'</option>').join('')+'</select></label><label class="nta29-wide">Internal notes<textarea name="notes" rows="4">'+esc(row.notes||'')+'</textarea></label></div>'+
      '<div class="nta29-form-actions"><button type="submit" class="nta29-primary">Save account</button><a href="'+pageLink(type+'-crm')+'" class="nta29-secondary">Cancel</a></div></form>';
    state.accountEdit={type,id};
  };
  const taskList=async()=>{
    renderLoading();const result=await authApi('tasks',{open_only:false});const rows=result.tasks||[];state.taskRows=rows;
    const visible=state.taskFilter==='open'?rows.filter(r=>!['completed','cancelled'].includes(r.status)):rows;
    const cells=visible.map(t=>'<tr><td><a class="nta29-record-link" href="#/task/'+encodeURIComponent(t.id)+'">'+esc(t.title||'Untitled task')+'</a>'+(t.description?'<small>'+esc(t.description.slice(0,130))+'</small>':'')+'</td><td>'+esc(showStatus(t.priority))+'</td><td>'+statusTag(t.status)+'</td><td>'+esc(t.entity_type)+'</td><td>'+esc(showDate(t.due_at))+'</td></tr>').join('');
    panel.innerHTML=commonHeader('My tasks','Directly connected to the Supabase nta_crm_tasks table.','<a href="#/task/new" class="nta29-primary">New task</a>')+
      '<section class="nta29-card"><div class="nta29-table-heading"><strong>Task manager</strong><div class="nta29-actions"><label for="taskListFilter">Show</label><select id="taskListFilter"><option value="open"'+(state.taskFilter==='open'?' selected':'')+'>Open tasks</option><option value="all"'+(state.taskFilter!=='open'?' selected':'')+'>All tasks</option></select><button type="button" data-command="refresh" class="nta29-secondary">Refresh</button></div></div><div class="nta29-table-wrap"><table class="nta29-table">'+th(['Task','Priority','Status','Record type','Due'])+'<tbody>'+(cells||emptyRow(5))+'</tbody></table></div></section>';
  };
  const recordChoices=async()=>{
    const options=[];
    const settled=await Promise.allSettled(Object.keys(types).map(async type=>({type,res:await authApi('crm_list',{entity_type:type,q:'',status:'',limit:100})})));
    for(const r of settled)if(r.status==='fulfilled'){const {type,res}=r.value;for(const rec of res.rows||[])options.push({type,id:rec.id,label:routes[types[type]].title+' · '+colText(rec,type==='carrier'?['legal_company_name','company_name']:type==='inquiry'?['company_name','name']:['company_name'])+' · '+colText(rec,['reference_number','id'])});}
    return options;
  };
  const taskEditor=async(id)=>{
    renderLoading();
    let task={title:'',description:'',status:'open',priority:'normal',due_at:'',entity_type:'',entity_id:''};
    if(id!=='new'){
      const j=await authApi('tasks',{open_only:false});
      const found=(j.tasks||[]).find(t=>t.id===id);
      if(!found)throw Error('Task not found.');task=found;
    }
    const choices=await recordChoices();
    if(id!=='new'&&!choices.some(c=>c.type===task.entity_type&&c.id===task.entity_id))choices.unshift({type:task.entity_type,id:task.entity_id,label:'Linked '+task.entity_type+' record'});
    const options=choices.map(x=>'<option value="'+esc(x.type+'|'+x.id)+'"'+(x.type===task.entity_type&&x.id===task.entity_id?' selected':'')+'>'+esc(x.label)+'</option>').join('');
    panel.innerHTML=commonHeader(id==='new'?'Create task':'Edit task','Tasks are associated with a CRM request.','<a class="nta29-secondary" href="'+pageLink('tasks')+'">Back to My tasks</a>')+
      '<form id="taskForm" class="nta29-card nta29-editor"><div class="nta29-form-grid">'+
      '<label class="nta29-wide">Task title<input name="title" required maxlength="300" value="'+esc(task.title||'')+'"></label>'+
      '<label class="nta29-wide">Linked record<select name="linked" required><option value="">Select a CRM record</option>'+options+'</select></label>'+
      '<label>Due date<input name="due_at" type="datetime-local" value="'+(task.due_at?esc(new Date(task.due_at).toISOString().slice(0,16)):'')+'"></label>'+
      '<label>Priority<select name="priority">'+['normal','high','urgent','low'].map(v=>'<option value="'+v+'"'+(v===task.priority?' selected':'')+'>'+showStatus(v)+'</option>').join('')+'</select></label>'+
      '<label>Status<select name="status">'+['open','in_progress','completed','cancelled'].map(v=>'<option value="'+v+'"'+(v===task.status?' selected':'')+'>'+showStatus(v)+'</option>').join('')+'</select></label>'+
      '<label class="nta29-wide">Description<textarea name="description" rows="5">'+esc(task.description||'')+'</textarea></label>'+
      '</div><div class="nta29-form-actions"><button type="submit" class="nta29-primary"'+(!options?' disabled':'')+'>Save task</button><a href="'+pageLink('tasks')+'" class="nta29-secondary">Cancel</a></div>'+
      (!options?'<p class="nta29-warning">No CRM records are available to associate with this task. Create a request first.</p>':'')+'</form>';
    state.taskEdit={id};
  };
  const navigate=async()=>{
    const serial=++state.loading;const route=parse(),page=routes[route.page];
    const heading=route.kind==='record'?'Record Details':route.kind==='account-edit'?'Account Management':route.kind==='task-edit'?'Task Management':page.title;
    $('#pageLabel').textContent=heading;
    document.querySelectorAll('.nta29-nav a[data-page]').forEach(a=>{const active=a.dataset.page===route.page;a.classList.toggle('active',active);active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')});
    state.search='';state.filterStatus='';
    flash('');
    setBusy(true);
    try{
      if(route.kind==='record')await detailsPage(route.type,route.id);
      else if(route.kind==='account-edit')await accountEditor(route.type,route.id);
      else if(route.kind==='task-edit')await taskEditor(route.id);
      else if(page.kind==='task')await taskList();
      else await listPage(page);
      if(serial!==state.loading)return;
      window.scrollTo(0,0);
    }catch(error){if(serial===state.loading)renderError(error)}
    finally{if(serial===state.loading)setBusy(false)}
  };
  const accountMenu=$('#accountDropdown'),toggle=$('#accountMenuToggle');
  const closeAccount=()=>{accountMenu.hidden=true;toggle.setAttribute('aria-expanded','false')};
  toggle.addEventListener('click',()=>{const next=accountMenu.hidden;accountMenu.hidden=!next;toggle.setAttribute('aria-expanded',String(next))});
  document.addEventListener('click',event=>{if(!event.target.closest('.nta29-account'))closeAccount()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAccount()});
  $('#signOutBtn').addEventListener('click',async()=>{const btn=$('#signOutBtn');btn.disabled=true;try{const {error}=await client.auth.signOut();if(error)throw error;state.session=null;state.admin=null;closeAccount();showLogin()}catch(e){flash(e.message,'error')}finally{btn.disabled=false}});
  $('#sidebarToggle').addEventListener('click',()=>{
    if(window.matchMedia('(max-width:700px)').matches)app.classList.toggle('sidebar-open');
    else app.classList.toggle('sidebar-collapsed');
  });
  document.querySelectorAll('.nta29-nav a[data-page]').forEach(link=>link.addEventListener('click',()=>{
    app.classList.remove('sidebar-open');
  }));
  $('#adminPasswordToggle').addEventListener('click',()=>{const el=$('#adminPassword');el.type=el.type==='password'?'text':'password'});
  $('#signinForm').addEventListener('submit',async event=>{event.preventDefault();const form=$('#signinForm'),btn=form.querySelector('button[type="submit"]');btn.disabled=true;$('#authStatus').textContent='Signing in…';try{const {data,error}=await client.auth.signInWithPassword({email:$('#adminEmail').value.trim(),password:$('#adminPassword').value});if(error)throw error;await start(data.session)}catch(e){showLogin(e.message)}finally{btn.disabled=false}});
  const start=async(session)=>{
    if(!session){showLogin();return}
    try{
      const me=await authApi('me');
      if(!me.admin?.active||!['admin','crm'].includes(me.admin.role))throw Error('Administrator access is required.');
      state.session=session;state.admin=me.admin;
      $('#accountName').textContent=me.admin.display_name||me.user?.email?.split('@')[0]||'Administrator';
      $('#accountDropdownName').textContent=$('#accountName').textContent;
      $('#accountEmail').textContent=me.user?.email||'';
      $('#accountRole').textContent=me.admin.role||'';
      $('#accountStatus').textContent='Active';
      const initials=(me.admin.display_name||'AD').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
      $('#accountAvatar').textContent=initials||'AD';
      showPortal();
      if(!location.hash)location.replace('#/page/shipper-crm');
      await navigate();
    }catch(e){showLogin(e.message)}
  };
  const boot=async()=>{
    if(!client){showLogin('Unable to initialize authentication. Refresh the page.');return}
    const {data,error}=await client.auth.getSession();
    if(error){showLogin(error.message);return}
    await start(data?.session||null);
  };
  window.addEventListener('hashchange',()=>{if(state.session)void navigate()});
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-command]');if(!button)return;
    if(button.dataset.command==='refresh')await navigate();
    if(button.dataset.command==='clear-filters'){state.search='';state.filterStatus='';await navigate();}
  });
  panel.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target;
    const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    try{
      if(form.id==='listFilters'){
        state.search=$('#recordSearch').value;state.filterStatus=$('#recordStatusFilter').value;
        const page=routes[parse().page];await listPage(page);return;
      }
      if(form.id==='accountForm'){
        const {type,id}=state.accountEdit;
        const values=Object.fromEntries(new FormData(form).entries());
        for(const [key,v] of Object.entries(values))values[key]=String(v).trim()||null;
        if(!values.company_name)throw Error('Company name is required.');
        const allowed=['company_name','contact_name','contact_email','phone','website','industry','dot_number','mc_number','equipment_types','preferred_lanes','address','status','notes'];
        const row=Object.fromEntries(Object.entries(values).filter(([k])=>allowed.includes(k)));
        row.account_type=type;row.updated_at=new Date().toISOString();
        const query=client.from('nta_crm_accounts');
        const {error}=id==='new'?await query.insert(row):await query.update(row).eq('id',id).eq('account_type',type);
        if(error)throw error;
        location.hash=pageLink(type+'-crm');return;
      }
      if(form.id==='taskForm'){
        const values=Object.fromEntries(new FormData(form).entries());
        const [entity_type,entity_id]=String(values.linked||'').split('|');
        if(!types[entity_type]||!isUuid(entity_id))throw Error('Select a valid CRM request for the task.');
        if(!String(values.title||'').trim())throw Error('Task title is required.');
        await authApi('task_save',{id:state.taskEdit.id==='new'?undefined:state.taskEdit.id,entity_type,entity_id,title:String(values.title).trim(),description:String(values.description||'').trim(),priority:values.priority,status:values.status,due_at:values.due_at?new Date(values.due_at).toISOString():null});
        location.hash=pageLink('tasks');return;
      }
    }catch(error){flash(error.message,'error')}
    finally{if(submit)submit.disabled=false}
  });
  panel.addEventListener('change',event=>{if(event.target.id==='taskListFilter'){state.taskFilter=event.target.value;void taskList()}});
  panel.addEventListener('click',async event=>{
    const btn=event.target.closest('button');if(!btn||!state.record)return;
    const {type,id}=state.record;
    if(!['saveRecordStatus','addNote','addTask'].includes(btn.id))return;
    btn.disabled=true;
    try{
      if(btn.id==='saveRecordStatus')await authApi('crm_status',{entity_type:type,entity_id:id,status:$('#recordStatus').value});
      if(btn.id==='addNote'){const note=$('#newNote').value.trim();if(!note)throw Error('Enter a note.');await authApi('crm_note',{entity_type:type,entity_id:id,note})}
      if(btn.id==='addTask'){const title=$('#taskTitle').value.trim();if(!title)throw Error('Enter a task title.');await authApi('task_save',{entity_type:type,entity_id:id,title,description:$('#taskDescription').value.trim(),due_at:$('#taskDue').value?new Date($('#taskDue').value).toISOString():null,priority:$('#taskPriority').value})}
      await detailsPage(type,id);flash('Saved successfully.');
    }catch(error){flash(error.message,'error')}finally{btn.disabled=false}
  });
  boot().catch(e=>showLogin(e.message));
})();