(() => {
 const clips={POINT_LEFT:'point_left',POINT_RIGHT:'point_right',PRESENT:'present_center',THINK:'thinking',CONFIRM:'confirm'};
 let current='idle';
 function play(action,payload={}){
  const clip=clips[action];
  if(!clip)return false;
  current=clip;
  document.documentElement.dataset.dizaGesture=clip;
  document.dispatchEvent(new CustomEvent('diza:motion',{detail:{clip,action,payload}}));
  const duration=Math.max(300,Number(payload.duration)||1200);
  setTimeout(()=>{if(current===clip){current='idle';document.documentElement.dataset.dizaGesture='idle';}},duration);
  return true;
 }
 document.addEventListener('diza:gesture',e=>play(e.detail?.action,e.detail?.payload));
 window.DizaGestures={play,getCurrent:()=>current,clips:{...clips}};
})();