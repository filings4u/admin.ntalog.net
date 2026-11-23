/* NTA Logistics Command Center — shared shell behavior.
   No application API calls or authorization changes. */
(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s);

const iconPaths={
 house:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 6a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
 building:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M9 21v-5h6v5"/>',
 truck:'<path d="M3 6h11v12H3zM14 10h4l3 4v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
 'clipboard-check':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-6 10 2 2 4-4"/>',
 'file-user':'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7"/><circle cx="11" cy="14" r="2"/><path d="M7 20c0-2 2-3 4-3s4 1 4 3"/>',
 tag:'<path d="M3 4h8l10 10-7 7L4 11z"/><circle cx="8" cy="8" r="1"/>',
 database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
 'square-check':'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
 newspaper:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10M7 11h5M7 15h10M7 18h10"/>',
 'pen-line':'<path d="m4 17 10-10 4 4-10 10-5 1zM12 9l4 4M14 7l2-2 4 4-2 2M4 22h16"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
 layers:'<path d="m12 2 10 6-10 6L2 8zM2 12l10 6 10-6M2 16l10 6 10-6"/>'
};
document.querySelectorAll('.admin-nav button[data-nav-icon]').forEach(button=>{
 const path=iconPaths[button.dataset.navIcon];
 if(!path||button.querySelector('.command-nav-icon'))return;
 const icon=document.createElement('span');
 icon.className='command-nav-icon';
 icon.setAttribute('aria-hidden','true');
 icon.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
 button.prepend(icon);
});

/* Expandable management sidebar. Each group is a true dropdown,
   with plus/minus state instead of caret symbols. */
const navGroups=[...document.querySelectorAll('.nta26-nav-group')];
const setGroupOpen=(group,expanded)=>{
 if(!group)return;
 const trigger=group.querySelector('.nta26-nav-group-toggle');
 const content=group.querySelector('.nta26-nav-group-items');
 if(!trigger||!content)return;
 content.hidden=!expanded;
 trigger.setAttribute('aria-expanded',String(expanded));
 const indicator=trigger.querySelector('.nta26-nav-indicator');
 if(indicator)indicator.textContent=expanded?'−':'+';
 group.classList.toggle('is-open',expanded);
};
const openGroup=(group)=>{
 navGroups.forEach(item=>setGroupOpen(item,item===group));
};
const closeGroups=()=>navGroups.forEach(item=>setGroupOpen(item,false));
navGroups.forEach(group=>{
 setGroupOpen(group,false);
 group.querySelector('.nta26-nav-group-toggle')?.addEventListener('click',()=>{
  const expanded=group.querySelector('.nta26-nav-group-toggle')?.getAttribute('aria-expanded')==='true';
  if(expanded)closeGroups();else openGroup(group);
 });
 group.querySelector('.nta26-nav-group-items')?.addEventListener('click',event=>{
  if(event.target.closest('button'))openGroup(group);
 });
});
document.querySelector('.nta26-navigation > [data-admin-panel="dashboard"]')?.addEventListener('click',closeGroups);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&document.activeElement?.closest('.nta26-navigation'))closeGroups();
});
const openNavGroupFor=(name)=>{
 const target=navGroups.find(group=>group.dataset.navGroup===name);
 if(target)openGroup(target);
};
const syncOpenGroup=()=>{
 const page=document.querySelector('.admin-panel.active')?.dataset.panel;
 const target=page==='crm'||page==='tasks'?'operations':
  page==='accounts'||page==='factoring'?'network':
  ['blog','editor','media','categories'].includes(page)?'publishing':null;
 if(target)openNavGroupFor(target);
 else if(page==='dashboard')closeGroups();
};
document.querySelectorAll('.admin-panel').forEach(panel=>
 new MutationObserver(syncOpenGroup).observe(panel,{attributes:true,attributeFilter:['class']})
);
syncOpenGroup();

// Preserve all application shortcuts. Their original names map to existing
// CRM entity types rather than new or duplicate API endpoints.
document.querySelectorAll('.admin-nav [data-crm-shortcut]').forEach(button=>{
 button.addEventListener('click',()=>{
   const type=button.dataset.crmShortcut;
   const select=$('#crmType');
   if(select)select.value=type;
   const search=$('#crmSearch');if(search)search.value='';
   const status=$('#crmStatus');if(status)status.value='';
   $('.admin-nav [data-admin-panel="crm"]')?.click();
   openNavGroupFor('operations');
 });
});
const create=$('#commandNewRecord');
create?.addEventListener('click',()=>{
 const shipper=$('.admin-nav [data-accounts-type="shipper"]');
 shipper?.click();
 // Reuse the existing account creation form and its validation.
 const add=$('#accountsNew');
 if(add && !add.disabled)add.click();
});
// The approved design uses a fixed section title, not a time-based greeting.
const heading=$('#commandGreeting');if(heading)heading.textContent='Your operations, at a glance.';
// Dashboard requests and View All actions use the same existing portal routes.
document.querySelectorAll('.command-dashboard [data-crm-shortcut]').forEach(button=>{
 button.addEventListener('click',()=>{
   const select=$('#crmType');if(select)select.value=button.dataset.crmShortcut;
   const search=$('#crmSearch');if(search)search.value='';
   const status=$('#crmStatus');if(status)status.value='';
   $('.admin-nav [data-admin-panel="crm"]')?.click();
 });
});
document.querySelectorAll('.command-dashboard [data-goto-crm]').forEach(button=>{
 button.addEventListener('click',()=>$('.admin-nav [data-admin-panel="crm"]')?.click());
});

// Keep the global breadcrumb synced with the currently active workspace panel.
const updatePageLabel=()=>{
 const active=document.querySelector('.admin-panel.active');
 const label=document.querySelector('#ntaPageLabel');
 if(!active||!label)return;
 const names={dashboard:'Overview',crm:'Intake Center',accounts:document.querySelector('#accountsHeading')?.textContent||'Accounts',factoring:'Factoring Partners',tasks:'My Tasks',blog:'Articles',editor:'Content Editor',categories:'Categories',media:'Asset Library',profile:'My Account',team:'Team & Users'};
 label.textContent=names[active.dataset.panel]||'Workspace';
 const subtitle=document.querySelector('#ntaPageSubtitle');
 if(subtitle){
  const subtitles={dashboard:'Operations dashboard',crm:'Applications & inquiries',accounts:'Business relationships',factoring:'Partner network',tasks:'Operational follow-ups',blog:'Content management',editor:'Publishing workspace',categories:'Content organization',media:'Images & files',profile:'Account settings',team:'User management'};
  subtitle.textContent=subtitles[active.dataset.panel]||'Management workspace';
 }
};
document.querySelectorAll('.admin-nav button,[data-admin-go],[data-goto-crm],[data-accounts-type],[data-crm-shortcut]').forEach(button=>button.addEventListener('click',()=>requestAnimationFrame(updatePageLabel)));
updatePageLabel();
})();