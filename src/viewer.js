import {clamp} from './journey.js';
import {INITIAL_YAW,ROTATION_SECONDS} from './optics.js';

const autoYaw=2*Math.PI/ROTATION_SECONDS;
const maxPitch=.64;
const sensitivity=.006;

export function createViewerMotion() {
  let yaw=INITIAL_YAW, pitch=0, zoom=1, desiredZoom=1;
  let yawSpeed=0, pitchSpeed=0, dragging=false, movedAt=0;

  return {
    begin(time) {
      dragging=true;
      yawSpeed=pitchSpeed=0;
      movedAt=time;
    },
    drag(dx,dy,time) {
      const seconds=clamp((time-movedAt)/1000,.008,.08);
      const horizontal=dx*sensitivity, vertical=dy*sensitivity;
      yaw+=horizontal;
      pitch=clamp(pitch+vertical,-maxPitch,maxPitch);
      yawSpeed=.48*yawSpeed+.52*clamp(horizontal/seconds,-4,4);
      pitchSpeed=.48*pitchSpeed+.52*clamp(vertical/seconds,-2,2);
      movedAt=time;
    },
    end(time) {
      dragging=false;
      const remaining=Math.exp(-Math.max(0,time-movedAt)/74);
      yawSpeed*=remaining;
      pitchSpeed*=remaining;
    },
    nudge(dx,dy) {
      yaw+=dx;
      pitch=clamp(pitch+dy,-maxPitch,maxPitch);
    },
    magnify(factor) {
      desiredZoom=clamp(desiredZoom*factor,.69,1.58);
    },
    tick(seconds,still,fit) {
      if(!dragging && !still){
        yaw+=yawSpeed*seconds;
        pitch=clamp(pitch+pitchSpeed*seconds,-maxPitch,maxPitch);
        yawSpeed=autoYaw+(yawSpeed-autoYaw)*Math.exp(-3.5*seconds);
        pitchSpeed*=Math.exp(-6*seconds);
      }
      const target=Math.min(desiredZoom,fit(yaw,pitch));
      zoom=still?target:zoom+(target-zoom)*(1-Math.exp(-12*seconds));
      return {yaw,pitch,zoom};
    },
  };
}

export function bindViewer(stage,motion) {
  const control=new AbortController();
  const {signal}=control;
  let drag;
  stage.tabIndex=0;
  stage.classList.add('cube-controls');
  stage.setAttribute('aria-describedby','cube-controls');
  stage.addEventListener('pointerdown',event=>{
    if(drag||event.button!==0)return;
    stage.focus({preventScroll:true});
    stage.setPointerCapture(event.pointerId);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    motion.begin(event.timeStamp);
    stage.classList.add('dragging');
  },{signal});
  stage.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    if((event.buttons&1)===0){release(event);return;}
    motion.drag(event.clientX-drag.x,event.clientY-drag.y,event.timeStamp);
    drag.x=event.clientX;drag.y=event.clientY;
  },{signal});
  const release=event=>{
    if(drag?.id!==event.pointerId)return;
    motion.end(event.timeStamp);
    stage.classList.remove('dragging');
    drag=null;
  };
  for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,release,{signal});
  stage.addEventListener('wheel',event=>{
    if(!event.deltaY||event.ctrlKey)return;
    event.preventDefault();
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
    motion.magnify(Math.exp(-clamp(pixels,-220,220)*.0018));
  },{signal,passive:false});
  const keys={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]};
  stage.addEventListener('keydown',event=>{
    if(keys[event.key])motion.nudge(...keys[event.key]);
    else if(['+','=','-'].includes(event.key))motion.magnify(event.key==='-'? .87:1.15);
    else return;
    event.preventDefault();
  },{signal});
  return ()=>{
    control.abort();
    stage.removeAttribute('tabindex');
    stage.removeAttribute('aria-describedby');
    stage.classList.remove('cube-controls','dragging');
  };
}
