(() => {
  const WORK = Object.freeze({ BASE:'base', OPEN:'work_open', LOOP:'work_loop', CLOSE:'work_close' });
  let state=WORK.BASE, pendingStop=false;
  const el=document.createElement('video');
  el.id='workMotion'; el.className='visual'; el.playsInline=true; el.preload='auto';
  Object.assign(el.style,{zIndex:'2',opacity:'0',pointerEvents:'none'});
  const stage=document.getElementById('stage'); stage.insertBefore(el,document.getElementById('shade'));
  const assets={open:'',loop:'',close:''};
  function emit(){window.dispatchEvent(new CustomEvent('diza:workstate',{detail:{state}}))}
  function showWork(v){el.style.opacity=v?'1':'0'; const base=document.getElementById('base'); if(base)base.style.opacity=v?'0':'1'}
  function play(src,loop=false){if(!src)return Promise.resolve(false);el.src=src;el.loop=loop;el.currentTime=0;showWork(true);return el.play().then(()=>true).catch(()=>false)}
  function configure(v={}){assets.open=v.open||assets.open;assets.loop=v.loop||assets.loop;assets.close=v.close||assets.close}
  async function start(){
    if(state!==WORK.BASE)return false;
    state=WORK.OPEN;emit();
    if(!await play(assets.open)){state=WORK.LOOP;emit();await play(assets.loop,true);return true}
    return true;
  }
  function stop(){if(state===WORK.LOOP){pendingStop=true;return true} if(state===WORK.OPEN){pendingStop=true;return true} return false}
  async function close(){
    pendingStop=false;state=WORK.CLOSE;emit();el.loop=false;
    if(await play(assets.close))return;
    finish();
  }
  function finish(){showWork(false);el.pause();el.removeAttribute('src');state=WORK.BASE;emit();window.DizaAvatar?.showBase?.()}
  el.addEventListener('ended',async()=>{
    if(state===WORK.OPEN){state=WORK.LOOP;emit();if(pendingStop)return close();if(!await play(assets.loop,true))return close()}
    else if(state===WORK.CLOSE)finish();
  });
  el.addEventListener('timeupdate',()=>{if(state===WORK.LOOP&&pendingStop&&el.duration&&el.currentTime>=el.duration-.12)close()});
  window.DizaWork={configure,start,stop,getState:()=>state,states:WORK};
})();
