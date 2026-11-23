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
    const role=state.admin?.role||'Administrator';
    const status=state.admin?.active===false?'Inactive':state.admin?.active===true?'Active':'Pending verification';
    $('#accountMenuRole').textContent=role;
    $('#accountMenuStatus').textContent=status;
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
    await restoreWorkspaceRoute();
  }
  /* Hash URLs identify full management pages. Browser Back/Forward restores
     the same page and, for CRM records, re-fetches the selected record. */
  async function restoreWorkspaceRoute(){
    if(!state.session)return;
    let parts=[];
    try{parts=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);}catch{return;}
    const [section,type,id]=parts;
    if(section==='crm'&&['quote','shipper','carrier','inquiry'].includes(type)){
      state.crmType=type;$('#crmType').value=type;
      if(id){await openCrm(id,type,{skipHistory:true});return;}
      activate('crm',{skipHistory:true});return;
    }
    if(section==='accounts'&&['shipper','carrier'].includes(type)){
      if(id&&window.NTAAccountsEdit){await window.NTAAccountsEdit(type,id,{skipHistory:true});return;}
      if(window.NTAAccountsOpen){await window.NTAAccountsOpen(type,{skipHistory:true});return;}
    }
    if(section==='factoring'){
      if(type&&window.NTAFactoringEdit){await window.NTAFactoringEdit(type,{skipHistory:true});return;}
      if(window.NTAFactoringOpen){await window.NTAFactoringOpen({skipHistory:true});return;}
    }
    if(section==='posts'&&type==='preview'){activate('article-preview',{skipHistory:true});return;}
    if(section==='posts'&&type==='edit'){
      if(id&&state.post?.id!==id){await editPost(id,{skipHistory:true});return;}
      activate('editor',{skipHistory:true});return;
    }
    if(section==='posts'&&type==='new'){activate('editor',{skipHistory:true});return;}
    if(section==='page'&&type==='categories'){
      history.replaceState({ntaPanel:'blog'},'','#/page/blog');
      activate('blog',{skipHistory:true});return;
    }
    const pages=['dashboard','crm','crm-detail','accounts','account-editor','factoring','factoring-editor','tasks','blog','editor','article-preview','media','profile','team'];
    if(section==='page'&&pages.includes(type)){activate(type,{skipHistory:true});return;}
    if(section==='overview'){activate('dashboard',{skipHistory:true});return;}
    activate('dashboard',{skipHistory:true});
  }
  window.addEventListener('popstate',()=>{if(state.session)restoreWorkspaceRoute().catch(error=>console.error('Navigation failed:',error));});
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
  $('#signOutBtn').addEventListener('click',async()=>{
    const button=$('#signOutBtn');
    button.disabled=true;
    try {
      const result=await sb.auth.signOut();
      if(result?.error)throw result.error;
      endIdleTracking();
      state.session=null;state.admin=null;
      $('#accountDropdown').hidden=true;
      $('#accountMenuToggle').setAttribute('aria-expanded','false');
      showAuth();
    } catch(error) {
      console.error('NTA sign-out error:',error);
      const message=$('#adminLoadStatus');
      if(message){message.hidden=false;message.textContent='Sign out could not be completed. Please try again.';}
    } finally {button.disabled=false;}
  });
  function activate(name,{skipHistory=false,hash=null}={}){
    if(name==='categories'){name='blog';hash='#/page/blog';}
    const parent={'crm-detail':'crm','account-editor':'accounts','factoring-editor':'factoring','article-preview':'editor'}[name]||name;
    $$('[data-admin-panel]').forEach(b=>b.classList.toggle('active',b.dataset.adminPanel===parent));
    $$('.admin-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
    if(!skipHistory){const url=hash||'#/page/'+encodeURIComponent(name);if(location.hash!==url)history.pushState({ntaPanel:name},'',url);}
    const labels={dashboard:'Overview',crm:'Intake Center','crm-detail':'Record Details',accounts:'Business Accounts','account-editor':'Account Management',factoring:'Factoring Companies','factoring-editor':'Factoring Company',tasks:'My Tasks',blog:'Articles',editor:'Blog Editor','article-preview':'Article Preview',media:'Media Library',profile:'My Account',team:'Team & Users'};
    if($('#ntaPageLabel'))$('#ntaPageLabel').textContent=labels[name]||'Management';
    if(name==='crm')loadCrm().catch(console.error);
    if(name==='blog')renderPosts();
    if(name==='media')renderMedia();
    if(name==='team')loadTeam().catch(console.error);
    window.scrollTo({top:0,behavior:'instant'});
  }
  window.NTAAdminNavigate=(name,hash,opts={})=>activate(name,{...opts,hash});
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
    const metricDescriptions={shippers:'Registered shipper accounts',carriers:'Active carrier directory',quotes:'Requests submitted through intake',open_tasks:'Outstanding operational tasks'};
    $('#metricCards').innerHTML=metricCards.map(({label,key,icon},i)=>{
      const available=key!==null&&Number.isFinite(Number(state.metrics[key]));
      const count=available?Number(state.metrics[key]).toLocaleString():'—';
      return `<button type="button" class="metric-card metric-action nta-kpi nta-kpi-${i+1}" ${available?`data-dashboard-metric="${key}"`:'disabled'} aria-label="${available?'View':'Unavailable:'} ${esc(label)}"><span class="nta-kpi-header"><span class="nta-kpi-label">${esc(label)}</span><span class="nta-kpi-icon" aria-hidden="true">${cardIcons[icon]}</span></span><strong class="nta-kpi-value">${count}</strong><span class="nta-kpi-footer"><span>${esc(metricDescriptions[key]||'Business activity')}</span></span></button>`;
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
    if(rows)rows.innerHTML=records.slice(0,5).map(r=>`<tr data-record-id="${esc(r.id)}" data-record-type="${esc(r.type)}"><td><span class="crm-type-icon" aria-hidden="true">${r.type==='carrier'?'▰':r.type==='shipper'?'♧':r.type==='inquiry'?'☏':'▤'}</span> ${esc(r.label)}</td><td>${esc(r.company)}</td><td>${esc(r.request)}</td><td><span class="status-pill ${esc(String(r.status).toLowerCase().replace(/[^a-z-]/g,''))}">${esc(r.status)}</span></td><td>${r.date?esc(new Date(r.date).toLocaleDateString(undefined,{month:'short',day:'numeric'})):'—'}</td></tr>`).join('')||'<tr><td colspan="5">No CRM records yet.</td></tr>';
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
      const totalQuotes=buckets.reduce((n,b)=>n+b.quotes,0);
      const totalPosts=buckets.reduce((n,b)=>n+b.posts,0);
      const max=Math.max(1,...buckets.map(b=>b.quotes+b.posts));
      const sparkline=buckets.map((b,i)=>({x:8+i*(284/Math.max(1,buckets.length-1)),y:64-((b.quotes+b.posts)/max)*48}));
      const line=sparkline.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
      const quoteText=totalQuotes===1?'request':'requests';
      const postText=totalPosts===1?'post':'posts';
      trend.innerHTML=`<div class="nta-activity-totals"><div class="nta-activity-main"><span>Recorded activity</span><strong>${totalQuotes+totalPosts}</strong><small>Last ${period} days</small></div><div class="nta-activity-spark"><svg viewBox="0 0 300 75" role="img" aria-label="Recorded activity trend over the last ${period} days"><path d="M8 64 H292" stroke="#e6edf6" stroke-width="1.5" fill="none"/><path d="${line}" fill="none" stroke="#0754b8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>${sparkline.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#d7a21b"/>`).join('')}</svg></div></div><div class="nta-activity-breakdown"><div><span class="nta-activity-category"><i class="nta-dot-quote"></i> Quote requests</span><strong>${totalQuotes}</strong><small>${quoteText}</small><div class="nta-activity-track"><span style="width:${(totalQuotes/max)*100}%"></span></div></div><div><span class="nta-activity-category"><i class="nta-dot-post"></i> Published posts</span><strong>${totalPosts}</strong><small>${postText}</small><div class="nta-activity-track"><span style="width:${(totalPosts/max)*100}%"></span></div></div></div><div class="nta-activity-note">Based on recorded quotes and published posts in the selected period.</div>`;

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
    $('#tasksBody').innerHTML=rows.map(t=>`<tr><td><span class="status-pill">${esc(t.priority)}</span></td><td><strong>${esc(t.title)}</strong><br><small>${esc(t.description||'')}</small></td><td>${esc(t.entity_type)}<br><small>${esc(t.entity_id)}</small></td><td>${dt(t.due_at)}</td><td><span class="status-pill ${esc(t.status)}">${esc(t.status)}</span></td></tr>`).join('')||'<tr><td colspan="5">No open tasks.</td></tr>';$('#dashboardTasks').innerHTML=rows.slice(0,4).map(t=>`<div class="dashboard-task"><span class="task-priority">${esc(t.priority||'normal')}</span><div><strong>${esc(t.title)}</strong><small>${t.due_at?'Due '+esc(dt(t.due_at)):'No due date'}</small></div></div>`).join('')||'<div class="dashboard-empty nta-task-empty"><span class="dashboard-empty-mark">✓</span><strong>All caught up</strong><small>There are no outstanding tasks right now.</small><button type="button" class="dashboard-empty-link" data-admin-go="tasks">Open task manager</button></div>';$('#dashboardTasks [data-admin-go]')?.addEventListener('click',()=>activate('tasks'));}
  $('#dashboardPeriod')?.addEventListener('change',()=>loadRecentActivity().catch(console.warn));
  $('#tasksRefresh')?.addEventListener('click',loadTasks);
  const crmCols={quote:[['Reference','reference_number'],['Company','company_name'],['Contact','contact_name'],['Route',r=>`${r.pickup_city||''}, ${r.pickup_state||''} → ${r.delivery_city||''}, ${r.delivery_state||''}`],['Equipment','equipment_type'],['Status','status'],['Submitted','created_at']],shipper:[['Reference','reference_number'],['Company','company_name'],['Contact','primary_contact_name'],['Email','primary_contact_email'],['Industry','industry'],['Status','status'],['Created','created_at']],carrier:[['Reference','reference_number'],['Company','legal_company_name'],['Contact','primary_contact_name'],['USDOT','dot_number'],['MC','mc_number'],['Status','status'],['Created','created_at']],inquiry:[['Reference','reference_number'],['Company','company_name'],['Name','name'],['Email','email'],['Topic','topic'],['Status','status'],['Created','created_at']]};
  async function loadCrm(){
    const selector=$('#crmType');
    const requestedType=selector?.value;
    const validTypes=['quote','shipper','carrier','inquiry'];
    if(!validTypes.includes(requestedType)){
      const error=new Error('Invalid CRM selection. Choose a valid intake category.');
      console.error('CRM type validation blocked invalid request:',requestedType);
      const status=$('#crmCount');
      if(status)status.textContent=error.message;
      return;
    }
    state.crmType=requestedType;
    const j=await api('crm_list',{entity_type:requestedType,q:$('#crmSearch').value,status:$('#crmStatus').value,limit:100});state.crmRows=j.rows||[];$('#crmCount').textContent=`${j.count} records`;const cols=crmCols[state.crmType];$('#crmHead').innerHTML='<tr>'+cols.map(c=>`<th>${esc(c[0])}</th>`).join('')+'</tr>';$('#crmBody').innerHTML=state.crmRows.map(r=>'<tr role="link" tabindex="0" data-id="'+esc(r.id)+'">'+cols.map(([l,k])=>{let v=typeof k==='function'?k(r):r[k];if(k==='status')return `<td><span class="status-pill ${esc(v||'new')}">${esc(v||'new')}</span></td>`;if(k==='created_at')v=dt(v);return `<td>${esc(v||'—')}</td>`;}).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length}">No records found.</td></tr>`;$$('#crmBody tr[data-id]').forEach(tr=>{
 tr.addEventListener('click',event=>{if(event.target.closest('button,select,input,textarea'))return;openCrm(tr.dataset.id).catch(console.error);});
 tr.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();openCrm(tr.dataset.id).catch(console.error);}});
});}
  $('#crmType').addEventListener('change',loadCrm);$('#crmRefresh').addEventListener('click',loadCrm);$('#crmSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadCrm()});
  function titleFor(type,r){return type==='carrier'?r.legal_company_name:type==='shipper'?r.company_name:type==='quote'?r.company_name:(r.company_name||r.name);}
  async function openCrm(id,type=state.crmType,{skipHistory=false}={}){
    if(!['quote','shipper','carrier','inquiry'].includes(type)||!id)throw Error('Invalid CRM record');
    state.crmType=type;$('#crmType').value=type;
    activate('crm-detail',{skipHistory:true});
    if(!skipHistory)history.pushState({ntaRecord:id},'','#/crm/'+encodeURIComponent(type)+'/'+encodeURIComponent(id));
    $('#crmRecordBody').textContent='Loading record…';
    $('#crmRecordFeedback').hidden=true;
    try{
    const j=await api('crm_detail',{entity_type:type,entity_id:id});state.currentRecord={type:state.crmType,...j};const r=j.record;$('#crmRecordTitle').textContent=titleFor(state.crmType,r)||'CRM Record';$('#crmRecordRef').textContent=r.reference_number||id;$('#crmRecordCategory').textContent=({quote:'Quote request',shipper:'Shipper application',carrier:'Carrier application',inquiry:'General inquiry'})[type];if(!window.NTACrmManagementView||typeof window.NTACrmManagementView.render!=='function')throw new Error('Record management view did not load. Refresh this page.');
    const detailSummary=$('#crmRecordSummary');
    if(detailSummary)detailSummary.textContent=window.NTACrmManagementView.summary(type,r);
    $('#crmRecordBody').innerHTML=window.NTACrmManagementView.render(type,r,j);
    $('#crmRecordFeedback').hidden=true;$('#saveRecordStatus').onclick=async()=>{await api('crm_status',{entity_type:state.crmType,entity_id:id,status:$('#recordStatus').value});await openCrm(id,type,{skipHistory:true});await loadCrm();};$('#addNote').onclick=async()=>{const note=$('#newNote').value.trim();if(!note)return;await api('crm_note',{entity_type:state.crmType,entity_id:id,note});await openCrm(id,type,{skipHistory:true});};$('#addTask').onclick=async()=>{const title=$('#taskTitle').value.trim();if(!title)return;await api('task_save',{entity_type:state.crmType,entity_id:id,title,description:$('#taskDescription').value,due_at:$('#taskDue').value?new Date($('#taskDue').value).toISOString():null,priority:$('#taskPriority').value});await openCrm(id,type,{skipHistory:true});await loadTasks();};}catch(error){
    $('#crmRecordFeedback').hidden=false;
    $('#crmRecordFeedback').textContent='Unable to load or update this record: '+(error?.message||'Request failed');
    console.error('CRM record error:',error);
  }}
  $('#crmBackToList').addEventListener('click',()=>activate('crm',{hash:'#/crm/'+encodeURIComponent(state.crmType)}));
  window.NTAOpenCrmRecord=(type,id)=>openCrm(id,type);
    async function loadPosts(){const j=await api('blog_list');state.posts=j.posts||[];renderPosts();renderCategories();}
  function renderPosts(){
    if(!$('#postsBody'))return;
    const list=state.posts||[],query=$('#postSearch').value.toLowerCase().trim(),status=$('#postStatus').value,category=$('#postCategoryFilter')?.value||'';
    const selectedCategory=(state.categories||[]).find(c=>c.id===category);
    const visible=list.filter(p=>(!query||(p.title||'').toLowerCase().includes(query)||(p.slug||'').toLowerCase().includes(query))&&(!status||p.status===status)&&(!category||p.category_id===category||(selectedCategory&&p.nta_blog_categories?.name===selectedCategory.name)));
    const counts={all:list.length,published:list.filter(p=>p.status==='published').length,draft:list.filter(p=>p.status==='draft').length,scheduled:list.filter(p=>p.status==='scheduled').length};
    for(const [key,n] of Object.entries(counts)){const target=$('#blogCount'+key[0].toUpperCase()+key.slice(1));if(target)target.textContent=String(n);}
    if($('#blogResultCount'))$('#blogResultCount').textContent=visible.length+' of '+list.length+' posts';
    $('#postsBody').innerHTML=visible.map(p=>{
      const type=esc(p.status||'draft'),id=esc(p.id),title=esc(p.title||'Untitled post');
      return `<tr><td><strong class="nta27-post-title">${title}</strong><small class="nta27-post-slug">/${esc(p.slug||'')}</small></td>
        <td>${esc(p.nta_blog_categories?.name||'Uncategorized')}</td><td><span class="status-pill ${type}">${type}</span></td>
        <td>${dt(p.status==='scheduled'?p.scheduled_at:p.published_at)}</td><td>${dt(p.updated_at)}</td>
        <td><div class="nta27-post-actions"><button type="button" data-blog-post-action="edit" data-post-id="${id}" class="btn btn-primary">Edit</button>
          <button type="button" data-blog-post-action="preview" data-post-id="${id}" class="btn btn-ghost">Preview</button>
          <button type="button" data-blog-post-action="duplicate" data-post-id="${id}" class="btn btn-ghost">Duplicate</button></div></td></tr>`;
    }).join('')||'<tr><td colspan="6" class="nta27-no-posts">No blog posts match the selected filters.</td></tr>';
  }
  $('#postSearch').addEventListener('input',renderPosts);
  $('#postStatus').addEventListener('change',renderPosts);
  $('#postCategoryFilter').addEventListener('change',renderPosts);
  $('#blogClearFilters').addEventListener('click',()=>{$('#postSearch').value='';$('#postStatus').value='';$('#postCategoryFilter').value='';renderPosts();});
  $('#postsBody').addEventListener('click',event=>{
    const button=event.target.closest('[data-blog-post-action]');
    if(!button)return;
    const id=button.dataset.postId;
    button.disabled=true;
    const work=async()=>{
      if(button.dataset.blogPostAction==='duplicate'){
        const j=await api('blog_get',{id});const p=j.post||{};
        state.post={...p,id:crypto.randomUUID(),title:(p.title||'Untitled')+' (Copy)',slug:(p.slug||'blog-post')+'-copy-'+Math.random().toString(36).slice(2,7),status:'draft',published_at:null,scheduled_at:null,tags:(j.tags||[]).map(x=>x.name)};
        fillEditor();state.dirty=true;$('#saveState').textContent='Unsaved copy';activate('editor',{hash:'#/posts/new'});return;
      }
      await editPost(id);
      if(button.dataset.blogPostAction==='preview')$('#previewPost').click();
    };
    work().catch(error=>{if($('#blogListNotice'))$('#blogListNotice').textContent=error.message||'Unable to open this post.';}).finally(()=>{button.disabled=false});
  });
  async function loadTaxonomy(){const j=await api('blog_taxonomy');state.categories=j.categories||[];state.tags=j.tags||[];const selectedEditorCategory=$('#postCategory').value;$('#postCategory').innerHTML='<option value="">No category</option>'+state.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');if(state.categories.some(c=>c.id===selectedEditorCategory))$('#postCategory').value=selectedEditorCategory;
    const filter=$('#postCategoryFilter');
    if(filter){const choice=filter.value;filter.innerHTML='<option value="">All categories</option>'+state.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');filter.value=choice; }
    renderCategories();renderPosts();}
  let categorySlugManuallyEdited=false;
  const categoryFeedback=(message,error=false)=>{
    const el=$('#categoryFormMessage');
    if(!el)return;
    el.hidden=!message;el.textContent=message||'';el.dataset.kind=error?'error':'success';
  };
  function resetCategoryEditor(){
    $('#categoryId').value='';
    $('#categoryName').value='';
    $('#categorySlug').value='';
    $('#categoryDescription').value='';
    $('#categoryFormTitle').textContent='Add New Category';
    $('#saveCategory').textContent='Add Category';
    $('#cancelCategoryEdit').hidden=true;
    categorySlugManuallyEdited=false;
  }
  function renderCategories(){
    const list=$('#categoryList');
    if(!list)return;
    const categories=state.categories||[];
    $('#blogCategoryCount').textContent=categories.length+' '+(categories.length===1?'category':'categories');
    list.innerHTML=categories.map(c=>{
      const count=(state.posts||[]).filter(p=>p.category_id===c.id||p.nta_blog_categories?.name===c.name).length;
      return `<div class="nta28-category-row">
        <div class="nta28-category-row-main"><strong>${esc(c.name)}</strong><small>/${esc(c.slug)}</small>
          ${c.description?'<p>'+esc(c.description)+'</p>':''}</div>
        <div class="nta28-category-row-actions"><span>${count} ${count===1?'post':'posts'}</span>
          <button type="button" class="btn btn-ghost" data-category-edit="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">Edit</button>
        </div>
      </div>`;
    }).join('')||'<div class="nta28-category-empty">No categories yet. Add one using the form.</div>';
  }
  $('#categoryList').addEventListener('click',event=>{
    const button=event.target.closest('[data-category-edit]');
    if(!button)return;
    const category=state.categories.find(c=>c.id===button.dataset.categoryEdit);
    if(!category)return;
    $('#categoryId').value=category.id;
    $('#categoryName').value=category.name||'';
    $('#categorySlug').value=category.slug||'';
    $('#categoryDescription').value=category.description||'';
    $('#categoryFormTitle').textContent='Edit Category';
    $('#saveCategory').textContent='Save Changes';
    $('#cancelCategoryEdit').hidden=false;
    categorySlugManuallyEdited=true;
    categoryFeedback('');
    $('#categoryName').focus();
  });
  $('#categoryName').addEventListener('input',()=>{
    if(!$('#categoryId').value&&!categorySlugManuallyEdited)$('#categorySlug').value=slugify($('#categoryName').value);
  });
  $('#categorySlug').addEventListener('input',()=>{
    categorySlugManuallyEdited=!!$('#categorySlug').value.trim();
  });
  $('#cancelCategoryEdit').addEventListener('click',()=>{
    resetCategoryEditor();categoryFeedback('');
  });
  $('#categoryForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const id=$('#categoryId').value.trim();
    const name=$('#categoryName').value.trim();
    const slug=slugify($('#categorySlug').value.trim()||name);
    const description=$('#categoryDescription').value.trim();
    if(!name||!slug){categoryFeedback('Enter a valid category name.',true);return;}
    const duplicate=(state.categories||[]).find(c=>c.slug===slug&&c.id!==id);
    if(duplicate){categoryFeedback('A category with this URL slug already exists. Select Edit to update it.',true);return;}
    const button=$('#saveCategory');
    button.disabled=true;categoryFeedback('Saving category…');
    try{
      const payload={name,slug,description};
      if(id)payload.id=id;
      await api('category_save',payload);
      await loadTaxonomy();
      // Blog list responses include the category's name rather than its ID.
      // Refresh posts too, so a category rename updates the displayed post count.
      // A post-list refresh failure must not claim that the category save failed.
      try{await loadPosts()}catch(error){console.warn('Blog list refresh after category save:',error)}
      resetCategoryEditor();
      categoryFeedback(id?'Category updated successfully.':'Category created successfully.');
    }catch(error){
      categoryFeedback(error?.message||'Could not save category.',true);
    }finally{button.disabled=false}
  });
  function resetEditor(){state.post={id:crypto.randomUUID(),title:'',slug:'',excerpt:'',content_html:'',content_text:'',status:'draft',category_id:null,tags:[],author_name:'NTA Logistics',featured_image_path:'',featured_image_alt:'',seo_title:'',seo_description:'',canonical_url:'',scheduled_at:null,published_at:null};fillEditor();state.dirty=false;activate('editor',{hash:'#/posts/new'});}
  $$('[data-new-post]').forEach(b=>b.addEventListener('click',resetEditor));
  async function editPost(id,{skipHistory=false}={}){const j=await api('blog_get',{id});state.post={...j.post,tags:(j.tags||[]).map(t=>t.name)};fillEditor();state.dirty=false;activate('editor',{skipHistory,hash:'#/posts/edit/'+encodeURIComponent(id)});}
  function localEditorDateTime(value){
    if(!value)return '';
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  function fillEditor(){const p=state.post;$('#editorHeading').textContent='Blog Editor';if($('#blogEditingContext'))$('#blogEditingContext').textContent=p.title?'Editing: '+p.title:'Create a new article for the NTA Logistics blog.';$('#postTitle').value=p.title||'';$('#postExcerpt').value=p.excerpt||'';$('#richEditor').innerHTML=window.NTABlogEditor?.sanitizeHTML?.(p.content_html||'')??(p.content_html||'');$('#postStatusEditor').value=p.status||'draft';$('#postScheduledAt').value=localEditorDateTime(p.scheduled_at);$('#postAuthor').value=p.author_name||'NTA Logistics';$('#postCategory').value=p.category_id||'';$('#postTags').value=(p.tags||[]).join(', ');$('#postSlug').value=p.slug||'';$('#featuredImagePath').value=p.featured_image_path||'';$('#featuredImageAlt').value=p.featured_image_alt||'';$('#seoTitle').value=p.seo_title||'';$('#seoDescription').value=p.seo_description||'';$('#canonicalUrl').value=p.canonical_url||'';updateFeaturedPreview();window.NTABlogEditor?.refresh?.();$('#saveState').textContent='Loaded';}
  const editorInputs=['#postTitle','#postExcerpt','#richEditor','#postStatusEditor','#postScheduledAt','#postAuthor','#postCategory','#postTags','#postSlug','#featuredImageAlt','#seoTitle','#seoDescription','#canonicalUrl'];editorInputs.forEach(sel=>$(sel)?.addEventListener('input',()=>{state.dirty=true;$('#saveState').textContent='Unsaved changes';if(sel==='#postTitle'&&!$('#postSlug').value)$('#postSlug').value=slugify($('#postTitle').value);}));
  let selectedLinkRange=null;
  $$('.editor-toolbar [data-command]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.command==='createLink'){
      const selection=window.getSelection();
      selectedLinkRange=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;
      $('#editorLinkForm').hidden=false;
      $('#editorLinkUrl').focus();
      return;
    }
    document.execCommand(button.dataset.command,false,null);
    $('#richEditor').focus();
    state.dirty=true;
  }));
  $('#editorLinkCancel').addEventListener('click',()=>{$('#editorLinkForm').hidden=true;$('#editorLinkMessage').textContent='';});
  $('#editorLinkForm').addEventListener('submit',event=>{
    event.preventDefault();
    const raw=$('#editorLinkUrl').value.trim();
    let url;
    try{url=new URL(raw);if(!['https:','http:'].includes(url.protocol))throw Error('Invalid link protocol');}
    catch{$('#editorLinkMessage').textContent='Enter a valid http or https URL.';return;}
    const editor=$('#richEditor');
    editor.focus();
    const selection=window.getSelection();
    if(selectedLinkRange&&editor.contains(selectedLinkRange.commonAncestorContainer)){
      selection.removeAllRanges();selection.addRange(selectedLinkRange);
    }
    if(selection?.rangeCount&&selection.getRangeAt(0).toString().length){
      document.execCommand('createLink',false,url.href);
    }else{
      const link=document.createElement('a');link.href=url.href;link.textContent=url.href;
      const range=selection?.rangeCount?selection.getRangeAt(0):null;
      if(range&&editor.contains(range.commonAncestorContainer)){range.insertNode(link);range.setStartAfter(link);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}
      else editor.append(link);
    }
    state.dirty=true;$('#saveState').textContent='Unsaved changes';
    $('#editorLinkUrl').value='';$('#editorLinkMessage').textContent='';
    $('#editorLinkForm').hidden=true;selectedLinkRange=null;
  });$$('.editor-toolbar [data-format]').forEach(s=>s.addEventListener('change',()=>{document.execCommand(s.dataset.format,false,s.value);$('#richEditor').focus();state.dirty=true;}));
  function collectPost(statusOverride){const status=statusOverride||$('#postStatusEditor').value;return {id:state.post?.id,title:$('#postTitle').value.trim(),slug:$('#postSlug').value.trim()||slugify($('#postTitle').value),excerpt:$('#postExcerpt').value.trim(),content_html:window.NTABlogEditor?.getHTML?.()??$('#richEditor').innerHTML,content_text:$('#richEditor').innerText,category_id:$('#postCategory').value||null,tags:$('#postTags').value.split(',').map(x=>x.trim()).filter(Boolean),featured_image_path:$('#featuredImagePath').value,featured_image_alt:$('#featuredImageAlt').value,author_name:$('#postAuthor').value,status,scheduled_at:$('#postScheduledAt').value?new Date($('#postScheduledAt').value).toISOString():null,published_at:state.post?.published_at||null,seo_title:$('#seoTitle').value,seo_description:$('#seoDescription').value,canonical_url:$('#canonicalUrl').value};}
  let savingPost=false;
  async function savePost(status){
    if(savingPost)throw new Error('Save in progress. Please retry in a moment.');
    if(window.NTABlogEditor?.isSourceOpen?.())throw new Error('Apply or cancel HTML changes before saving.');
    const p=collectPost(status);
    if(!p.title)throw new Error('Add a post title first.');
    if(p.status==='scheduled'&&!p.scheduled_at)throw new Error('Choose a schedule date and time.');
    savingPost=true;
    $('#saveDraft').disabled=true;$('#publishPost').disabled=true;
    $('#saveState').textContent='Saving…';
    try{
      const j=await api('blog_save',{post:p});
      state.post={...j.post,tags:p.tags};state.dirty=false;
      $('#saveState').textContent='Saved '+new Date().toLocaleTimeString();
      $('#saveState').classList.add('saved');
      await loadPosts();
      return j;
    }finally{savingPost=false;$('#saveDraft').disabled=false;$('#publishPost').disabled=false;}
  }
  const editorError=error=>{const status=$('#saveState');status.textContent=error?.message||'Could not complete the action';status.classList.remove('saved');status.setAttribute('role','alert');};
  $('#saveDraft').onclick=()=>savePost('draft').catch(editorError);
  $('#publishPost').onclick=()=>savePost($('#postStatusEditor').value==='scheduled'?'scheduled':'published').catch(editorError);
  $('#archivePost').onclick=()=>{
    if(!state.post?.id||!(state.posts||[]).some(p=>p.id===state.post.id)){editorError(new Error('Save the blog post before archiving it.'));return;}
    $('#archiveConfirmation').hidden=false;
  };
  $('#cancelArchivePost').onclick=()=>{$('#archiveConfirmation').hidden=true;};
  $('#confirmArchivePost').onclick=async()=>{
    if(!state.post?.id)return;
    try{await api('blog_archive',{id:state.post.id});$('#archiveConfirmation').hidden=true;await loadPosts();activate('blog');}
    catch(error){editorError(error);}
  };
  state.autosave=setInterval(()=>{
    // Never silently unpublish a published/scheduled post while an editor is typing.
    if(!state.dirty||savingPost||window.NTABlogEditor?.isSourceOpen?.())return;
    if($('#postStatusEditor').value!=='draft'||(state.post?.status&&state.post.status!=='draft'))return;
    if($('#postTitle').value.trim()&&$('.admin-panel[data-panel="editor"]').classList.contains('active'))savePost('draft').catch(error=>{console.warn('Draft autosave:',error.message)});
  },30000);
  $('#previewPost').onclick=()=>{
  if(window.NTABlogEditor?.isSourceOpen?.()){editorError(new Error('Apply or cancel HTML changes before previewing.'));return;}
  $('#previewTitle').textContent=$('#postTitle').value||'Untitled';
  $('#previewExcerpt').textContent=$('#postExcerpt').value;
  $('#previewContent').innerHTML=window.NTABlogEditor?.getHTML?.()??$('#richEditor').innerHTML;
  $('#previewCategory').textContent=state.categories.find(c=>c.id===$('#postCategory').value)?.name||'NTA Logistics';
  activate('article-preview',{hash:'#/posts/preview'});
};
$('#closePreview').onclick=()=>activate('editor',{hash:'#/posts/edit'});
  // Blog image management. Existing media_upload_url / media_attach API and
  // Supabase signed-upload flow remain unchanged; restrict new uploads to JPG/PNG.
  const MEDIA_LIMIT_BYTES=12*1024*1024;
  const MEDIA_QUEUE_LIMIT=20;
  let mediaQueue=[];
  let mediaBusy=false;
  let mediaVisible=[];
  const mediaKind=m=>{
    const mime=String(m.mime_type||'').toLowerCase();
    const filename=String(m.file_name||'').toLowerCase();
    if(mime==='image/png'||filename.endsWith('.png'))return 'png';
    if(mime==='image/jpeg'||/\.(jpe?g)$/.test(filename))return 'jpeg';
    return 'other';
  };
  const prettySize=bytes=>{
    const amount=Number(bytes)||0;
    return amount>=1048576?(amount/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(amount/1024))+' KB';
  };
  function mediaStatus(message='',kind='info'){
    const box=$('#mediaStatus');
    if(!box)return;
    box.textContent=message;box.hidden=!message;box.dataset.kind=kind;
  }
  function mediaUrl(path){return cfg.blogFunctionUrl+'?media='+encodeURIComponent(path)}
  function renderMedia(){
    const grid=$('#mediaGrid');
    if(!grid)return;
    const items=Array.isArray(state.media)?state.media:[];
    $('#mediaCountTotal').textContent=String(items.length);
    $('#mediaCountPng').textContent=String(items.filter(m=>mediaKind(m)==='png').length);
    $('#mediaCountJpg').textContent=String(items.filter(m=>mediaKind(m)==='jpeg').length);
    const search=($('#mediaSearch').value||'').trim().toLowerCase();
    const type=$('#mediaTypeFilter').value;
    const order=$('#mediaSort').value;
    mediaVisible=items.filter(m=>(!type||mediaKind(m)===type)&&(!search||String(m.file_name||'').toLowerCase().includes(search)||String(m.alt_text||'').toLowerCase().includes(search)));
    mediaVisible.sort((a,b)=>{
      if(order==='name')return String(a.file_name||'').localeCompare(String(b.file_name||''));
      const dateA=Date.parse(a.created_at||'')||0,dateB=Date.parse(b.created_at||'')||0;
      return order==='oldest'?dateA-dateB:dateB-dateA;
    });
    $('#mediaResultCount').textContent=mediaVisible.length+' of '+items.length+' images';
    if(!mediaVisible.length){
      const empty=items.length?'No images match your filters':'No blog images uploaded yet';
      const details=items.length?'Try a different search or image type.':'Upload PNG or JPG images above to build your blog image library.';
      grid.innerHTML='<div class="nta28-media-empty"><span class="nta28-media-empty-icon" aria-hidden="true">▧</span><strong>'+esc(empty)+'</strong><p>'+esc(details)+'</p></div>';
      return;
    }
    grid.innerHTML=mediaVisible.map((m,index)=>{
      const kind=mediaKind(m);
      const extension=kind==='jpeg'?'JPG':kind==='png'?'PNG':String(m.mime_type||'Image').split('/').pop().toUpperCase();
      const url=mediaUrl(m.storage_path||'');
      const meta=[extension,m.file_size?prettySize(m.file_size):''].filter(Boolean).join(' · ');
      return '<article class="nta28-media-asset-card">'+
        '<div class="nta28-media-thumb"><img src="'+esc(url)+'" loading="lazy" alt="'+esc(m.alt_text||m.file_name||'Uploaded blog image')+'"><span class="nta28-media-format">'+esc(extension)+'</span></div>'+
        '<div class="nta28-media-asset-body"><strong title="'+esc(m.file_name||'')+'">'+esc(m.file_name||'Untitled image')+'</strong>'+
        '<small>'+esc(meta)+'</small><p>'+esc(m.alt_text||'No alt text specified')+'</p>'+
        '<div class="nta28-media-asset-actions">'+
        '<button type="button" data-media-action="featured" data-media-index="'+index+'" class="btn btn-primary">Use as Featured</button>'+
        '<button type="button" data-media-action="insert" data-media-index="'+index+'" class="btn btn-ghost">Insert in Post</button>'+
        '<button type="button" data-media-action="copy" data-media-index="'+index+'" class="btn btn-ghost">Copy URL</button>'+
        '</div></div></article>';
    }).join('');
  }
  async function loadMedia(){
    try{
      const j=await api('media_list');
      state.media=j.media||[];
      renderMedia();
    }catch(error){
      const grid=$('#mediaGrid');
      if(grid)grid.innerHTML='<div class="nta28-media-empty is-error"><strong>Images could not be loaded</strong><p>Check your connection and select Refresh to try again.</p></div>';
      $('#mediaResultCount').textContent='Unable to load images';
      throw error;
    }
  }
  function updateFeaturedPreview(){
    const path=$('#featuredImagePath').value;
    $('#featuredPreview').src=path?mediaUrl(path):'';
  }
  function useMediaInBlog(item,mode){
    if(!item)return;
    if(!state.post)resetEditor();
    else activate('editor');
    if(mode==='featured'){
      $('#featuredImagePath').value=item.storage_path;
      $('#featuredImageAlt').value=item.alt_text||'';
      updateFeaturedPreview();
      window.NTABlogEditor?.refresh?.();
    }else{
      const editor=$('#richEditor');
      editor.focus();
      if(window.NTABlogEditor?.insertMedia){
        window.NTABlogEditor.insertMedia(mediaUrl(item.storage_path),item.alt_text||'');
      }else{
        document.execCommand('insertImage',false,mediaUrl(item.storage_path));
        const imgs=[...editor.querySelectorAll('img')],img=imgs[imgs.length-1];
        if(img){img.alt=item.alt_text||'';img.loading='lazy';}
      }
    }
    state.dirty=true;
    $('#saveState').textContent='Unsaved changes';
    $('#saveState').classList.remove('saved');
  }
  $('#mediaGrid').addEventListener('click',async event=>{
    const button=event.target.closest('[data-media-action]');
    if(!button)return;
    const index=Number(button.dataset.mediaIndex);
    if(!Number.isInteger(index)||index<0||index>=mediaVisible.length)return;
    const item=mediaVisible[index];
    if(button.dataset.mediaAction==='featured'){useMediaInBlog(item,'featured');return}
    if(button.dataset.mediaAction==='insert'){useMediaInBlog(item,'insert');return}
    if(button.dataset.mediaAction==='copy'){
      try{
        if(!navigator.clipboard?.writeText)throw Error('Clipboard is unavailable in this browser.');
        await navigator.clipboard.writeText(mediaUrl(item.storage_path));
        mediaStatus('Image URL copied to clipboard.','success');
      }catch(error){mediaStatus(error?.message||'Unable to copy image URL.','error')}
    }
  });
  $('#chooseFeatured').addEventListener('click',()=>activate('media'));
  $('#mediaSearch').addEventListener('input',renderMedia);
  $('#mediaTypeFilter').addEventListener('change',renderMedia);
  $('#mediaSort').addEventListener('change',renderMedia);
  $('#mediaRefresh').addEventListener('click',()=>{
    mediaStatus('Refreshing image library…');
    loadMedia().then(()=>mediaStatus('Image library refreshed.','success')).catch(error=>mediaStatus(error?.message||'Unable to refresh images.','error'));
  });
  $('#mediaJumpToUpload').addEventListener('click',()=>{
    $('#mediaUploadSection').scrollIntoView({behavior:'smooth',block:'start'});
    $('#mediaBrowse').focus();
  });
  function clearMediaQueue(){
    mediaQueue.forEach(item=>{if(item.preview)URL.revokeObjectURL(item.preview)});
    mediaQueue=[];
  }
  function renderMediaQueue(){
    const section=$('#mediaQueueSection'),grid=$('#mediaQueue');
    section.hidden=mediaQueue.length===0;
    $('#mediaQueueCount').textContent=mediaQueue.length+' '+(mediaQueue.length===1?'image':'images')+' selected';
    $('#uploadMedia').disabled=mediaBusy||mediaQueue.length===0;
    $('#mediaFile').disabled=mediaBusy;
    $('#mediaBrowse').disabled=mediaBusy;
    grid.innerHTML=mediaQueue.map((item,index)=>
      '<div class="nta28-media-queue-item">'+
      '<img src="'+esc(item.preview||'')+'" alt="" class="nta28-media-queue-preview">'+
      '<div class="nta28-media-queue-details"><strong title="'+esc(item.file.name)+'">'+esc(item.file.name)+'</strong>'+
      '<small>'+prettySize(item.file.size)+' · '+(item.file.type==='image/png'?'PNG':'JPG / JPEG')+'</small>'+
      '<label for="mediaAlt-'+index+'">Image alt text (optional)</label>'+
      '<input type="text" id="mediaAlt-'+index+'" data-media-alt-index="'+index+'" maxlength="500" placeholder="Describe what the image shows" value="'+esc(item.alt||'')+'"></div>'+
      '<button type="button" class="nta28-media-remove" data-media-remove-index="'+index+'" aria-label="Remove '+esc(item.file.name)+'" '+(mediaBusy?'disabled':'')+'>Remove</button></div>'
    ).join('');
  }
  $('#mediaQueue').addEventListener('input',event=>{
    const input=event.target.closest('[data-media-alt-index]');
    if(!input)return;
    const index=Number(input.dataset.mediaAltIndex);
    if(Number.isInteger(index)&&mediaQueue[index])mediaQueue[index].alt=input.value;
  });
  $('#mediaQueue').addEventListener('click',event=>{
    const button=event.target.closest('[data-media-remove-index]');
    if(!button||mediaBusy)return;
    const index=Number(button.dataset.mediaRemoveIndex);
    if(!Number.isInteger(index)||!mediaQueue[index])return;
    const removed=mediaQueue.splice(index,1)[0];
    if(removed.preview)URL.revokeObjectURL(removed.preview);
    renderMediaQueue();
    if(!mediaQueue.length)mediaStatus('');
  });
  function queueMediaFiles(files){
    if(mediaBusy)return;
    const errors=[],known=new Set(mediaQueue.map(item=>[item.file.name,item.file.size,item.file.lastModified].join(':')));
    for(const file of Array.from(files||[])){
      const extension=file.name.toLowerCase().match(/\.(png|jpe?g)$/)?.[1]||'';
      const type=extension==='png'?'image/png':extension?'image/jpeg':null;
      if(!type||file.type!==type){errors.push(file.name+': only PNG or JPG/JPEG images are accepted.');continue;}
      if(!file.size||file.size>MEDIA_LIMIT_BYTES){errors.push(file.name+': image must be under 12 MB.');continue;}
      if(mediaQueue.length>=MEDIA_QUEUE_LIMIT){errors.push('Select up to 20 images per batch.');break;}
      const signature=[file.name,file.size,file.lastModified].join(':');
      if(known.has(signature))continue;
      known.add(signature);
      let preview='';
      try{preview=URL.createObjectURL(file)}catch{}
      mediaQueue.push({file,alt:'',preview});
    }
    renderMediaQueue();
    if(errors.length)mediaStatus(errors.slice(0,3).join(' ') +(errors.length>3?' +'+(errors.length-3)+' more.':''),'error');
    else if(mediaQueue.length)mediaStatus(mediaQueue.length+' '+(mediaQueue.length===1?'image':'images')+' ready to upload.');
  }
  $('#mediaFile').addEventListener('change',event=>{
    queueMediaFiles(event.target.files);
    event.target.value='';
  });
  const mediaDropzone=$('#mediaDropzone');
  const openMediaFilePicker=()=>{if(!mediaBusy)$('#mediaFile').click()};
  $('#mediaBrowse').addEventListener('click',event=>{
    event.stopPropagation();openMediaFilePicker();
  });
  mediaDropzone.addEventListener('click',event=>{
    if(event.target.closest('#mediaBrowse,#mediaFile'))return;
    openMediaFilePicker();
  });
  mediaDropzone.addEventListener('keydown',event=>{
    if(event.target!==mediaDropzone)return;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();openMediaFilePicker()}
  });
  mediaDropzone.addEventListener('dragover',event=>{
    event.preventDefault();
    if(!mediaBusy)mediaDropzone.classList.add('is-dragging');
  });
  mediaDropzone.addEventListener('dragleave',event=>{
    if(!mediaDropzone.contains(event.relatedTarget))mediaDropzone.classList.remove('is-dragging');
  });
  mediaDropzone.addEventListener('drop',event=>{
    event.preventDefault();mediaDropzone.classList.remove('is-dragging');
    queueMediaFiles(event.dataTransfer?.files);
  });
  $('#uploadMedia').addEventListener('click',async()=>{
    if(mediaBusy||!mediaQueue.length)return;
    mediaBusy=true;renderMediaQueue();
    const batch=mediaQueue.slice(),failed=[],uploaded=[];
    try{
      for(let index=0;index<batch.length;index++){
        const item=batch[index],file=item.file;
        mediaStatus('Uploading '+(index+1)+' of '+batch.length+': '+file.name);
        try{
          const signed=await api('media_upload_url',{file_name:file.name,mime_type:file.type,file_size:file.size});
          if(!signed?.path||!signed?.token||!signed?.bucket)throw Error('Unable to prepare a secure upload.');
          const {error}=await sb.storage.from(signed.bucket).uploadToSignedUrl(signed.path,signed.token,file,{contentType:file.type});
          if(error)throw error;
          await api('media_attach',{storage_path:signed.path,file_name:file.name,mime_type:file.type,file_size:file.size,alt_text:item.alt.trim()});
          uploaded.push(item);
          if(item.preview)URL.revokeObjectURL(item.preview);
        }catch(error){failed.push({item,message:error?.message||'Upload failed'})}
      }
      mediaQueue=failed.map(x=>x.item);
      if(uploaded.length){
        try{await loadMedia()}catch(error){mediaStatus('Upload completed, but the library could not refresh: '+error.message,'error');}
      }
      if(failed.length){
        const summary=uploaded.length+' uploaded, '+failed.length+' failed. '+failed[0].item.file.name+': '+failed[0].message;
        mediaStatus(summary,'error');
      }else{
        mediaStatus(uploaded.length+' '+(uploaded.length===1?'image':'images')+' uploaded successfully.','success');
      }
    }finally{mediaBusy=false;renderMediaQueue();}
  });
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
      try{localStorage.setItem('nta-sidebar-collapsed-v2',shell.classList.contains('sidebar-collapsed')?'true':'false')}catch{}
    }
    syncSidebarToggle();
  });
  try{if(localStorage.getItem('nta-sidebar-collapsed-v2')==='true')$('#adminApp').classList.add('sidebar-collapsed')}catch{}
  syncSidebarToggle();
  window.addEventListener('resize',syncSidebarToggle);
  $$('[data-admin-go]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.adminGo)));
  $$('.admin-nav button[data-admin-panel], .admin-nav button[data-accounts-type], .admin-nav button[data-crm-shortcut]').forEach(b=>b.addEventListener('click',()=>{
    if(window.matchMedia('(max-width:760px)').matches)$('#adminApp').classList.remove('sidebar-open');
    syncSidebarToggle();
    $$('.admin-nav button').forEach(n=>n.classList.remove('active'));
    b.classList.add('active');
  }));
  boot();
})();
