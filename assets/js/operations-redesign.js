/* Data Operations Center — wire new shortcut tiles to existing portal modules.
   No new data sources, permissions, or record mutations. */
(()=>{
 "use strict";
 document.addEventListener("click",event=>{
   const shortcut=event.target.closest(".dashboard-v2 [data-dashboard-open]");
   if(shortcut){
     const type=shortcut.getAttribute("data-dashboard-open");
     const target=document.querySelector('[data-accounts-type="'+type+'"]');
     if(target)target.click();
     return;
   }
   const tasks=event.target.closest(".dashboard-v2 .dashboard-actions-widget [data-admin-go='tasks']");
   if(tasks){document.querySelector('.admin-nav [data-admin-panel="tasks"]')?.click()}
 });
})();
