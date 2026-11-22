(() => {
  'use strict';
  const cfg = window.NTA_CONFIG || {};
  const sb = window.NTAAdminClient;
  if (!sb) return;
  const $ = (q,r=document)=>r.querySelector(q), $$=(q,r=document)=>[...r.querySelectorAll(q)];
  const state={session:null,admin:null,metrics:null,crmType:'quote',crmRows:[],currentRecord:null,posts:[],post:null,categories:[],tags:[],media:[],dirty:false,autosave:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dt=v=>v?new Date(v).toLocaleString(): '—';
  const slugify=v=>String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,180);
  const statusBox=(msg,type='success')=>{const e=$('#authStatus');e.className=`status show ${type}`;e.textContent=msg};
  async function api(action,payload={}){
    const {data:{session}}=await sb.auth.getSession(); if(!session) throw new Error('Please sign in again.');
    const res=await fetch(cfg.adminFunctionUrl,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.publishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action,...payload})});
    const j=await res.json().catch(()=>({})); if(!res.ok||j.error) throw new Error(j.error||'Request failed'); return j;
  }
  // Client inactivity policy. A per-user timestamp persists through refresh and syncs tabs.
  const IDLE_LIMIT_MS=10*60*1000;
  const IDLE_WARNING_MS=60*1000;
  const idleModal=$('#idleWarningModal');
  const idleCountdown=$('#idleCountdown');
  let idleKey=null, idleInterval=null, idleLoggingOut=false, lastActivityWrite=0;
  let idleStartedForSession=null;
  function idleLastActivity(){
    if(!idleKey)return 0;
    try{return Number(localStorage.getItem(idleKey))||0}catch{return lastActivityWrite}
  }
  function recordActivity(force=false){
    if(!idleKey||idleLoggingOut||!state.session||!idleModal.hidden)return;
    const now=Date.now();
    if(!force&&now-lastActivityWrite<1000)return;
    lastActivityWrite=now;
    try{localStorage.setItem(idleKey,String(now))}catch{}
  }
  function hideIdleWarning(){idleModal.hidden=true;document.body.classList.remove('nta-idle-modal-open')}
  function displayIdleWarning(seconds){
    idleCountdown.textContent=String(Math.max(0,seconds));
    if(idleModal.hidden){
      idleModal.hidden=false;
      document.body.classList.add('nta-idle-modal-open');
      $('#idleStaySignedIn').focus();
    }
  }
  async function idleSignOut(){
    if(idleLoggingOut)return;
    idleLoggingOut=true;
    clearInterval(idleInterval);idleInterval=null;
    hideIdleWarning();
    try{if(idleKey)localStorage.removeItem(idleKey)}catch{}
    try{await sb.auth.signOut({scope:'local'})}catch(error){console.warn('Idle sign-out error:',error)}
    state.session=null;state.admin=null;idleKey=null;
    showAuth();
    statusBox('Your session ended after 10 minutes of inactivity. Please sign in again.','error');
  }
  function checkIdle(){
    if(!idleKey||idleLoggingOut||!state.session)return;
    const last=idleLastActivity();
    const remaining=IDLE_LIMIT_MS-(Date.now()-last);
    if(!last||remaining<=0){void idleSignOut();return}
    if(remaining<=IDLE_WARNING_MS)displayIdleWarning(Math.ceil(remaining/1000));
    else hideIdleWarning();
  }
  function startIdleTracking(session){
    // Per-login timestamp: an old login must never expire a new authenticated session.
    const loginId=session.user?.last_sign_in_at||String(session.expires_at||'session');
    const nextKey='nta-admin-last-activity:'+session.user.id+':'+loginId;
    if(idleKey!==nextKey){
      idleKey=nextKey;
      idleStartedForSession=loginId;
      lastActivityWrite=0;
      // A missing timestamp is not a timeout: initialize from the restored login.
      if(!idleLastActivity())recordActivity(true);
    }
    clearInterval(idleInterval);
    idleInterval=setInterval(checkIdle,1000);
    checkIdle();
  }
  function endIdleTracking(){
    clearInterval(idleInterval);idleInterval=null;
    hideIdleWarning();
    if(idleKey){try{localStorage.removeItem(idleKey)}catch{}}
    idleKey=null;
    idleStartedForSession=null;
    idleLoggingOut=false;
  }
  ['pointerdown','keydown','touchstart','wheel','scroll'].forEach(eventName=>
    document.addEventListener(eventName,()=>recordActivity(),{passive:true})
  );
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkIdle()});
  // A user-initiated refresh is activity; don't treat a new document load as idle time.
  window.addEventListener('pagehide',()=>{if(state.session&&!idleLoggingOut&&idleModal.hidden)recordActivity(true)});
  window.addEventListener('focus',checkIdle);
  window.addEventListener('storage',event=>{
    if(event.key===idleKey)checkIdle();
  });
  $('#idleStaySignedIn').addEventListener('click',()=>{
    // Explicit acknowledgement starts a new activity window.
    hideIdleWarning();
    recordActivity(true);
    checkIdle();
  });
  $('#idleSignOutNow').addEventListener('click',()=>{void idleSignOut()});
  function showAuth(){ $('#adminAuth').hidden=false; $('#adminApp').hidden=true; }
  function showApp(){
    $('#adminAuth').hidden=true; $('#adminApp').hidden=false;
    const name=state.admin?.display_name||'Administrator';
    const email=state.session?.user?.email||'';
    $('#adminUserName').textContent=name;
    $('#adminUserEmail').textContent=email;
    $('#accountMenuName').textContent=name;
    $('#profileDisplayName').textContent=name;
    $('#profileEmail').textContent=email;
    $('#profileRole').textContent=state.admin?.role||'admin';
    $('#profileStatus').textContent=state.admin?.active===false?'Inactive':'Active';
  }
  async function loadAdminWorkspace(){
    // Dashboard or CMS failures must not revoke a valid login session.
    const modules=[
      ['dashboard',loadDashboard],
      ['tasks',loadTasks],
      ['blog posts',loadPosts],
      ['categories',loadTaxonomy],
      ['media',loadMedia]
    ];
    const outcomes=await Promise.allSettled(modules.map(([,loader])=>loader()));
    const failures=outcomes.flatMap((result,index)=>result.status==='rejected'?[modules[index][0]]:[]);
    const updated=$('#dashboardUpdated');if(updated)updated.textContent=outcomes[0].status==='fulfilled'?'Updated '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Dashboard unavailable';
    if(outcomes[0].status==='rejected')console.error('Dashboard load failed:',outcomes[0].reason);
    if(failures.length) {
      console.warn('NTA management: some data could not be loaded:',failures.join(', '));
      const message=$('#adminLoadStatus');
      if(message){
        message.hidden=false;
        message.textContent='Some information could not be loaded ('+failures.join(', ')+'). Your account is still signed in. Refresh to retry.';
      }
    }else {
      const message=$('#adminLoadStatus');
      if(message)message.hidden=true;
    }
  }
  async function boot(){
    let session=null;
    try {
      const result=await sb.auth.getSession();
      if(result.error)throw result.error;
      session=result.data?.session||null;
    }catch(error){
      console.warn('Unable to restore NTA session:',error);
      showAuth();
      statusBox('Unable to restore your session right now. Refresh to retry.','error');
      return;
    }
    state.session=session;
    if(!session){endIdleTracking();showAuth();return;}
    idleLoggingOut=false;
    startIdleTracking(session);
    if(idleLoggingOut)return;
    // Show the restored signed-in portal immediately, without flashing the login form.
    state.admin={display_name:session.user?.user_metadata?.display_name||session.user?.email?.split('@')[0]||'Administrator',role:'pending',active:null};
    showApp();
    try{
      const me=await api('me');
      if(!me?.admin?.active)throw new Error('Administrator access is required.');
      state.admin=me.admin;
    }catch(error){
      // Keep a restored Supabase session visible during temporary API failures.
      // All management data requests remain protected by the API's own access checks.
      console.warn('Unable to verify administrator access:',error);
      // Auth is still valid. Keep the session and retry API verification without
      // pretending permission checks succeeded or displaying a recurring sign-in error.
      state.admin={display_name:session.user?.user_metadata?.display_name||session.user?.email?.split('@')[0]||'Administrator',role:'pending',active:null};
      showApp();
      const message=$('#adminLoadStatus');
      if(message){message.hidden=false;message.textContent='Management data is temporarily unavailable. Your login is still active.';}
      return;
    }
    showApp();
    await loadAdminWorkspace();
  }
  $('#signinForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget, fields=new FormData(form);
    const email=String(fields.get('email')||'').trim().toLowerCase();
    const submit=form.querySelector('button[type="submit"]');
    if(submit){submit.disabled=true;submit.textContent='Signing In…';}
    statusBox('Signing in…');
    try{
      const {error}=await sb.auth.signInWithPassword({email,password:fields.get('password')});
      if(error)throw error;
      idleLoggingOut=false;
      const current=(await sb.auth.getSession()).data?.session;
      if(current?.user?.id){
        const loginId=current.user.last_sign_in_at||String(current.expires_at||'session');
        try{localStorage.setItem('nta-admin-last-activity:'+current.user.id+':'+loginId,String(Date.now()))}catch{}
      }
      // The authenticated client persists the session; don't reload and race
      // an unnecessary new authorization request against the current sign-in.
      await boot();
    }catch(error){
      statusBox(error?.message||'Sign-in failed. Try again.','error');
    }finally{
      if(submit){submit.disabled=false;submit.textContent='Sign In';}
    }
  });
  $('#signOutBtn').addEventListener('click',async()=>{endIdleTracking();await sb.auth.signOut();state.session=null;state.admin=null;showAuth();});
  function activate(name){$$('[data-admin-panel]').forEach(b=>b.classList.toggle('active',b.dataset.adminPanel===name));$$('.admin-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));if(name==='crm')loadCrm();if(name==='blog')renderPosts();if(name==='media')renderMedia();if(name==='categories')renderCategories();if(name==='team')loadTeam();}
  $$('[data-admin-panel]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.adminPanel)));
  $('[data-goto-crm]')?.addEventListener('click',()=>activate('crm'));
  // Dashboard tiles navigate to the same live CRM, accounts and CMS screens as the sidebar.
  function openDashboardMetric(key){
    if(key==='shippers'||key==='carriers'){
      const tab=document.querySelector('[data-accounts-type="'+(key==='shippers'?'shipper':'carrier')+'"]');
      if(tab)tab.click();
      return;
    }
    if(key==='published_posts'){activate('blog');return;}
    if(key==='open_tasks'){activate('tasks');return;}
    const type=key==='inquiries'?'inquiry':'quote';
    $('#crmType').value=type;
    $('#crmSearch').value='';
    $('#crmStatus').value='';
    activate('crm');
  }
  async function refreshDashboard(){
    const refresh=$('[data-refresh-dashboard]');
    if(refresh?.disabled)return;
    if(refresh)refresh.disabled=true;
    const updated=$('#dashboardUpdated');
    if(updated)updated.textContent='Refreshing…';
    const results=await Promise.allSettled([loadDashboard(),loadTasks()]);
    const failed=results.filter(x=>x.status==='rejected');
    if(updated)updated.textContent=failed.length?'Some sections could not refresh':('Updated '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    if(refresh)refresh.disabled=false;
    if(failed.length)console.warn('NTA dashboard refresh failures:',failed.map(x=>x.reason));
  }
  async function loadDashboard(){
    const j=await api('dashboard');
    state.metrics=j.metrics||{};
    const livePosts=document.querySelector('#dashboardPublishedPosts');if(livePosts)livePosts.textContent=String(Number(state.metrics.published_posts||0));
    const quotes=Number(state.metrics.quotes||0), published=Number(state.metrics.published_posts||0);
    const quoteTitle=$('#priorityQuoteTitle'),quoteDetail=$('#priorityQuoteDetail'),contentTitle=$('#priorityContentTitle'),contentDetail=$('#priorityContentDetail');
    if(quoteTitle)quoteTitle.textContent=quotes===1?'1 quote request to review':quotes+' quote requests';
    if(quoteDetail)quoteDetail.textContent=quotes?'Open CRM to inspect the requests':'No quote requests recorded';
    if(contentTitle)contentTitle.textContent=published+' published '+(published===1?'article':'articles');
    if(contentDetail)contentDetail.textContent=published?'Review current published content':'No published articles yet';
    const priorityCount=$('#priorityQueueCount');if(priorityCount)priorityCount.textContent=String(quotes)+' QUOTES';
    // Five-card Concept 01 layout; use real API figures rather than mockup numbers.
    // Load volume and revenue require dedicated backend metrics and are intentionally
    // shown as unavailable until those values exist.
    const metricCards=[
      {label:'Shipper accounts',key:'shippers',icon:'people'},
      {label:'Carrier network',key:'carriers',icon:'truck'},
      {label:'Quote requests',key:'quotes',icon:'document'},
      {label:'Open tasks',key:'open_tasks',icon:'document'}
    ];
    const cardIcons={
      truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 6h12v11H3zM15 10h4l3 4v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
      people:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></svg>',
      document:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8"/></svg>',
      dollar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 6c-2-2-9-2-9 2 0 5 9 2 9 7 0 4-7 5-10 2"/></svg>'
    };
    $('#metricCards').innerHTML=metricCards.map(({label,key,icon})=>{
      const available=key!==null&&Number.isFinite(Number(state.metrics[key]));
      const count=available?Number(state.metrics[key]).toLocaleString():'—';
      const tag=available?'View details':'Not yet tracked';
      return `<button type="button" class="metric-card metric-action" ${available?`data-dashboard-metric="${key}"`:'disabled'} aria-label="${available?'View':'Unavailable:'} ${esc(label)}"><span class="metric-top"><span class="metric-icon" aria-hidden="true">${cardIcons[icon]}</span><span class="metric-label">${esc(label)}</span></span><strong>${count}</strong><span class="metric-hint">${tag}</span></button>`;
    }).join('');
    $$('#metricCards [data-dashboard-metric]').forEach(btn=>btn.addEventListener('click',()=>openDashboardMetric(btn.dataset.dashboardMetric)));
    const breakdown=[['Quotes','quotes'],['Published Posts','published_posts'],['Inquiries','inquiries'],['Open Tasks','open_tasks'],['Shippers','shippers'],['Carriers','carriers']];
    const total=breakdown.reduce((n,[,key])=>n+Number(state.metrics[key]||0),0);
    $('#snapshotTotal').textContent=String(total);
    const colors=['#0b5a9d','#edb522','#4193ad','#7f9ec3','#9b78b2','#6aafa0'];
    let start=0;
    const sectors=breakdown.map(([,key],i)=>{const pct=total?100*Number(state.metrics[key]||0)/total:0;const sector=`${colors[i]} ${start}% ${start+pct}%`;start+=pct;return sector;});
    $('#snapshotDonut').style.background=total?`conic-gradient(${sectors.join(', ')})`:'conic-gradient(#dce5ef 0% 100%)';
    $('#snapshotLegend').innerHTML=breakdown.map(([label,key],i)=>{const count=Number(state.metrics[key]||0);return `<div class="snapshot-row"><span class="snapshot-dot" style="background:${colors[i]}"></span><span>${esc(label)}</span><b>${count}</b><em>${total?Math.round(count/total*100):0}%</em></div>`}).join('');
    try{await loadRecentActivity()}catch(error){
      console.warn('NTA recent activity could not load:',error);
      $('#recentActivity').textContent='Recent activity is temporarily unavailable.';
    }
  }
  async function loadRecentActivity(){
    const events=[];
    const outputs=await Promise.allSettled([api('blog_list'),api('crm_list',{entity_type:'quote',limit:20}),api('crm_list',{entity_type:'shipper',limit:10}),api('crm_list',{entity_type:'carrier',limit:10}),api('crm_list',{entity_type:'inquiry',limit:10})]);
    if(outputs[0].status==='fulfilled')for(const post of outputs[0].value.posts||[]){
      if(post.status==='published'&&post.published_at)events.push({type:'Blog post published',description:post.title||'A blog post was published.',date:post.published_at,icon:'◈',target:'blog',id:post.id});
    }
    const crmTypes=[['quote','Quote'],['shipper','Shipper'],['carrier','Carrier'],['inquiry','Inquiry']];
    const records=[];
    crmTypes.forEach(([type,label],i)=>{
      if(outputs[i+1].status!=='fulfilled')return;
      for(const r of outputs[i+1].value.rows||[]){
        const record={type,label,company:r.company_name||r.legal_company_name||r.name||r.reference_number||'—',request:r.description||r.topic||r.equipment_type||r.reference_number||'—',status:r.status||'new',date:r.created_at,id:r.id};
        records.push(record);
        if(type==='quote'&&r.created_at)events.push({type:'Quote request received',description:record.company,date:r.created_at,icon:'▤',target:'quote',id:r.id});
      }
    });
    records.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
    const rows=$('#dashboardCrmRows');
    if(rows)rows.innerHTML=records.slice(0,5).map(r=>`<tr><td><span class="crm-type-icon" aria-hidden="true">${r.type==='carrier'?'▰':r.type==='shipper'?'♧':r.type==='inquiry'?'☏':'▤'}</span> ${esc(r.label)}</td><td>${esc(r.company)}</td><td>${esc(r.request)}</td><td><span class="status-pill ${esc(String(r.status).toLowerCase().replace(/[^a-z-]/g,''))}">${esc(r.status)}</span></td><td>${r.date?esc(new Date(r.date).toLocaleDateString(undefined,{month:'short',day:'numeric'})):'—'}</td></tr>`).join('')||'<tr><td colspan="5">No CRM records yet.</td></tr>';
    events.sort((a,b)=>new Date(b.date)-new Date(a.date));
    const firstQuote=events.find(e=>e.target==='quote');
    const quoteDetail=$('#priorityQuoteDetail');
    if(quoteDetail&&firstQuote)quoteDetail.textContent=firstQuote.description+' · '+new Date(firstQuote.date).toLocaleDateString(undefined,{month:'short',day:'numeric'});
    const lastPost=events.find(e=>e.target==='blog');
    const contentDetail=$('#priorityContentDetail');
    if(contentDetail&&lastPost)contentDetail.textContent='Latest: '+lastPost.description;

    const trend=document.querySelector('#dashboardActivityTrend');
    if(trend){
      const period=Number($('#dashboardPeriod')?.value||30);
      const today=new Date();
      const days=Array.from({length:period},(_,i)=>{const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-(period-1-i));return {key:d.toLocaleDateString('en-CA'),label:d.toLocaleDateString(undefined,{month:'short',day:'numeric'}),quotes:0,posts:0}});
      for(const e of events){const d=new Date(e.date);if(!Number.isFinite(d.getTime()))continue;const key=new Date(d.getFullYear(),d.getMonth(),d.getDate()).toLocaleDateString('en-CA');const target=days.find(v=>v.key===key);if(target)target[e.target==='blog'?'posts':'quotes']++;}
      const groups=period===30?6:7, buckets=Array.from({length:groups},(_,i)=>{const lo=Math.floor(i*period/groups),hi=Math.floor((i+1)*period/groups);return {label:days[Math.min(hi-1,period-1)].label,quotes:days.slice(lo,hi).reduce((n,x)=>n+x.quotes,0),posts:days.slice(lo,hi).reduce((n,x)=>n+x.posts,0)};});
      const max=Math.max(1,...buckets.map(v=>v.quotes+v.posts));const W=600,H=220,left=38,right=14,bottom=28,top=35,base=H-bottom,step=(W-left-right)/buckets.length;
      const grid=Array.from({length:5},(_,i)=>{const y=top+i*(base-top)/4;const val=Math.round(max*(4-i)/4);return `<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#e5ecf6"/><text x="${left-10}" y="${y+4}" text-anchor="end" fill="#51677f" font-size="10">${val}</text>`;}).join('');
      const bars=buckets.map((v,i)=>{const x=left+i*step+step*.22;const h=v.quotes/max*(base-top);return `<rect x="${x}" y="${base-h}" width="${step*.56}" height="${Math.max(0,h)}" rx="2" fill="#77b6ff"/><text x="${left+i*step+step/2}" y="${H-8}" text-anchor="middle" font-size="10" fill="#536b86">${v.label}</text>`;}).join('');
      const points=buckets.map((v,i)=>({x:left+i*step+step/2,y:base-((v.quotes+v.posts)/max)*(base-top)}));
      const line=points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ');
      const dots=points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#0755b8"/>`).join('');
      trend.innerHTML=`<div class="dashboard-chart-legend"><span><i class="bar-key"></i> Quote Requests</span><span><i class="line-key"></i> Total Activity</span></div><svg role="img" aria-label="Real quote requests and total recorded activity for the last ${period} days" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${bars}<path d="${line}" stroke="#0755b8" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;

    }

    const relativeTime=d=>{const ms=Date.now()-new Date(d).getTime();if(!Number.isFinite(ms)||ms<0)return new Date(d).toLocaleDateString();const min=Math.floor(ms/60000);if(min<60)return min<=1?'Just now':min+' min ago';const h=Math.floor(min/60);if(h<24)return h+' hour'+(h===1?'':'s')+' ago';const days=Math.floor(h/24);return days===1?'Yesterday':days<7?days+' days ago':new Date(d).toLocaleDateString()};
    $('#recentActivity').innerHTML=events.slice(0,5).map(e=>`<button type="button" class="recent-item recent-action" data-activity-target="${esc(e.target)}" data-activity-id="${esc(e.id)}"><span class="recent-item-icon" aria-hidden="true">${e.icon}</span><span class="recent-item-main"><strong>${esc(e.type)}</strong><small>${esc(e.description)}</small></span><time datetime="${esc(e.date)}">${esc(relativeTime(e.date))}</time></button>`).join('')||'<p class="dashboard-empty">No recent quote or publishing activity yet.</p>';
    $$('#recentActivity [data-activity-target]').forEach(btn=>btn.addEventListener('click',()=>{
      if(btn.dataset.activityTarget==='blog'){editPost(btn.dataset.activityId).catch(err=>console.warn('Unable to open post:',err));return;}
      $('#crmType').value='quote';$('#crmSearch').value='';$('#crmStatus').value='';
      activate('crm');
      // CRM is already loading from activate(); the detail endpoint can be opened directly.
      openCrm(btn.dataset.activityId).catch(err=>console.warn('Unable to open quote:',err));
    }));
  }
  $('[data-refresh-dashboard]')?.addEventListener('click',refreshDashboard);
  async function loadTasks(){const j=await api('tasks');const rows=j.tasks||[];
    const open=rows.filter(t=>!['done','completed','closed','cancelled'].includes(String(t.status||'').toLowerCase()));
    const taskTitle=$('#priorityTaskTitle'),taskDetail=$('#priorityTaskDetail');
    if(taskTitle)taskTitle.textContent=open.length?open.length+' open '+(open.length===1?'task':'tasks'):'All tasks complete';
    if(taskDetail)taskDetail.textContent=open.length?(open[0].title||'Review operational follow-ups'):'No outstanding action items';
    $('#tasksBody').innerHTML=rows.map(t=>`<tr><td><span class="status-pill">${esc(t.priority)}</span></td><td><strong>${esc(t.title)}</strong><br><small>${esc(t.description||'')}</small></td><td>${esc(t.entity_type)}<br><small>${esc(t.entity_id)}</small></td><td>${dt(t.due_at)}</td><td><span class="status-pill ${esc(t.status)}">${esc(t.status)}</span></td></tr>`).join('')||'<tr><td colspan="5">No open tasks.</td></tr>';$('#dashboardTasks').innerHTML=rows.slice(0,4).map(t=>`<div class="dashboard-task"><span class="task-priority">${esc(t.priority||'normal')}</span><div><strong>${esc(t.title)}</strong><small>${t.due_at?'Due '+esc(dt(t.due_at)):'No due date'}</small></div></div>`).join('')||'<div class="dashboard-empty"><span class="dashboard-empty-mark">✓</span><strong>All caught up</strong><small>No open tasks need your attention.</small><button type="button" class="dashboard-empty-link" data-admin-go="tasks">Go to tasks →</button></div>';$('#dashboardTasks [data-admin-go]')?.addEventListener('click',()=>activate('tasks'));}
  $('#dashboardPeriod')?.addEventListener('change',()=>loadRecentActivity().catch(console.warn));
  $('#tasksRefresh')?.addEventListener('click',loadTasks);
  const crmCols={quote:[['Reference','reference_number'],['Company','company_name'],['Contact','contact_name'],['Route',r=>`${r.pickup_city||''}, ${r.pickup_state||''} → ${r.delivery_city||''}, ${r.delivery_state||''}`],['Equipment','equipment_type'],['Status','status'],['Submitted','created_at']],shipper:[['Reference','reference_number'],['Company','company_name'],['Contact','primary_contact_name'],['Email','primary_contact_email'],['Industry','industry'],['Status','status'],['Created','created_at']],carrier:[['Reference','reference_number'],['Company','legal_company_name'],['Contact','primary_contact_name'],['USDOT','dot_number'],['MC','mc_number'],['Status','status'],['Created','created_at']],inquiry:[['Reference','reference_number'],['Company','company_name'],['Name','name'],['Email','email'],['Topic','topic'],['Status','status'],['Created','created_at']]};
  async function loadCrm(){state.crmType=$('#crmType').value;const j=await api('crm_list',{entity_type:state.crmType,q:$('#crmSearch').value,status:$('#crmStatus').value,limit:100});state.crmRows=j.rows||[];$('#crmCount').textContent=`${j.count} records`;const cols=crmCols[state.crmType];$('#crmHead').innerHTML='<tr>'+cols.map(c=>`<th>${esc(c[0])}</th>`).join('')+'</tr>';$('#crmBody').innerHTML=state.crmRows.map(r=>'<tr data-id="'+r.id+'">'+cols.map(([l,k])=>{let v=typeof k==='function'?k(r):r[k];if(k==='status')return `<td><span class="status-pill ${esc(v||'new')}">${esc(v||'new')}</span></td>`;if(k==='created_at')v=dt(v);return `<td>${esc(v||'—')}</td>`;}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length}">No records found.</td></tr>`;$$('#crmBody tr[data-id]').forEach(tr=>tr.addEventListener('click',()=>openCrm(tr.dataset.id)));}
  $('#crmType').addEventListener('change',loadCrm);$('#crmRefresh').addEventListener('click',loadCrm);$('#crmSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadCrm()});
  function titleFor(type,r){return type==='carrier'?r.legal_company_name:type==='shipper'?r.company_name:type==='quote'?r.company_name:(r.company_name||r.name);}
  async function openCrm(id){const j=await api('crm_detail',{entity_type:state.crmType,entity_id:id});state.currentRecord={type:state.crmType,...j};const r=j.record;$('#drawerTitle').textContent=titleFor(state.crmType,r)||'CRM Record';$('#drawerRef').textContent=r.reference_number||id;const hidden=new Set(['upload_token_hash','campaign']);const fields=Object.entries(r).filter(([k,v])=>!hidden.has(k)&&v!==null&&v!==''&&typeof v!=='object').map(([k,v])=>`<div class="detail-item"><span>${esc(k.replaceAll('_',' '))}</span><strong>${esc(k.endsWith('_at')?dt(v):v)}</strong></div>`).join('');const statusOptions=['new','pending','reviewing','approved','quoted','won','lost','completed','rejected','cancelled'];const notes=(j.notes||[]).map(n=>`<div class="timeline-item"><div>${esc(n.note)}</div><small>${dt(n.created_at)}</small></div>`).join('')||'<p>No notes yet.</p>';const tasks=(j.tasks||[]).map(t=>`<div class="timeline-item"><strong>${esc(t.title)}</strong><div>${esc(t.description||'')}</div><small>${esc(t.priority)} · ${esc(t.status)} · ${dt(t.due_at)}</small></div>`).join('')||'<p>No tasks yet.</p>';$('#drawerBody').innerHTML=`<div class="toolbar-row"><select id="drawerStatus">${statusOptions.map(s=>`<option ${String(r.status||'new')===s?'selected':''}>${s}</option>`).join('')}</select><button class="btn btn-primary" id="saveDrawerStatus">Update Status</button></div><div class="detail-grid">${fields}</div><div class="admin-card" style="margin-top:18px"><h3>Notes</h3><div class="timeline">${notes}</div><textarea id="newNote" placeholder="Add an internal note" style="margin-top:12px"></textarea><button id="addNote" class="btn btn-primary" style="margin-top:8px">Add Note</button></div><div class="admin-card" style="margin-top:18px"><h3>Tasks</h3><div class="timeline">${tasks}</div><div class="form-grid" style="margin-top:12px"><div class="field full"><label>Task<input id="taskTitle"></label></div><div class="field"><label>Due<input id="taskDue" type="datetime-local"></label></div><div class="field"><label>Priority<select id="taskPriority"><option>normal</option><option>high</option><option>urgent</option><option>low</option></select></label></div><div class="field full"><label>Description<textarea id="taskDescription"></textarea></label></div></div><button id="addTask" class="btn btn-gold">Create Task</button></div>`;$('#drawerBackdrop').classList.add('open');$('#crmDrawer').classList.add('open');$('#saveDrawerStatus').onclick=async()=>{await api('crm_status',{entity_type:state.crmType,entity_id:id,status:$('#drawerStatus').value});await openCrm(id);await loadCrm();};$('#addNote').onclick=async()=>{const note=$('#newNote').value.trim();if(!note)return;await api('crm_note',{entity_type:state.crmType,entity_id:id,note});await openCrm(id);};$('#addTask').onclick=async()=>{const title=$('#taskTitle').value.trim();if(!title)return;await api('task_save',{entity_type:state.crmType,entity_id:id,title,description:$('#taskDescription').value,due_at:$('#taskDue').value?new Date($('#taskDue').value).toISOString():null,priority:$('#taskPriority').value});await openCrm(id);await loadTasks();};}
  function closeDrawer(){$('#drawerBackdrop').classList.remove('open');$('#crmDrawer').classList.remove('open')}$('#drawerClose').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;
  async function loadPosts(){const j=await api('blog_list');state.posts=j.posts||[];renderPosts();}
  function renderPosts(){if(!$('#postsBody'))return;const q=$('#postSearch').value.toLowerCase(),st=$('#postStatus').value;const rows=state.posts.filter(p=>(!q||p.title.toLowerCase().includes(q)||p.slug.includes(q))&&(!st||p.status===st));$('#postsBody').innerHTML=rows.map(p=>`<tr data-post-id="${p.id}"><td><strong>${esc(p.title)}</strong><br><small>/${esc(p.slug)}</small></td><td>${esc(p.nta_blog_categories?.name||'—')}</td><td><span class="status-pill ${esc(p.status)}">${esc(p.status)}</span></td><td>${dt(p.status==='scheduled'?p.scheduled_at:p.published_at)}</td><td>${dt(p.updated_at)}</td></tr>`).join('')||'<tr><td colspan="5">No posts found.</td></tr>';$$('#postsBody tr[data-post-id]').forEach(tr=>tr.addEventListener('click',()=>editPost(tr.dataset.postId)));}
  $('#postSearch').addEventListener('input',renderPosts);$('#postStatus').addEventListener('change',renderPosts);
  async function loadTaxonomy(){const j=await api('blog_taxonomy');state.categories=j.categories||[];state.tags=j.tags||[];$('#postCategory').innerHTML='<option value="">No category</option>'+state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');renderCategories();}
  function renderCategories(){if(!$('#categoryList'))return;$('#categoryList').innerHTML=state.categories.map(c=>`<div class="timeline-item"><strong>${esc(c.name)}</strong><br><small>/${esc(c.slug)}</small><p>${esc(c.description||'')}</p></div>`).join('')||'<p>No categories.</p>';}
  $('#saveCategory').addEventListener('click',async()=>{await api('category_save',{name:$('#categoryName').value,slug:$('#categorySlug').value,description:$('#categoryDescription').value});$('#categoryName').value=$('#categorySlug').value=$('#categoryDescription').value='';await loadTaxonomy();});
  function resetEditor(){state.post={id:crypto.randomUUID(),title:'',slug:'',excerpt:'',content_html:'',content_text:'',status:'draft',category_id:null,tags:[],author_name:'NTA Logistics',featured_image_path:'',featured_image_alt:'',seo_title:'',seo_description:'',canonical_url:'',scheduled_at:null,published_at:null};fillEditor();state.dirty=false;activate('editor');}
  $$('[data-new-post]').forEach(b=>b.addEventListener('click',resetEditor));
  async function editPost(id){const j=await api('blog_get',{id});state.post={...j.post,tags:(j.tags||[]).map(t=>t.name)};fillEditor();state.dirty=false;activate('editor');}
  function fillEditor(){const p=state.post;$('#editorHeading').textContent=p.title?'Edit Blog Post':'New Blog Post';$('#postTitle').value=p.title||'';$('#postExcerpt').value=p.excerpt||'';$('#richEditor').innerHTML=p.content_html||'';$('#postStatusEditor').value=p.status||'draft';$('#postScheduledAt').value=p.scheduled_at?new Date(p.scheduled_at).toISOString().slice(0,16):'';$('#postAuthor').value=p.author_name||'NTA Logistics';$('#postCategory').value=p.category_id||'';$('#postTags').value=(p.tags||[]).join(', ');$('#postSlug').value=p.slug||'';$('#featuredImagePath').value=p.featured_image_path||'';$('#featuredImageAlt').value=p.featured_image_alt||'';$('#seoTitle').value=p.seo_title||'';$('#seoDescription').value=p.seo_description||'';$('#canonicalUrl').value=p.canonical_url||'';updateFeaturedPreview();$('#saveState').textContent='Loaded';}
  const editorInputs=['#postTitle','#postExcerpt','#richEditor','#postStatusEditor','#postScheduledAt','#postAuthor','#postCategory','#postTags','#postSlug','#featuredImageAlt','#seoTitle','#seoDescription','#canonicalUrl'];editorInputs.forEach(sel=>$(sel)?.addEventListener('input',()=>{state.dirty=true;$('#saveState').textContent='Unsaved changes';if(sel==='#postTitle'&&!$('#postSlug').value)$('#postSlug').value=slugify($('#postTitle').value);}));
  $$('.editor-toolbar [data-command]').forEach(b=>b.addEventListener('click',()=>{let val=null;if(b.dataset.command==='createLink')val=prompt('Paste the link URL');document.execCommand(b.dataset.command,false,val);$('#richEditor').focus();state.dirty=true;}));$$('.editor-toolbar [data-format]').forEach(s=>s.addEventListener('change',()=>{document.execCommand(s.dataset.format,false,s.value);$('#richEditor').focus();state.dirty=true;}));
  function collectPost(statusOverride){const status=statusOverride||$('#postStatusEditor').value;return {id:state.post?.id,title:$('#postTitle').value.trim(),slug:$('#postSlug').value.trim()||slugify($('#postTitle').value),excerpt:$('#postExcerpt').value.trim(),content_html:$('#richEditor').innerHTML,content_text:$('#richEditor').innerText,category_id:$('#postCategory').value||null,tags:$('#postTags').value.split(',').map(x=>x.trim()).filter(Boolean),featured_image_path:$('#featuredImagePath').value,featured_image_alt:$('#featuredImageAlt').value,author_name:$('#postAuthor').value,status,scheduled_at:$('#postScheduledAt').value?new Date($('#postScheduledAt').value).toISOString():null,published_at:state.post?.published_at||null,seo_title:$('#seoTitle').value,seo_description:$('#seoDescription').value,canonical_url:$('#canonicalUrl').value};}
  async function savePost(status){const p=collectPost(status);if(!p.title)throw new Error('Add a post title first.');if(p.status==='scheduled'&&!p.scheduled_at)throw new Error('Choose a schedule date and time.');const j=await api('blog_save',{post:p});state.post={...j.post,tags:p.tags};state.dirty=false;$('#saveState').textContent='Saved '+new Date().toLocaleTimeString();$('#saveState').classList.add('saved');await loadPosts();return j;}
  $('#saveDraft').onclick=()=>savePost('draft').catch(e=>alert(e.message));$('#publishPost').onclick=()=>savePost($('#postStatusEditor').value==='scheduled'?'scheduled':'published').catch(e=>alert(e.message));$('#archivePost').onclick=async()=>{if(!state.post?.id||!confirm('Archive this post?'))return;await api('blog_archive',{id:state.post.id});await loadPosts();activate('blog');};
  state.autosave=setInterval(()=>{if(state.dirty&&$('#postTitle').value.trim()&&$('.admin-panel[data-panel="editor"]').classList.contains('active'))savePost('draft').catch(()=>{});},30000);
  $('#previewPost').onclick=()=>{$('#previewTitle').textContent=$('#postTitle').value||'Untitled';$('#previewExcerpt').textContent=$('#postExcerpt').value;$('#previewContent').innerHTML=$('#richEditor').innerHTML;$('#previewCategory').textContent=state.categories.find(c=>c.id===$('#postCategory').value)?.name||'NTA Logistics';$('#previewModal').classList.add('open');};$('#closePreview').onclick=()=>$('#previewModal').classList.remove('open');
  async function loadMedia(){const j=await api('media_list');state.media=j.media||[];renderMedia();}
  function mediaUrl(path){return `${cfg.blogFunctionUrl}?media=${encodeURIComponent(path)}`}
  function renderMedia(){if(!$('#mediaGrid'))return;$('#mediaGrid').innerHTML=state.media.map(m=>`<div class="media-card" data-media-path="${esc(m.storage_path)}"><img src="${mediaUrl(m.storage_path)}" alt="${esc(m.alt_text||'')}"><div><strong>${esc(m.file_name)}</strong><br><small>${esc(m.alt_text||'No alt text')}</small><br><button class="btn btn-ghost choose-media" style="width:100%;margin-top:8px">Use as Featured</button><button class="btn btn-primary insert-media" style="width:100%;margin-top:6px">Insert in Article</button></div></div>`).join('')||'<p>No media uploaded.</p>';$$('.choose-media').forEach(b=>b.addEventListener('click',()=>{const card=b.closest('[data-media-path]');const m=state.media.find(x=>x.storage_path===card.dataset.mediaPath);$('#featuredImagePath').value=m.storage_path;$('#featuredImageAlt').value=m.alt_text||'';updateFeaturedPreview();state.dirty=true;activate('editor');}));$$('.insert-media').forEach(b=>b.addEventListener('click',()=>{const card=b.closest('[data-media-path]');const m=state.media.find(x=>x.storage_path===card.dataset.mediaPath);activate('editor');const ed=$('#richEditor');ed.focus();document.execCommand('insertImage',false,mediaUrl(m.storage_path));const imgs=[...ed.querySelectorAll('img')];const img=imgs[imgs.length-1];if(img){img.alt=m.alt_text||'';img.loading='lazy';}state.dirty=true;$('#saveState').textContent='Unsaved changes';}));}
  function updateFeaturedPreview(){const p=$('#featuredImagePath').value;$('#featuredPreview').src=p?mediaUrl(p):'';}
  $('#chooseFeatured').onclick=()=>activate('media');
  $('#uploadMedia').onclick=async()=>{const file=$('#mediaFile').files[0];if(!file)return alert('Choose an image first.');const signed=await api('media_upload_url',{file_name:file.name,mime_type:file.type,file_size:file.size});const {error}=await sb.storage.from(signed.bucket).uploadToSignedUrl(signed.path,signed.token,file,{contentType:file.type});if(error)throw error;await api('media_attach',{storage_path:signed.path,file_name:file.name,mime_type:file.type,file_size:file.size,alt_text:$('#mediaAlt').value});$('#mediaFile').value='';$('#mediaAlt').value='';await loadMedia();};
  async function loadTeam(){const j=await api('team');$('#teamBody').innerHTML=(j.team||[]).map(u=>`<tr><td>${esc(u.display_name||'—')}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.active?'Yes':'No'}</td><td>${dt(u.created_at)}</td></tr>`).join('')||'<tr><td colspan="5">No team members.</td></tr>';}
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});

  // Compact account dropdown and persistent font preferences.
  const accountMenuToggle=$('#accountMenuToggle');
  const accountDropdown=$('#accountDropdown');
  function closeAccountMenu(){
    accountDropdown.hidden=true;
    accountMenuToggle.setAttribute('aria-expanded','false');
  }
  accountMenuToggle.addEventListener('click',()=>{
    const opening=accountDropdown.hidden;
    accountDropdown.hidden=!opening;
    accountMenuToggle.setAttribute('aria-expanded',String(opening));
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.portal-account'))closeAccountMenu();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')closeAccountMenu();
  });
  $$('[data-admin-go]').forEach(button=>button.addEventListener('click',closeAccountMenu));
  const fontSizeSlider=$('#portalFontSize');
  const fontSizeOutput=$('#portalFontSizeValue');
  const fontSizeReset=$('#resetPortalFontSize');
  const clampFontSize=value=>{
    const n=Number(value);
    return Number.isFinite(n)?Math.max(80,Math.min(125,Math.round(n/5)*5)):100;
  };
  function setPortalFontSize(value){
    const size=clampFontSize(value);
    document.documentElement.style.setProperty('--nta-font-scale',String(size/100));
    fontSizeSlider.value=String(size);
    fontSizeOutput.value=size+'%';
    fontSizeOutput.textContent=size+'%';
    try{localStorage.setItem('nta-admin-font-size',String(size))}catch{}
  }
  let initialFontSize=100;
  try{initialFontSize=clampFontSize(localStorage.getItem('nta-admin-font-size')||100)}catch{}
  setPortalFontSize(initialFontSize);
  fontSizeSlider.addEventListener('input',()=>setPortalFontSize(fontSizeSlider.value));
  fontSizeReset.addEventListener('click',()=>setPortalFontSize(100));
  // Executive portal shell interactions; existing panel handlers remain unchanged.
  const sidebarToggle=$('#sidebarToggle');
  function syncSidebarToggle(){
    const shell=$('#adminApp');
    const mobile=window.matchMedia('(max-width:760px)').matches;
    const visible=mobile?shell.classList.contains('sidebar-open'):!shell.classList.contains('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded',String(visible));
    sidebarToggle.setAttribute('aria-label',visible?'Hide sidebar':'Show sidebar');
    sidebarToggle.title=visible?'Hide sidebar':'Show sidebar';
    // Panel icon, not a directional arrow. The visible sidebar is indicated by the filled rail.
    sidebarToggle.innerHTML=visible
      ? '<svg class="sidebar-toggle-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16"/><path d="M5.5 10h2.5M5.5 14h2.5"/></svg>'
      : '<svg class="sidebar-toggle-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16"/><path d="M13 9h5M13 12h5M13 15h5"/></svg>';
  }
  sidebarToggle?.addEventListener('click',()=>{
    const shell=$('#adminApp');
    if(window.matchMedia('(max-width:760px)').matches) shell.classList.toggle('sidebar-open');
    else {
      shell.classList.toggle('sidebar-collapsed');
      try{localStorage.setItem('nta-sidebar-collapsed',shell.classList.contains('sidebar-collapsed')?'true':'false')}catch{}
    }
    syncSidebarToggle();
  });
  try{if(localStorage.getItem('nta-sidebar-collapsed')==='true')$('#adminApp').classList.add('sidebar-collapsed')}catch{}
  syncSidebarToggle();
  window.addEventListener('resize',syncSidebarToggle);
  $$('[data-admin-go]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.adminGo)));
  $$('.admin-nav button').forEach(b=>b.addEventListener('click',()=>{
    if(window.matchMedia('(max-width:760px)').matches)$('#adminApp').classList.remove('sidebar-open');
    syncSidebarToggle();
    $$('.admin-nav button').forEach(n=>n.classList.remove('active'));
    b.classList.add('active');
  }));
  boot();
})();
