(() => {
 const A={
  IDLE:'IDLE',SPEAK:'SPEAK',SHOW_IMAGE:'SHOW_IMAGE',SHOW_CHART:'SHOW_CHART',
  SHOW_DATA:'SHOW_DATA',HIDE_CANVAS:'HIDE_CANVAS',POINT_LEFT:'POINT_LEFT',
  POINT_RIGHT:'POINT_RIGHT',PRESENT:'PRESENT',THINK:'THINK',CONFIRM:'CONFIRM'
 };
 function dispatch(command={}){
  const action=String(command.action||'').toUpperCase(),p=command.payload||{};
  if(!action) return {ok:false,error:'missing_action'};
  switch(action){
   case A.IDLE: window.DizaAvatar?.setSpeaking(false); break;
   case A.SPEAK:
    if(p.text) window.DizaAvatar?.setTranscript(p.text,'Diza');
    window.DizaAvatar?.setSpeaking(true); break;
   case A.SHOW_IMAGE: window.DizaCanvas?.showImage(p); break;
   case A.SHOW_CHART: window.DizaCanvas?.showChart(p); break;
   case A.SHOW_DATA: window.DizaCanvas?.showData(p); break;
   case A.HIDE_CANVAS: window.DizaCanvas?.hide(); break;
   case A.POINT_LEFT:
   case A.POINT_RIGHT:
   case A.PRESENT:
   case A.THINK:
   case A.CONFIRM:
    document.dispatchEvent(new CustomEvent('diza:gesture',{detail:{action,payload:p}})); break;
   default:return {ok:false,error:'unknown_action',action};
  }
  document.dispatchEvent(new CustomEvent('diza:action',{detail:{action,payload:p}}));
  return {ok:true,action};
 }
 function present(plan={}){
  if(plan.content?.type==='image') dispatch({action:A.SHOW_IMAGE,payload:plan.content});
  if(plan.content?.type==='chart') dispatch({action:A.SHOW_CHART,payload:plan.content});
  if(plan.content?.type==='data') dispatch({action:A.SHOW_DATA,payload:plan.content});
  if(plan.gesture) dispatch({action:String(plan.gesture).toUpperCase(),payload:{}});
  if(plan.speech) dispatch({action:A.SPEAK,payload:{text:plan.speech}});
  return {ok:true};
 }
 window.DizaActions={A,dispatch,present};
})();