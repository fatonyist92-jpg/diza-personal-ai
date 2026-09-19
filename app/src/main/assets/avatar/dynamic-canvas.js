(() => {
  const state = { visible:false, type:null, payload:null };

  function root() {
    let el=document.getElementById('dynamicCanvas');
    if(el) return el;
    el=document.createElement('section');
    el.id='dynamicCanvas';
    el.setAttribute('aria-live','polite');
    el.innerHTML='<div class="dc-card"><button class="dc-close" aria-label="Tutup">×</button><div class="dc-body"></div></div>';
    document.getElementById('stage').appendChild(el);
    el.querySelector('.dc-close').onclick=hide;
    return el;
  }

  function body(){ return root().querySelector('.dc-body'); }
  function esc(v){ const d=document.createElement('div'); d.textContent=String(v??''); return d.innerHTML; }

  function show(type,payload={}){
    const el=root(),b=body();
    state.visible=true; state.type=type; state.payload=payload;
    if(type==='image'){
      b.innerHTML='<img class="dc-image" src="'+esc(payload.url||'')+'" alt="'+esc(payload.alt||'')+'"><div class="dc-title">'+esc(payload.title||'')+'</div>';
    } else if(type==='chart'){
      const values=Array.isArray(payload.values)?payload.values:[];
      const max=Math.max(1,...values.map(x=>Number(x.value)||0));
      b.innerHTML='<div class="dc-title">'+esc(payload.title||'Data')+'</div><div class="dc-chart">'+values.map(x=>'<div class="dc-row"><span>'+esc(x.label)+'</span><div class="dc-track"><i style="width:'+Math.max(0,Math.min(100,(Number(x.value)||0)/max*100))+'%"></i></div><b>'+esc(x.value)+'</b></div>').join('')+'</div>';
    } else {
      const rows=Array.isArray(payload.rows)?payload.rows:[];
      b.innerHTML='<div class="dc-title">'+esc(payload.title||'Data')+'</div><div class="dc-data">'+rows.map(r=>'<div><span>'+esc(r.label)+'</span><b>'+esc(r.value)+'</b></div>').join('')+'</div>';
    }
    el.classList.add('show');
    return state;
  }
  function hide(){ const el=root(); el.classList.remove('show'); state.visible=false; return state; }
  window.DizaCanvas={showImage:p=>show('image',p),showChart:p=>show('chart',p),showData:p=>show('data',p),hide,getState:()=>({...state})};
})();