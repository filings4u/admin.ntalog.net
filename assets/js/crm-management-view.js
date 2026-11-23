/* NTA Logistics CRM Management Record View
 * Purpose-built, compact, business-focused record layout.
 * Pure renderer: no navigation, network requests, or global event listeners.
 */
(function () {
  'use strict';
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const privateKey = key => /password|token|secret|hash|credential|api_key|authorization|session/i.test(key) || key === 'campaign';
  const missing = value => value === null || value === undefined || value === '';
  const prettify = key => key.replace(/_/g,' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const format = (value,key) => {
    if (missing(value)) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    if (/_at$/.test(key)) {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date.toLocaleString();
    }
    if (/_date$/.test(key) && /^\d{4}-\d\d-\d\d$/.test(String(value))) {
      const date = new Date(String(value)+'T12:00:00');
      if (Number.isFinite(date.getTime())) return date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    }
    if (key === 'weight_lbs' && Number.isFinite(Number(value))) return Number(value).toLocaleString() + ' lbs';
    if (['piece_count','pallet_count','number_of_loads'].includes(key) && Number.isFinite(Number(value))) return Number(value).toLocaleString();
    return String(value);
  };
  const renderRow = (label,value,key) => '<div class="nta27-data-row"><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(format(value,key||''))+'</dd></div>';
  const emptySection = message => '<p class="nta27-empty">'+escapeHtml(message)+'</p>';
  const section = (title,body,extraClass) => '<section class="nta27-section '+(extraClass||'')+'"><div class="nta27-section-head"><h2>'+escapeHtml(title)+'</h2></div>'+body+'</section>';
  const table = rows => '<dl class="nta27-data">'+rows+'</dl>';
  const first = (record,keys) => {
    for (const key of keys) if(!missing(record[key])) return {key,value:record[key]};
    return null;
  };
  const fieldBuilder = (record,used) => (specs) => {
    let out='';
    for(const item of specs){
      const label=item[0],keys=Array.isArray(item[1])?item[1]:[item[1]];
      const found=first(record,keys);
      if(!found)continue;
      used.add(found.key);
      out+=renderRow(label,found.value,found.key);
    }
    return out;
  };
  const quoteLocation = (record,used,prefix) => {
    const entries=[
      ['Company',prefix+'_company'],
      ['Street address',prefix+'_address'],
      ['City',prefix+'_city'],
      ['State',prefix+'_state'],
      ['ZIP / postal code',prefix+'_postal_code'],
      ['Date',prefix+'_date'],
      ['Time window',prefix+'_time_window'],
      ['Contact',prefix+'_contact_name'],
      ['Contact phone',prefix+'_contact_phone'],
      ['Handling',prefix+'_loading_method']
    ];
    const list=fieldBuilder(record,used)(entries);
    return section(prefix==='pickup'?'Pickup location':'Delivery location',list?table(list):emptySection('No location information provided.'));
  };
  const statusControl = (record) => {
    const statuses=['new','pending','reviewing','approved','quoted','won','lost','completed','rejected','cancelled'];
    const current=String(record.status||'new');
    if(!statuses.includes(current))statuses.unshift(current);
    const options=statuses.map(status=>'<option value="'+escapeHtml(status)+'"'+(status===current?' selected':'')+'>'+escapeHtml(prettify(status))+'</option>').join('');
    return '<div class="nta27-statusbar"><div class="nta27-status-select"><label for="recordStatus">Status</label><select id="recordStatus">'+options+'</select></div><button type="button" class="btn btn-primary" id="saveRecordStatus">Update status</button><span class="nta27-status-help">Updates the request workflow</span></div>';
  };
  const contact = (record,used,type) => {
    const specs=[
      ['Contact name',['contact_name','primary_contact_name','name']],
      ['Email',['contact_email','primary_contact_email','email']],
      ['Phone',['contact_phone','primary_contact_phone','phone']],
      ['Preferred contact',['preferred_contact','preferred_contact_method']],
      ['Website',['website','website_url']],
      ['Company',['company_name','legal_company_name','business_name']]
    ];
    const rows=fieldBuilder(record,used)(specs);
    return section(type==='inquiry'?'Inquirer':'Contact',rows?table(rows):emptySection('No contact details available.'));
  };
  const notesSection = entries => {
    const notes=Array.isArray(entries)?entries:[];
    const list=notes.length?'<div class="nta27-timeline">'+notes.map(n=>'<div class="nta27-timeline-entry"><p>'+escapeHtml(n.note||'')+'</p><time>'+escapeHtml(format(n.created_at,'created_at'))+'</time></div>').join('')+'</div>':emptySection('No internal notes yet.');
    return section('Internal notes <span class="nta27-section-count">'+notes.length+'</span>',list+
      '<div class="nta27-action-form"><label for="newNote">Add a note</label><textarea id="newNote" rows="2" placeholder="Document a call, update, or next step"></textarea><button type="button" class="btn btn-primary" id="addNote">Save note</button></div>','nta27-notes');
  };
  const tasksSection = entries => {
    const tasks=Array.isArray(entries)?entries:[];
    const list=tasks.length?'<div class="nta27-task-list">'+tasks.map(t=>'<div class="nta27-task"><strong>'+escapeHtml(t.title||'Task')+'</strong><small>'+escapeHtml(prettify(String(t.priority||'normal')))+' · '+escapeHtml(prettify(String(t.status||'open')))+(t.due_at?' · Due '+escapeHtml(format(t.due_at,'due_at')):'')+'</small>'+(t.description?'<p>'+escapeHtml(t.description)+'</p>':'')+'</div>').join('')+'</div>':emptySection('No tasks for this request.');
    return section('Tasks <span class="nta27-section-count">'+tasks.length+'</span>',list+
      '<div class="nta27-action-form"><label for="taskTitle">New task</label><input id="taskTitle" placeholder="Follow up with shipper"><div class="nta27-form-inline"><label for="taskDue">Due date<input id="taskDue" type="datetime-local"></label><label for="taskPriority">Priority<select id="taskPriority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label></div><label for="taskDescription">Description</label><textarea id="taskDescription" rows="2" placeholder="Optional details"></textarea><button type="button" class="btn btn-gold" id="addTask">Create task</button></div>','nta27-tasks');
  };
  const metadata = (record,used) => {
    const metaKeys=['id','reference_number','source_page','created_at','updated_at'];
    const rows=metaKeys.filter(k=>!missing(record[k])).map(key=>{used.add(key);return renderRow(prettify(key),record[key],key)}).join('');
    const extra=Object.entries(record).filter(([key,value])=>!used.has(key)&&!privateKey(key)&&!missing(value)&&typeof value!=='object').map(([key,value])=>renderRow(prettify(key),value,key)).join('');
    if(!rows&&!extra)return '';
    return '<details class="nta27-extra"><summary>Record metadata and additional fields</summary>'+table(rows+extra)+'</details>';
  };
  const quoteContent = (r,used) => {
    const specs=[
      ['Load type',['load_type','shipment_type']],
      ['Equipment',['equipment_type','trailer_type']],
      ['Commodity',['commodity','freight_description']],
      ['Weight',['weight_lbs','weight']],
      ['Pallets','pallet_count'],
      ['Pieces','piece_count'],
      ['Loads','number_of_loads'],
      ['Dimensions','dimensions'],
      ['Hazardous','hazmat'],
      ['Temperature controlled','temperature_controlled'],
      ['Recurring shipment','recurring_shipment'],
      ['Accessorial services',['accessorials','accessorial_services']],
      ['Target rate','target_rate'],
      ['Cargo value','cargo_value']
    ];
    const freight=fieldBuilder(r,used)(specs);
    const instructions=first(r,['special_instructions','instructions','additional_information']);
    let more='';
    if(instructions){used.add(instructions.key);more=section('Special instructions','<div class="nta27-instructions">'+escapeHtml(format(instructions.value,instructions.key))+'</div>');}
    return '<div class="nta27-pickup-grid">'+quoteLocation(r,used,'pickup')+quoteLocation(r,used,'delivery')+'</div>'+
      (freight?section('Freight & equipment',table(freight),'nta27-freight'):'')+more;
  };
  const otherContent = (r,used,type) => {
    const sets={
      shipper:[['Business name',['company_name','business_name']],['Industry','industry'],['Business address','address'],['City','city'],['State','state'],['Postal code','postal_code'],['Preferred lanes','preferred_lanes'],['Monthly volume','monthly_volume'],['Freight type','freight_type'],['Equipment needs','equipment_types'],['Shipping frequency','shipping_frequency'],['Website','website']],
      carrier:[['Legal company',['legal_company_name','company_name']],['USDOT number','dot_number'],['MC number','mc_number'],['Equipment types','equipment_types'],['Service area','service_area'],['Preferred lanes','preferred_lanes'],['Business address','address'],['City','city'],['State','state'],['Postal code','postal_code'],['Fleet size','fleet_size'],['Insurance','insurance']],
      inquiry:[['Subject',['topic','subject']],['Message',['message','description']],['Company','company_name'],['Source','source_page']]
    };
    const rows=fieldBuilder(r,used)(sets[type]||[]);
    return rows?section(type==='inquiry'?'Inquiry information':'Business profile',table(rows),'nta27-profile'):emptySection('No additional business details provided.');
  };
  const summary = (type,r) => {
    if(type==='quote'){
      const from=[r.pickup_city,r.pickup_state].filter(v=>!missing(v)).join(', ');
      const to=[r.delivery_city,r.delivery_state].filter(v=>!missing(v)).join(', ');
      const route=from&&to?from+' → '+to:(from||to);
      const extras=[r.equipment_type,r.load_type].filter(v=>!missing(v));
      return [route,...extras].filter(Boolean).join('  ·  ');
    }
    if(type==='carrier')return [r.dot_number?'USDOT '+r.dot_number:null,r.mc_number?'MC '+r.mc_number:null].filter(Boolean).join('  ·  ');
    return [r.industry,r.topic].filter(v=>!missing(v)).join('  ·  ');
  };
  function render(type,record,response){
    if(!record||typeof record!=='object')throw new Error('This CRM record is unavailable.');
    const used=new Set(['status','reference_number','id','created_at','updated_at','source_page']);
    const main=(type==='quote'?quoteContent(record,used):otherContent(record,used,type));
    const more=metadata(record,used);
    return statusControl(record)+'<div class="nta27-crm-grid"><div class="nta27-crm-primary">'+main+more+'</div><aside class="nta27-crm-side">'+contact(record,used,type)+notesSection(response?.notes)+tasksSection(response?.tasks)+'</aside></div>';
  }
  window.NTACrmManagementView={render,summary};
})();