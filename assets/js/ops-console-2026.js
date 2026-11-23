/* NTA Operations Console — category navigation and active workspace synchronization.
   Works with existing CRM, account, and admin controllers. No backend changes. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const crm=$('#crmType');
const crmChoices=$$('[data-ops-crm-type]');
const markType=()=>{
 const selected=crm?.value;
 crmChoices.forEach(b=>{const active=b.dataset.opsCrmType===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
};
crmChoices.forEach(button=>button.addEventListener('click',()=>{
 if(!crm)return;
 crm.value=button.dataset.opsCrmType;
 crm.dispatchEvent(new Event('change',{bubbles:true}));
 markType();
}));
crm?.addEventListener('change',markType);
markType();
const accounts=$('#accountsType');
const accountChoices=$$('.ops-account-categories [data-accounts-type]');
const markAccount=()=>{
 const selected=accounts?.value;
 accountChoices.forEach(b=>{const active=b.dataset.accountsType===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
};
accountChoices.forEach(button=>button.addEventListener('click',()=>queueMicrotask(markAccount)));
accounts?.addEventListener('change',markAccount);
markAccount();
const rail=$('.ops-rail-nav');
const panelNodes=$$('.admin-panel');
const syncRail=()=>{
 const active=$('.admin-panel.active');
 if(!rail||!active)return;
 const page=active.dataset.panel;
 const parent={'crm-detail':'crm','account-editor':'accounts','factoring-editor':'factoring','article-preview':'editor'}[page]||page;
 const accountType=accounts?.value;
 $$('[data-admin-panel]',rail).forEach(button=>button.classList.toggle('active',button.dataset.adminPanel===parent));
 $$('[data-accounts-type]',rail).forEach(button=>button.classList.toggle('active',parent==='accounts'&&button.dataset.accountsType===accountType));
};
const observer=new MutationObserver(syncRail);
panelNodes.forEach(panel=>observer.observe(panel,{attributes:true,attributeFilter:['class']}));
accounts?.addEventListener('change',syncRail);
document.addEventListener('click',e=>{
 if(e.target.closest('[data-accounts-type]'))queueMicrotask(()=>{markAccount();syncRail()});
});
syncRail();

/* Render live, filterable inbox from the records already fetched by admin.js. */
const source=$('#dashboardCrmRows');
const inbox=$('#opsInboxList');
const filters=$$('[data-ops-inbox-filter]');
let activeInboxFilter='all';
const labels={all:'Recent requests',quote:'Quote requests',shipper:'Shipper applications',carrier:'Carrier applications',inquiry:'General inquiries'};
const classify=label=>{
 const s=label.toLowerCase();
 return s.includes('shipper')?'shipper':s.includes('carrier')?'carrier':s.includes('quote')?'quote':s.includes('inquiry')?'inquiry':null;
};
const node=(tag,klass,content)=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(content!==undefined)n.textContent=content;
 return n;
};
const showInboxRecords=()=>{
 if(!source||!inbox)return;
 const tableRows=$$('tr',source);
 const records=tableRows.filter(r=>r.cells.length>=5&&r.cells[0].colSpan===1).map(r=>{
   const c=r.cells;
   return {type:r.dataset.recordType||classify(c[0].textContent||''),id:r.dataset.recordId||'',category:c[0].textContent.trim(),company:c[1].textContent.trim(),request:c[2].textContent.trim(),status:c[3].textContent.trim(),date:c[4].textContent.trim()};
 }).filter(r=>r.type);
 const pending=tableRows.length===1&&tableRows[0].cells[0]?.colSpan>1&&/loading/i.test(tableRows[0].textContent);
 const counts={all:records.length,quote:0,shipper:0,carrier:0,inquiry:0};
 records.forEach(r=>{counts[r.type]++});
 for(const [type,count] of Object.entries(counts)){
  const el=$('[data-ops-count="'+type+'"]');
  if(el)el.textContent=pending?'…':String(count);
 }
 filters.forEach(b=>{
  const isActive=b.dataset.opsInboxFilter===activeInboxFilter;
  b.classList.toggle('active',isActive);
  b.setAttribute('aria-pressed',String(isActive));
 });
 const title=$('#opsInboxHeading'),subtitle=$('#opsInboxSubtitle');
 if(title)title.textContent=labels[activeInboxFilter]||labels.all;
 if(subtitle)subtitle.textContent=activeInboxFilter==='all'?'Latest CRM entries across all request types':'Filtered from your most recent CRM entries';
 inbox.replaceChildren();
 const chosen=records.filter(r=>activeInboxFilter==='all'||r.type===activeInboxFilter);
 if(!chosen.length){
  const empty=node('div','ops-inbox-feed-empty');
  empty.append(node('div','ops-inbox-empty-glyph',pending?'…':'✓'));
  empty.append(node('strong','',pending?'Loading records':'No recent records in this view'));
  empty.append(node('p','',pending?'Checking your business network':'Select a different category or open Intake Center to browse all records.'));
  inbox.append(empty);return;
 }
 for(const r of chosen){
  const button=node('button','ops-inbox-feed-row');
  button.type='button';
  button.setAttribute('aria-label','Open '+r.category+' for '+r.company);
  const left=node('span','ops-inbox-feed-primary');
  const badge=node('span','ops-inbox-feed-icon',({quote:'QT',shipper:'SH',carrier:'CA',inquiry:'IN'})[r.type]);
  const detail=node('span','ops-inbox-feed-detail');
  detail.append(node('strong','',r.company),node('small','',r.request&&r.request!=='—'?r.request:r.category));
  left.append(badge,detail);
  const status=node('span','ops-inbox-feed-state',r.status);
  const date=node('span','ops-inbox-feed-date',r.date||'—');
  button.append(left,status,date);
  button.addEventListener('click',()=>{
    if(r.id&&window.NTAOpenCrmRecord){
      window.NTAOpenCrmRecord(r.type,r.id).catch(error=>console.error('Unable to open request:',error));
      return;
    }
    if(crm)crm.value=r.type;
    const search=$('#crmSearch'),state=$('#crmStatus');
    if(search)search.value='';
    if(state)state.value='';
    $('.admin-nav [data-admin-panel="crm"]')?.click();
    markType();
  });
  inbox.append(button);
 }
};
filters.forEach(b=>b.addEventListener('click',()=>{
 activeInboxFilter=b.dataset.opsInboxFilter||'all';
 showInboxRecords();
}));
if(source&&inbox){
 new MutationObserver(showInboxRecords).observe(source,{childList:true});
 showInboxRecords();
}

})();
