/* NTA Logistics Command Center — shared shell behavior.
   No application API calls or authorization changes. */
(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const menu=$('#applicationNavToggle'),items=$('#applicationNavItems');
const close=()=>{if(!items||!menu)return;items.hidden=true;menu.setAttribute('aria-expanded','false')};
const open=()=>{if(!items||!menu)return;items.hidden=false;menu.setAttribute('aria-expanded','true')};
menu?.addEventListener('click',()=>items.hidden?open():close());
items?.querySelectorAll('button').forEach(b=>b.addEventListener('click',open));
document.querySelectorAll('.admin-nav button[data-admin-panel],.admin-nav button[data-accounts-type],.admin-nav button[data-crm-shortcut]').forEach(b=>{
  b.addEventListener('click',()=>{
    if(items?.contains(b)){open();return}
    close();
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
function setGreeting(){
 const hour=new Date().getHours();
 const salutation=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
 const el=$('#commandGreeting');
 if(el)el.textContent=salutation+', Admin';
}
setGreeting();
document.addEventListener('click',event=>{
 if(event.target.closest('.admin-nav [data-crm-shortcut]'))open();
});
})();