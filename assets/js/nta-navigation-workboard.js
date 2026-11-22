/* NTA new horizontal navigation; keep original routing hooks intact */
(()=>{'use strict';
const app=document.getElementById('adminApp');
const menu=document.getElementById('sidebarToggle');
const close=()=>{app?.classList.remove('nta-next-navopen');menu?.setAttribute('aria-expanded','false');};
const toggle=()=>{const isOpen=app?.classList.toggle('nta-next-navopen');menu?.setAttribute('aria-expanded',String(!!isOpen));menu?.setAttribute('aria-label',isOpen?'Close all navigation':'Open all navigation');};
menu?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();toggle();},true);
document.querySelector('[data-toggle-all-pages]')?.addEventListener('click',toggle);
document.querySelector('.nta-next-drawer .admin-nav')?.addEventListener('click',e=>{if(e.target.closest('button') && !e.target.closest('#applicationNavToggle'))close();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
document.addEventListener('click',e=>{if(app?.classList.contains('nta-next-navopen')&&!e.target.closest('#ntaSidebar')&&!e.target.closest('#sidebarToggle')&&!e.target.closest('[data-toggle-all-pages]'))close();});
const tabs=[...document.querySelectorAll('.nta-next-topnav .nta-next-tab')];
tabs.forEach(tab=>tab.addEventListener('click',()=>{
 const type=tab.dataset.accountsType;
 if(type){document.querySelector('.admin-nav [data-accounts-type="'+type+'"]')?.click();}
 else{const target=tab.dataset.adminGo;document.querySelector('.admin-nav [data-admin-panel="'+target+'"]')?.click();}
 tabs.forEach(t=>t.classList.toggle('active',t===tab));close();
}));
const drawer=document.getElementById('ntaSidebar');
new MutationObserver(()=>{
 const active=drawer?.querySelector('.admin-nav button.active');
 if(!active)return;
 tabs.forEach(tab=>tab.classList.toggle('active',tab.dataset.adminGo===active.dataset.adminPanel));
}).observe(drawer||document.body,{subtree:true,attributes:true,attributeFilter:['class']});
})();