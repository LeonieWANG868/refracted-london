import * as T from '../vendor/three.module.js';
import {CUBE_HALF,GLASS_RADIUS} from './optics.js';

export function roundedGlassGeometry() {
  const subdivisions=14;
  const half=CUBE_HALF;
  const inner=half-GLASS_RADIUS;
  const edgeSteps=5;
  const coordinates=Array.from({length:subdivisions+1},(_,index)=>{
    if(index<=edgeSteps)return -half+GLASS_RADIUS*index/edgeSteps;
    if(index>=subdivisions-edgeSteps)return half-GLASS_RADIUS*(subdivisions-index)/edgeSteps;
    return -inner+2*inner*(index-edgeSteps)/(subdivisions-2*edgeSteps);
  });
  const box=new T.BoxGeometry(half*2,half*2,half*2,subdivisions,subdivisions,subdivisions);
  const position=box.attributes.position,normal=box.attributes.normal;
  const coord=value=>coordinates[Math.round((value+half)/(2*half)*subdivisions)];
  const nearest=new T.Vector3(),vertex=new T.Vector3(),outward=new T.Vector3();
  for(let i=0;i<position.count;i++){
    vertex.set(coord(position.getX(i)),coord(position.getY(i)),coord(position.getZ(i)));
    nearest.copy(vertex).clampScalar(-inner,inner);
    outward.subVectors(vertex,nearest).normalize();
    vertex.copy(nearest).addScaledVector(outward,GLASS_RADIUS);
    position.setXYZ(i,...vertex);
    normal.setXYZ(i,...outward);
  }
  return box;
}

export function createGlass(renderer,resolution) {
  const backdrop=new T.WebGLRenderTarget(1,1,{depthBuffer:true});
  backdrop.texture.generateMipmaps=false;
  const material=new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,
    uniforms:{
      resolution:{value:resolution},backdrop:{value:backdrop.texture},
      outerHalf:{value:CUBE_HALF},radius:{value:GLASS_RADIUS},
    },
    vertexShader:`
      varying vec3 viewNormal;
      varying vec3 localPoint;
      void main(){
        viewNormal=normalMatrix*normal;
        localPoint=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader:`
      uniform vec2 resolution;
      uniform sampler2D backdrop;
      uniform float radius;
      uniform float outerHalf;
      varying vec3 viewNormal;
      varying vec3 localPoint;

      float highlight(float value){return exp(-value*value);}

      void main(){
        vec3 pos=abs(localPoint);
        float secondAxis=max(min(pos.x,pos.y),max(min(pos.x,pos.z),min(pos.y,pos.z)));
        float edgeDistance=outerHalf-secondAxis;
        float bevel=1.-smoothstep(.043,radius+.095,edgeDistance);
        vec3 normal=normalize(viewNormal);
        float facing=clamp(abs(normal.z),0.,1.);
        float grazing=pow(1.-facing,3.);
        if(!gl_FrontFacing){
          float backRim=bevel*(.040+.085*grazing);
          gl_FragColor=vec4(.43,.64,.78,backRim);
          return;
        }

        vec3 reflection=reflect(vec3(0.,0.,-1.),normal);
        float strip=highlight((reflection.y-.37)/.19)*smoothstep(-.75,.4,reflection.x);
        float softbox=highlight((reflection.x+.54)/.34)*highlight((reflection.y-.45)/.33);
        float coolEdge=bevel*(.14+.29*grazing+.29*strip+.23*softbox);
        float innerBand=.078*highlight((edgeDistance-radius*.79)/.028)*(.36+.64*facing);
        float reflectivity=clamp(.005+coolEdge+innerBand,.005,.62);
        vec3 bright=mix(vec3(.22,.45,.61),vec3(.82,.93,1.),clamp(.72*grazing+strip+.68*softbox,0.,1.));
        bright=mix(bright,vec3(.60,.66,.90),bevel*.13*smoothstep(.04,.82,-reflection.x));

        float transmission=bevel*(.18+.46*facing);
        vec3 refracted=vec3(0.);
        if(transmission>.035){
          vec2 uv=gl_FragCoord.xy/resolution;
          vec2 screenSpace=vec2(resolution.y/resolution.x,1.);
          vec2 bend=normal.xy*screenSpace*(.028*bevel);
          vec2 rest=clamp(uv-bend,vec2(.001),vec2(.999));
          vec3 green=texture2D(backdrop,rest).rgb;
          float red=texture2D(backdrop,clamp(rest+bend*.10,vec2(.001),vec2(.999))).r;
          float blue=texture2D(backdrop,clamp(rest-bend*.12,vec2(.001),vec2(.999))).b;
          refracted=vec3(red,green.g,blue)*vec3(.91,.99,1.03);
        }else{
          transmission=0.;
        }
        float alpha=transmission+reflectivity*(1.-transmission);
        vec3 color=(refracted*transmission*(1.-reflectivity)+bright*reflectivity)/alpha;
        gl_FragColor=vec4(color,alpha);
      }
    `,
  });
  const mesh=new T.Mesh(roundedGlassGeometry(),material);
  mesh.renderOrder=3;

  function resize() {
    const scale=Math.min(.72,960/Math.max(resolution.x,resolution.y));
    backdrop.setSize(Math.max(1,Math.round(resolution.x*scale)),Math.max(1,Math.round(resolution.y*scale)));
  }

  function draw(world,camera){
    mesh.visible=false;
    renderer.setRenderTarget(backdrop);
    renderer.render(world,camera);
    renderer.setRenderTarget(null);
    mesh.visible=true;
    renderer.render(world,camera);
  }

  return {mesh,resize,draw,dispose:()=>backdrop.dispose()};
}
