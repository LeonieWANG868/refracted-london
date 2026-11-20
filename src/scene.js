import * as T from '../vendor/three.module.js';
import {stopPoint} from './journey.js';
import {createCity} from './city.js';
import {createGlass} from './glass.js';
import {createBirds} from './birds.js';
import {createBeam,opticalPoint,pointTexture} from './beam.js';
import {CUBE_HALF,PLATE_WIDTH,PLATE_HEIGHT,PLATE_YAW,exhibitLayout,projectionTarget} from './optics.js';

import {bindViewer,createViewerMotion} from './viewer.js';

export function createScene(stage,projection,data,layers) {
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'default'});
  renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000,1);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.domElement.className='webgl';
  renderer.domElement.setAttribute('aria-hidden','true');
  stage.prepend(renderer.domElement);
  stage.classList.add('webgl-ready');

  const resolution=new T.Vector2();
  const world=new T.Scene();
  const camera=new T.OrthographicCamera(-6,6,4,-4,.1,60);
  camera.position.set(3.25,7.55,15.6);
  camera.lookAt(.05,.0,-.44);
  camera.updateMatrixWorld();

  const rotating=new T.Group();
  const glass=createGlass(renderer,resolution);
  rotating.add(glass.mesh);
  const city=createCity(layers,renderer.getPixelRatio());
  const birds=createBirds(renderer.getPixelRatio());
  rotating.add(city.group,birds.group);
  world.add(rotating);

  const planeTexture=new T.CanvasTexture(projection.canvas);
  planeTexture.colorSpace=T.SRGBColorSpace;
  const plane=new T.Mesh(new T.PlaneGeometry(PLATE_WIDTH,PLATE_HEIGHT),
    new T.MeshBasicMaterial({map:planeTexture,side:T.FrontSide,toneMapped:false}));
  plane.rotation.y=PLATE_YAW;
  world.add(plane);

  const texture=pointTexture();
  const emitter=opticalPoint(texture,0xe1fcff,.42,.91);
  world.add(emitter);
  const beam=createBeam(texture,resolution);
  world.add(beam.group);

  const pins=[opticalPoint(texture,0x79c3cd,.19,.43),opticalPoint(texture,0xada4d1,.19,.43)];
  pins.forEach(pin=>rotating.add(pin));
  let layout,target,selectedJourney;
  let selectedStations=[];
  let start=null,lastTime=null,frame;
  const motion=createViewerMotion();
  const unbind=bindViewer(stage,motion);
  const corners=[-CUBE_HALF,CUBE_HALF].flatMap(x=>[-CUBE_HALF,CUBE_HALF].flatMap(y=>[-CUBE_HALF,CUBE_HALF].map(z=>new T.Vector3(x,y,z))));
  const orientation=new T.Euler(0,0,0,'YXZ');
  const corner=new T.Vector3();
  const rotation=new T.Quaternion();
  const boundRadius=Math.sqrt(3)*CUBE_HALF;
  const sourceInView=new T.Vector3();

  function placeTarget() {
    const uv=selectedJourney ? projection.firstLight(selectedJourney) : [.50,.50];
    target=projectionTarget(layout,uv);
  }

  function resize(){
    const {width,height}=stage.getBoundingClientRect();
    if(!width||!height)return;
    const aspect=width/height;
    const compact=aspect<1.32;
    layout=exhibitLayout(compact);
    const {center,source,plate,plateScale}=layout;
    plane.position.fromArray(plate);
    plane.scale.setScalar(plateScale);
    placeTarget();
    emitter.position.fromArray(source);
    rotating.position.fromArray(center);

    const viewX=point=>new T.Vector3(...point).applyMatrix4(camera.matrixWorldInverse).x;
    sourceInView.fromArray(source).applyMatrix4(camera.matrixWorldInverse);
    const extentLeft=Math.min(sourceInView.x-.32,viewX(center)-3.36);
    const extentRight=Math.max(viewX(plate)+(compact?1.50:2.00)*plateScale,viewX(center)+3.22);
    const centerX=(extentLeft+extentRight)/2;
    const halfHeight=Math.max(3.76,(extentRight-extentLeft+.43)/(2*aspect));
    const pivot=new T.Vector3(...center).applyMatrix4(camera.matrixWorldInverse);
    frame={left:centerX-halfHeight*aspect,right:centerX+halfHeight*aspect,top:halfHeight,bottom:-halfHeight,pivot};
    aperture(1);
    renderer.setSize(width,height,false);
    renderer.getDrawingBufferSize(resolution);
    glass.resize();
  }

  function aperture(zoom) {
    const {left,right,top,bottom,pivot}=frame;
    camera.left=pivot.x+(left-pivot.x)/zoom;
    camera.right=pivot.x+(right-pivot.x)/zoom;
    camera.top=pivot.y+(top-pivot.y)/zoom;
    camera.bottom=pivot.y+(bottom-pivot.y)/zoom;
    camera.updateProjectionMatrix();
  }

  function fit(yaw,pitch) {
    const {left,right,top,bottom,pivot}=frame;
    rotation.setFromEuler(orientation.set(pitch,yaw,0));
    let limit=Math.min(1.58,(pivot.x-left-.16)/Math.max(.001,pivot.x-sourceInView.x));
    for(const vertex of corners){
      const {x,y}=corner.copy(vertex).applyQuaternion(rotation).transformDirection(camera.matrixWorldInverse).multiplyScalar(boundRadius);
      limit=Math.min(limit, ((x<0?pivot.x-left:right-pivot.x)-.10)/Math.max(Math.abs(x),.001),
        ((y<0?pivot.y-bottom:top-pivot.y)-.10)/Math.max(Math.abs(y),.001));
    }
    return Math.max(.9,limit);
  }

  const dimensions=new ResizeObserver(resize);
  dimensions.observe(stage);resize();

  function update(progress,time,still){
    if(!frame)return;
    start??=time;
    lastTime??=time;
    const {yaw,pitch,zoom}=motion.tick(Math.min(.06,(time-lastTime)/1000),still,fit);
    lastTime=time;
    aperture(zoom);
    rotating.rotation.set(pitch,yaw,0,'YXZ');
    city.update(time-start,still);
    for(const [index,pin] of pins.entries()){
      const point=selectedStations[index];
      if(point)pin.position.fromArray(point).multiplyScalar(city.group.scale.x).add(city.group.position);
      pin.visible=Boolean(point)&&Math.max(Math.abs(pin.position.x),Math.abs(pin.position.z))<CUBE_HALF-.15;
    }
    birds.update(time-start,still,progress>0&&progress<1);
    const activation=still||progress<=0||progress>.11?0:Math.sin(Math.PI*progress/.11);
    emitter.material.opacity=.74+.24*activation;
    emitter.scale.setScalar(.38+.13*activation);
    beam.update(progress,layout.source,target,layout.center,yaw,pitch);
    glass.draw(world,camera);
  }
  function select(origin,destination){
    selectedStations=[origin,destination].map(stop=>stop?city.station(stopPoint(stop)):null);
  }
  function dispose(){
    dimensions.disconnect();
    unbind();
    world.traverse(item=>{
      item.geometry?.dispose();
      item.material?.dispose();
    });
    glass.dispose();
    planeTexture.dispose();
    texture.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  return {
    update,select,dispose,reset:beam.reset,
    setJourney(journey,metrics){
      selectedJourney=journey;
      placeTarget();
      beam.setJourney(journey,metrics,data.bounds);
    },
    projectionChanged:()=>{planeTexture.needsUpdate=true;},
  };
}
