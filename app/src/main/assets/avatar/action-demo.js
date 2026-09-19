(() => {
 const demo = {
  chart(){
   return window.DizaActions?.present({
    speech:'Ton, ini contoh Dynamic Canvas. Grafiknya muncul tanpa generate video baru.',
    gesture:'POINT_RIGHT',
    content:{type:'chart',title:'DIZA Live Avatar · Demo',values:[
     {label:'Brain',value:100},{label:'Canvas',value:100},{label:'Avatar',value:65},{label:'Budget',value:0}
    ]}
   });
  },
  data(){
   return window.DizaActions?.present({
    speech:'Status pembangunan sementara begini.',
    gesture:'PRESENT',
    content:{type:'data',title:'Stark Industries Cikupa',rows:[
     {label:'Realtime brain',value:'READY'},
     {label:'Action bridge',value:'READY'},
     {label:'Dynamic Canvas',value:'READY'},
     {label:'Opening V2',value:'WAIT THURSDAY'},
     {label:'Fuel',value:'SEMPOL GOCENG'}
    ]}
   });
  },
  clear(){ window.DizaCanvas?.hide(); window.DizaAvatar?.setSpeaking(false); }
 };
 window.DizaDemo=demo;
})();