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
 const accountType=accounts?.value;
 $$('[data-admin-panel]',rail).forEach(button=>button.classList.toggle('active',button.dataset.adminPanel===page));
 $$('[data-accounts-type]',rail).forEach(button=>button.classList.toggle('active',page==='accounts'&&button.dataset.accountsType===accountType));
};
const observer=new MutationObserver(syncRail);
panelNodes.forEach(panel=>observer.observe(panel,{attributes:true,attributeFilter:['class']}));
accounts?.addEventListener('change',syncRail);
document.addEventListener('click',e=>{
 if(e.target.closest('[data-accounts-type]'))queueMicrotask(()=>{markAccount();syncRail()});
});
syncRail();
})();