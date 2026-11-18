/* Selected Data Operations Center — navigation and portal-page search.
   Uses existing portal routing; does not alter authorization or business data. */
(()=>{
 "use strict";
 const input=document.querySelector('#portalPageSearch');
 const results=document.querySelector('#portalSearchResults');
 const nav=[...document.querySelectorAll('.admin-nav button')];
 const close=()=>{if(results){results.hidden=true;results.replaceChildren()}};
 function showResults(){
   if(!input||!results)return;
   const q=input.value.trim().toLowerCase();
   results.replaceChildren();
   if(!q){close();return}
   const found=nav.filter(b=>b.textContent.toLowerCase().includes(q)).slice(0,9);
   if(!found.length){const p=document.createElement('p');p.textContent='No matching portal pages.';results.append(p)}
   for(const target of found){
     const b=document.createElement('button');b.type='button';b.textContent=target.textContent.trim();
     b.addEventListener('click',()=>{target.click();input.value='';close()});
     results.append(b);
   }
   results.hidden=false;
 }
 input?.addEventListener('input',showResults);
 input?.addEventListener('keydown',event=>{
   if(event.key==='Escape'){close();input.blur()}
   if(event.key==='Enter'&&!results?.hidden){const first=results.querySelector('button');if(first){event.preventDefault();first.click()}}
 });
 document.addEventListener('keydown',event=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
     if(input){event.preventDefault();input.focus();input.select()}
   }
 });
 document.addEventListener('click',event=>{
   if(input&&results&&!event.target.closest('.portal-search'))close();
   const shortcut=event.target.closest('.dashboard-v2 [data-dashboard-open]');
   if(shortcut){
     const type=shortcut.getAttribute('data-dashboard-open');
     document.querySelector('[data-accounts-type="'+type+'"]')?.click();
     return;
   }
   if(event.target.closest('.dashboard-v2 .dashboard-actions-widget [data-admin-go="tasks"]')){
     document.querySelector('.admin-nav [data-admin-panel="tasks"]')?.click();
   }
 });
})();
