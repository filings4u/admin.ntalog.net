(() => {
  "use strict";
  const cfg=window.NTA_CONFIG;
  const sb=window.NTAAdminClient;
  if(!cfg||!sb)return;
  const $=(selector)=>document.querySelector(selector);
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const table='nta_factoring_companies';
  const fields=[
    'id','company_name','dba_name','contact_name','contact_title','contact_email','phone',
    'website','address','city','state','postal_code','country','payment_terms',
    'factoring_program','advance_rate_percent','factoring_fee_percent',
    'minimum_invoice_amount','minimum_monthly_volume','funding_speed','funding_method',
    'service_regions','industry_focus','accepts_new_authorities','contract_term',
    'onboarding_requirements','notes','created_at','updated_at'
  ];
  const numbers=new Set(['advance_rate_percent','factoring_fee_percent','minimum_invoice_amount','minimum_monthly_volume']);
  const bools=new Set(['accepts_new_authorities']);
  const editable=fields.filter(key=>!['id','created_at','updated_at'].includes(key));
  let records=[];
  const message=(value,where='#factorListMessage',error=false)=>{
    const element=$(where);
    if(element){element.textContent=value||'';element.dataset.kind=error?'error':'ok';}
  };
  async function authorized(){
    const {data,error}=await sb.auth.getSession();
    const session=data?.session;
    if(error||!session)throw Error('Sign in to the management portal first.');
    const response=await fetch(cfg.adminFunctionUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token},
      body:JSON.stringify({action:'me'})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.error||!result.admin?.active)throw Error(result.error||'Administrator access is required.');
    return session;
  }
  function formatPercent(value){
    const n=Number(value);
    return value===null||value===undefined||value===''?'—':Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:2})+'%':'—';
  }
  function rowMarkup(record){
    const program=record.factoring_program?record.factoring_program.replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase()):'—';
    return '<tr>'+
      '<td><button type="button" class="nta27-factor-record" data-edit-factor="'+esc(record.id)+'">'+esc(record.company_name)+'</button>'+(record.dba_name?'<small class="nta27-factor-sub">'+esc(record.dba_name)+'</small>':'')+'</td>'+
      '<td>'+esc(record.contact_name||'—')+'</td>'+
      '<td>'+esc(record.contact_email||'—')+'</td>'+
      '<td>'+esc(program)+'</td>'+
      '<td>'+esc(formatPercent(record.advance_rate_percent))+'</td>'+
      '<td>'+esc(record.funding_speed||'—')+'</td>'+
      '<td><button type="button" class="btn btn-primary" data-edit-factor="'+esc(record.id)+'">Manage</button></td></tr>';
  }
  function emptyRow({filtered=false,error=false}={}){
    const heading=error?'Unable to load factoring companies':filtered?'No matching factoring companies':'No factoring companies yet';
    const detail=error?'Check your connection and administrator permissions, then try again.'
      :filtered?'Try a different company name, contact or email.'
      :'Add your first factoring company to manage provider contacts, advance rates and funding terms.';
    return '<tr><td colspan="7" class="nta28-factor-empty-cell"><div class="nta28-factor-empty'+(error?' is-error':'')+'"><strong>'+esc(heading)+'</strong><p>'+esc(detail)+'</p></div></td></tr>';
  }
  async function load(){
    try{
      await authorized();
      message('Loading factoring companies…');
      const q=($('#factorSearch')?.value||'').trim().slice(0,120);
      let query=sb.from(table).select(fields.join(',')).order('company_name',{ascending:true}).limit(500);
      if(q){
        const safe=q.replace(/[,()%]/g,'');
        query=query.or('company_name.ilike.%'+safe+'%,dba_name.ilike.%'+safe+'%,contact_name.ilike.%'+safe+'%,contact_email.ilike.%'+safe+'%');
      }
      const {data,error}=await query;
      if(error)throw error;
      records=Array.isArray(data)?data:[];
      $('#factorRows').innerHTML=records.length?records.map(rowMarkup).join(''):emptyRow({filtered:!!q});
      message(records.length+' '+(records.length===1?'company':'companies'));
    }catch(error){
      console.error('Factoring list:',error);
      $('#factorRows').innerHTML=emptyRow({error:true});
      message(error?.message||'Unable to load companies.','#factorListMessage',true);
    }
  }
  function fillForm(record={}){
    const form=$('#factorForm');
    form.reset();
    for(const key of editable){
      const input=form.elements.namedItem(key);
      if(!input)continue;
      const value=record[key];
      if(value===null||value===undefined)input.value='';
      else if(bools.has(key))input.value=value===true?'true':value===false?'false':'';
      else input.value=String(value);
    }
    form.elements.namedItem('id').value=record.id||'';
    $('#factorTitle').textContent=record.id?'Edit Factoring Company':'Add Factoring Company';
    $('#factorEditor').hidden=false;
    message('','#factorMessage');
  }
  function edit(record={},opts={}){
    fillForm(record);
    window.NTAAdminNavigate?.('factoring-editor','#/factoring/'+encodeURIComponent(record.id||'new'),opts);
  }
  async function openList({skipHistory=false}={}){
    $('#factorEditor').hidden=true;
    window.NTAAdminNavigate?.('factoring','#/page/factoring',{skipHistory});
    await load();
  }
  async function editById(id,{skipHistory=false}={}){
    if(id==='new'){edit({},{skipHistory});return}
    let record=records.find(row=>row.id===id);
    if(!record){
      await authorized();
      const {data,error}=await sb.from(table).select(fields.join(',')).eq('id',id).single();
      if(error)throw error;
      record=data;
    }
    if(!record)throw Error('Factoring company not found.');
    edit(record,{skipHistory});
  }
  window.NTAFactoringOpen=openList;
  window.NTAFactoringEdit=editById;
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-admin-panel="factoring"]'))void load();
    const record=event.target.closest('[data-edit-factor]');
    if(record)void editById(record.dataset.editFactor).catch(error=>message(error.message,'#factorListMessage',true));
  });
  $('#factorNew')?.addEventListener('click',()=>edit({}));
  $('#factorCancel')?.addEventListener('click',()=>{void openList()});
  $('#factoringBackToList')?.addEventListener('click',()=>{void openList()});
  $('#factorRefresh')?.addEventListener('click',()=>{void load()});
  $('#factorSearch')?.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();void load()}
  });
  $('#factorForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    const submit=form.querySelector('[type="submit"]');
    if(submit.disabled)return;
    submit.disabled=true;
    message('Saving factoring company…','#factorMessage');
    try{
      await authorized();
      const values=Object.fromEntries(new FormData(form).entries());
      const id=values.id;
      delete values.id;
      const payload={};
      for(const key of editable){
        const raw=values[key];
        if(raw===undefined)continue;
        const value=String(raw).trim();
        if(numbers.has(key)){
          if(!value){payload[key]=null;continue}
          const number=Number(value);
          if(!Number.isFinite(number)||number<0||(key.endsWith('_percent')&&number>100))throw Error('Enter a valid amount or percentage for '+key.replace(/_/g,' ')+'.');
          payload[key]=number;
        }else if(bools.has(key)){
          payload[key]=value===''?null:value==='true';
        }else payload[key]=value||null;
      }
      if(!payload.company_name)throw Error('Company name is required.');
      // Accept company.com in addition to a full URL, without forcing users to type a scheme.
      if(payload.website){
        const address=/^https?:\/\//i.test(payload.website)?payload.website:'https://'+payload.website;
        let parsed;
        try{parsed=new URL(address)}catch{throw Error('Enter a valid company website.')}
        if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname.includes('.')||/\s/.test(address))throw Error('Enter a valid company website.');
        payload.website=parsed.href;
      }
      // Retain the legacy database column for compatibility; never save sales pipeline statuses.
      payload.status='company';
      payload.updated_at=new Date().toISOString();
      const query=sb.from(table);
      const {error}=id
        ?await query.update(payload).eq('id',id)
        :await query.insert(payload);
      if(error)throw error;
      await openList();
      message(id?'Factoring company updated.':'Factoring company created.');
    }catch(error){
      console.error('Factoring save:',error);
      message(error?.message||'Unable to save factoring company.','#factorMessage',true);
    }finally{submit.disabled=false}
  });
})();