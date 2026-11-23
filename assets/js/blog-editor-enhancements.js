/* NTA Logistics - Blog Editor controls and safe rich text serialisation.
   Works with the existing blog_save/blog_get API in admin.js. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const editor=$('#richEditor');
  const toolbar=$('#blogToolbar');
  if(!editor||!toolbar)return;

  const permittedTags=new Set('p div br h1 h2 h3 h4 h5 h6 blockquote pre code b strong i em u s strike sub sup span font ul ol li a img iframe figure figcaption table thead tbody tfoot tr th td hr'.split(' '));
  const prohibitedTags=new Set('script style object embed form input button select textarea link meta base template noscript svg math canvas audio video source'.split(' '));
  const safeProperties=new Set(['color','background-color','text-align','font-family','font-size','font-weight','font-style','text-decoration','margin-left','margin-right','list-style-type','white-space','vertical-align']);
  const safeUrl=value=>{
    const url=String(value||'').trim();
    if(/^(https?:|mailto:)/i.test(url)){
      try{const parsed=new URL(url);if(['http:','https:','mailto:'].includes(parsed.protocol))return url;}catch{}
      return '';
    }
    if((url.startsWith('/')&&!url.startsWith('//'))||url.startsWith('#'))return url;
    return '';
  };
  function safeVideoEmbed(url){
    try{
      const u=new URL(String(url||'').trim());
      if(u.protocol!=='https:')return '';
      const host=u.hostname.toLowerCase().replace(/^www\./,'');
      let match=null,videoId=null;
      if(host==='youtu.be')videoId=u.pathname.split('/')[1];
      else if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)){
        if(u.pathname==='/watch')videoId=u.searchParams.get('v');
        else{match=u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{8,20})\/?$/);videoId=match?.[1];}
      }
      if(videoId&&/^[\w-]{8,20}$/.test(videoId))return 'https://www.youtube-nocookie.com/embed/'+videoId;
      if(['vimeo.com','player.vimeo.com'].includes(host)){
        match=u.pathname.match(/^\/(?:video\/)?(\d{5,14})\/?$/);
        if(match)return 'https://player.vimeo.com/video/'+match[1];
      }
    }catch{}
    return '';
  }
  function sanitizeHTML(html){
    const template=document.createElement('template');
    template.innerHTML=String(html||'');
    function walk(parent){
      for(const child of [...parent.childNodes]){
        if(child.nodeType===8){child.remove();continue;}
        if(child.nodeType!==1)continue;
        const name=child.tagName.toLowerCase();
        if(prohibitedTags.has(name)){child.remove();continue;}
        if(!permittedTags.has(name)){
          walk(child);
          child.replaceWith(...child.childNodes);
          continue;
        }
        for(const attribute of [...child.attributes]){
          const key=attribute.name.toLowerCase(),value=attribute.value.trim();
          if(key.startsWith('on')){child.removeAttribute(attribute.name);continue;}
          if(key==='style'){
            const approved=[];
            for(const line of value.split(';')){
              const i=line.indexOf(':');if(i<1)continue;
              const prop=line.slice(0,i).trim().toLowerCase(),val=line.slice(i+1).trim();
              if(!safeProperties.has(prop)||!val||/[;{}<>\\]/.test(val)||/url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:/i.test(val))continue;
              if(prop==='font-size'&&!/^(?:\d{1,3}(?:\.\d+)?(?:px|pt|rem|em|%)|small|medium|large|larger|smaller)$/i.test(val))continue;
              if(prop==='font-family'&&!/^[a-z0-9,\s"'_-]{1,120}$/i.test(val))continue;
              if(prop==='text-align'&&!/^(left|right|center|justify|start|end)$/i.test(val))continue;
              if(prop==='margin-left'||prop==='margin-right'){
                if(!/^\d{1,3}(px|em|rem|%)$/.test(val))continue;
              }
              if(prop==='color'||prop==='background-color'){
                if(!/^(?:#[0-9a-f]{3,8}|rgb[a]?\([\d.,\s%]+\)|[a-z]{3,24})$/i.test(val))continue;
              }
              approved.push(prop+': '+val);
            }
            if(approved.length)child.setAttribute('style',approved.join('; '));
            else child.removeAttribute('style');
            continue;
          }
          if(name==='a'&&key==='href'){
            const url=safeUrl(value);if(url)child.setAttribute('href',url);else child.removeAttribute('href');
            continue;
          }
          if(name==='img'&&key==='src'){
            const url=safeUrl(value);if(url&&url!=='#'&&!url.startsWith('mailto:'))child.setAttribute('src',url);else child.removeAttribute('src');
            continue;
          }
          if(name==='iframe'&&key==='src'){
            const embed=safeVideoEmbed(value);if(embed)child.setAttribute('src',embed);else child.removeAttribute('src');
            continue;
          }
          const allowed=(name==='a'&&['title','target','rel'].includes(key))||
            (name==='img'&&['alt','title','loading','width','height'].includes(key))||
            (name==='iframe'&&['title','width','height','loading','allowfullscreen','referrerpolicy'].includes(key))||
            (name==='font'&&['color','face','size'].includes(key))||
            (['th','td'].includes(name)&&['colspan','rowspan'].includes(key));
          if(!allowed)child.removeAttribute(attribute.name);
        }
        if(name==='a'&&child.hasAttribute('href'))child.setAttribute('rel','noopener noreferrer');
        if(name==='img'&&child.hasAttribute('src'))child.setAttribute('loading','lazy');
        if(name==='iframe'){
          if(!child.hasAttribute('src')){child.remove();continue;}
          child.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');
          child.setAttribute('loading','lazy');
          child.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
        }
        walk(child);
      }
    }
    walk(template.content);
    return template.innerHTML;
  }

  let savedRange=null;
  let mediaRange=null;
  let sourceOpen=false;
  let matchCursor=0;
  const isInEditor=node=>!!node&&(node===editor||editor.contains(node));
  const selection=()=>window.getSelection();
  const capture=()=>{
    const s=selection();
    if(!s?.rangeCount||!isInEditor(s.getRangeAt(0).commonAncestorContainer))return;
    savedRange=s.getRangeAt(0).cloneRange();
  };
  const restore=(range=savedRange)=>{
    if(!range||!isInEditor(range.commonAncestorContainer))return false;
    const s=selection();s.removeAllRanges();s.addRange(range.cloneRange());return true;
  };
  const dirty=()=>{
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    updateCounts();
  };
  function command(name,value=null){
    if(sourceOpen)return;
    editor.focus();restore();
    document.execCommand(name,false,value);
    capture();dirty();
  }
  const label=(id,value)=>{const el=$('#'+id);if(el)el.textContent=value;};
  function updateCounts(){
    const words=(editor.innerText||editor.textContent||'').trim().match(/\S+/g)||[];
    const chars=(editor.innerText||editor.textContent||'').length;
    label('blogWordCount',words.length+' '+(words.length===1?'word':'words'));
    label('blogCharacterCount',chars+' '+(chars===1?'character':'characters'));
    label('blogReadingTime',Math.max(0,Math.ceil(words.length/220))+' min read');
    label('blogExcerptCount',($('#postExcerpt')?.value||'').length+' / 600 characters');
    label('blogSeoTitleCount',($('#seoTitle')?.value||'').length+' / 80');
    label('blogSeoDescCount',($('#seoDescription')?.value||'').length+' / 320');
    const hasFeatured=!!$('#featuredImagePath')?.value;
    const placeholder=$('#blogFeaturedEmpty'),image=$('#featuredPreview');
    if(placeholder)placeholder.hidden=hasFeatured;
    if(image)image.hidden=!hasFeatured;
  }
  const sourcePanel=$('#blogSourcePanel'),sourceInput=$('#blogSourceTextarea');
  const savingControls=['#saveDraft','#publishPost','#previewPost'];
  function closeSource(){
    sourcePanel.hidden=true;sourceOpen=false;
    editor.hidden=false;toolbar.classList.remove('nta27-source-active');
    $('#blogSourceToggle').setAttribute('aria-pressed','false');
    savingControls.forEach(selector=>{const el=$(selector);if(el)el.disabled=false;});
  }
  function openSource(){
    if(sourceOpen)return;
    sourceInput.value=editor.innerHTML;
    sourceOpen=true;sourcePanel.hidden=false;editor.hidden=true;
    toolbar.classList.add('nta27-source-active');
    $('#blogSourceToggle').setAttribute('aria-pressed','true');
    savingControls.forEach(selector=>{const el=$(selector);if(el)el.disabled=true;});
    sourceInput.focus();
  }
  $('#blogSourceApply').addEventListener('click',()=>{
    editor.innerHTML=sanitizeHTML(sourceInput.value);
    closeSource();dirty();
    label('saveState','HTML changes applied — save to keep them');
    editor.focus();
  });
  $('#blogSourceCancel').addEventListener('click',closeSource);
  $('#blogSourceToggle').addEventListener('click',()=>{if(sourceOpen)closeSource();else openSource();});

  toolbar.addEventListener('mousedown',event=>{
    // Keep the caret in the article when a formatting button is pressed.
    if(event.target.closest('button'))event.preventDefault();
  });
  editor.addEventListener('keyup',capture);
  editor.addEventListener('mouseup',capture);
  document.addEventListener('selectionchange',()=>{
    const s=selection();
    if(s?.rangeCount&&isInEditor(s.getRangeAt(0).commonAncestorContainer)){
      capture();
      for(const item of toolbar.querySelectorAll('button[data-command]')){
        try{item.setAttribute('aria-pressed',String(document.queryCommandState(item.dataset.command)));}
        catch{}
      }
    }
  });
  toolbar.addEventListener('click',event=>{
    const btn=event.target.closest('[data-blog-action]');
    if(!btn||sourceOpen)return;
    const action=btn.dataset.blogAction;
    if(['undo','redo','superscript','subscript','justifyLeft','justifyCenter','justifyRight','justifyFull','indent','outdent','horizontalRule'].includes(action)){
      command(action==='horizontalRule'?'insertHorizontalRule':action);
      return;
    }
    if(action==='blockquote'){command('formatBlock','BLOCKQUOTE');return;}
    if(action==='code'){command('formatBlock','PRE');return;}
    if(action==='table'){capture();$('#blogTableForm').hidden=false;$('#blogTableRows').focus();return;}
    if(action==='video'){capture();$('#blogVideoForm').hidden=false;$('#blogVideoUrl').focus();return;}
    if(action==='image'){
      mediaRange=savedRange?.cloneRange()||null;
      if(typeof window.NTAAdminNavigate==='function')window.NTAAdminNavigate('media','#/page/media');
      else document.querySelector('[data-admin-panel="media"]')?.click();
      return;
    }
    if(action==='source')return;
  });
  const blockFormat=$('#blogBlockFormat');
  blockFormat?.addEventListener('mousedown',capture);
  blockFormat?.addEventListener('change',()=>{editor.focus();restore();},true);
  toolbar.querySelectorAll('select[data-blog-format]').forEach(control=>{
    control.addEventListener('mousedown',capture);
    control.addEventListener('change',()=>{
      if(control.value)command(control.dataset.blogFormat,control.value);
      control.selectedIndex=0;
    });
  });
  toolbar.querySelectorAll('input[data-blog-color]').forEach(input=>{
    input.addEventListener('pointerdown',capture);
    input.addEventListener('change',()=>command(input.dataset.blogColor,input.value));
  });
  $('#blogVideoCancel').addEventListener('click',()=>{$('#blogVideoForm').hidden=true;$('#blogVideoMessage').textContent='';});
  $('#blogVideoForm').addEventListener('submit',event=>{
    event.preventDefault();
    const embed=safeVideoEmbed($('#blogVideoUrl').value);
    if(!embed){$('#blogVideoMessage').textContent='Enter a valid HTTPS YouTube or Vimeo video link.';return;}
    const html='<iframe src="'+embed+'" title="Embedded blog video" width="640" height="360" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe><p><br></p>';
    command('insertHTML',html);
    $('#blogVideoForm').hidden=true;$('#blogVideoUrl').value='';$('#blogVideoMessage').textContent='';
  });
  $('#blogTableCancel').addEventListener('click',()=>{$('#blogTableForm').hidden=true;});
  $('#blogTableForm').addEventListener('submit',event=>{
    event.preventDefault();
    const rows=Number($('#blogTableRows').value),cols=Number($('#blogTableColumns').value);
    if(!Number.isInteger(rows)||rows<1||rows>20||!Number.isInteger(cols)||cols<1||cols>10)return;
    let html='<table><tbody>';
    for(let r=0;r<rows;r++){
      html+='<tr>';
      for(let c=0;c<cols;c++)html+='<'+(r===0&&$('#blogTableHeader').checked?'th':'td')+'> </'+(r===0&&$('#blogTableHeader').checked?'th':'td')+'>';
      html+='</tr>';
    }
    html+='</tbody></table><p><br></p>';
    command('insertHTML',html);
    $('#blogTableForm').hidden=true;
  });

  function insertMedia(url,alt=''){
    if(sourceOpen)closeSource();
    const safe=safeUrl(url);
    if(!safe||safe.startsWith('mailto:'))return false;
    editor.focus();
    const range=mediaRange;
    const recovered=range&&isInEditor(range.commonAncestorContainer)&&restore(range);
    if(!recovered&&savedRange)restore();
    const figure=document.createElement('figure'),img=document.createElement('img');
    img.src=safe;img.alt=String(alt||'');img.loading='lazy';
    figure.append(img);
    const s=selection();
    if(s?.rangeCount&&isInEditor(s.getRangeAt(0).commonAncestorContainer)){
      const insertion=s.getRangeAt(0);insertion.deleteContents();insertion.insertNode(figure);
      const after=document.createRange();after.setStartAfter(figure);after.collapse(true);
      s.removeAllRanges();s.addRange(after);
    }else editor.append(figure);
    mediaRange=null;capture();dirty();return true;
  }

  const findForm=$('#blogFindBar'),findBox=$('#blogFindText');
  function textMatches(){
    const query=findBox.value.toLowerCase();
    if(!query)return [];
    const nodes=[],walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())nodes.push(walker.currentNode);
    const matches=[];
    for(const node of nodes){
      const text=node.textContent.toLowerCase();let start=0;
      while(start<text.length){
        const index=text.indexOf(query,start);if(index<0)break;
        matches.push({node,start:index,length:query.length});start=index+Math.max(1,query.length);
      }
    }
    return matches;
  }
  function selectMatch(match){
    const s=selection(),r=document.createRange();
    r.setStart(match.node,match.start);r.setEnd(match.node,match.start+match.length);
    editor.focus();s.removeAllRanges();s.addRange(r);savedRange=r.cloneRange();
  }
  function findNext(){
    const matches=textMatches();
    if(!matches.length){label('blogFindMessage','No matches found.');return null;}
    if(matchCursor>=matches.length)matchCursor=0;
    const match=matches[matchCursor++];selectMatch(match);
    label('blogFindMessage','Match '+matchCursor+' of '+matches.length);
    return match;
  }
  $('#blogFindToggle').addEventListener('click',()=>{findForm.hidden=!findForm.hidden;if(!findForm.hidden)findBox.focus();});
  $('#blogFindClose').addEventListener('click',()=>{findForm.hidden=true;editor.focus();});
  findForm.addEventListener('submit',event=>{event.preventDefault();findNext();});
  $('#blogFindNext').addEventListener('click',()=>findNext());
  findBox.addEventListener('input',()=>{matchCursor=0;label('blogFindMessage','');});
  $('#blogReplaceOne').addEventListener('click',()=>{
    const match=findNext();if(!match)return;
    match.node.replaceData(match.start,match.length,$('#blogReplaceText').value);
    label('blogFindMessage','Replaced one match.');dirty();
  });
  $('#blogReplaceAll').addEventListener('click',()=>{
    const matches=textMatches();if(!matches.length){label('blogFindMessage','No matches found.');return;}
    for(const match of matches.reverse())match.node.replaceData(match.start,match.length,$('#blogReplaceText').value);
    matchCursor=0;label('blogFindMessage','Replaced '+matches.length+' matches.');dirty();
  });

  $('#blogFocusToggle').addEventListener('click',()=>{
    const panel=$('.nta27-blog-editor'),on=panel.classList.toggle('nta27-editor-focus');
    $('#blogFocusToggle').textContent=on?'Exit focus':'Focus mode';
    $('#blogFocusToggle').setAttribute('aria-pressed',String(on));
  });
  $('#blogBackToPosts').addEventListener('click',()=>{
    if(typeof window.NTAAdminNavigate==='function')window.NTAAdminNavigate('blog','#/page/blog');
    else document.querySelector('[data-admin-panel="blog"]')?.click();
  });
  document.addEventListener('keydown',event=>{
    if(!$('.admin-panel[data-panel="editor"]')?.classList.contains('active'))return;
    const key=event.key.toLowerCase(),modifier=event.ctrlKey||event.metaKey;
    if(event.key==='Escape'){if(sourceOpen)closeSource();if(!findForm.hidden)findForm.hidden=true;return;}
    if(modifier&&key==='s'){
      event.preventDefault();
      if(!sourceOpen)$('#postStatusEditor').value==='draft'?$('#saveDraft').click():$('#publishPost').click();
    }
    if(modifier&&key==='k'&&isInEditor(document.activeElement)){
      event.preventDefault();
      toolbar.querySelector('[data-command="createLink"]')?.click();
    }
    if(modifier&&key==='f'&&isInEditor(document.activeElement)){
      event.preventDefault();findForm.hidden=false;findBox.focus();
    }
  });
  const updateFields=['postTitle','postExcerpt','seoTitle','seoDescription','featuredImageAlt','featuredImagePath'];
  updateFields.forEach(id=>$('#'+id)?.addEventListener('input',updateCounts));
  new MutationObserver(updateCounts).observe(editor,{subtree:true,childList:true,characterData:true});
  new MutationObserver(updateCounts).observe($('#featuredPreview'),{attributes:true,attributeFilter:['src']});
  updateCounts();
  window.NTABlogEditor={
    sanitizeHTML,
    getHTML(){if(sourceOpen)throw Error('Apply or cancel HTML changes before saving.');return sanitizeHTML(editor.innerHTML);},
    isSourceOpen(){return sourceOpen;},
    insertMedia,
    captureMediaSelection(){capture();mediaRange=savedRange?.cloneRange()||null;},
    refresh:updateCounts
  };
})();