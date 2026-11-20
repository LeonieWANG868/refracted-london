import * as T from '../vendor/three.module.js';

export function createPointCloud(positions, appearance, facing, pixelRatio, palette) {
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('appearance',new T.Float32BufferAttribute(appearance,3));
  geometry.setAttribute('facade',new T.Float32BufferAttribute(facing,2));
  const scan={value:-5};
  const material=new T.ShaderMaterial({
    uniforms:{
      scan, pixelRatio:{value:pixelRatio}, opacity:{value:1},
      cityWindow:{value:new T.Vector4(1,0,0,0)},
      cyan:{value:new T.Vector3(...palette[0])},
      violet:{value:new T.Vector3(...palette[1])},
    },
    transparent:true,
    depthWrite:false,
    vertexShader:`
      attribute vec3 appearance;
      attribute vec2 facade;
      uniform float pixelRatio;
      uniform float scan;
      uniform vec4 cityWindow;
      varying vec2 intensityAndTint;

      void main() {
        float edgeFade=1.0;
        if(cityWindow.w>0.0){
          vec2 inside=abs(position.xz*cityWindow.x+cityWindow.yz);
          float room=cityWindow.w-max(inside.x,inside.y);
          if(room<=.02) {
            intensityAndTint=vec2(0.0);
            gl_PointSize=1.0;
            gl_Position=vec4(2.0,2.0,2.0,1.0);
            return;
          }
          edgeFade=smoothstep(.02,.19,room);
        }
        vec4 viewPoint=modelViewMatrix*vec4(position,1.0);
        vec3 normal=normalize(normalMatrix*vec3(facade.x,1.0-dot(facade,facade),facade.y));
        float facingCamera=clamp(.58+.82*normal.z,.15,1.0);
        float depth=clamp(1.66+viewPoint.z*.048,.65,1.0);
        float scanDistance=(position.x-scan)/.095;
        float sweep=exp(-scanDistance*scanDistance);
        float cityLight=cityWindow.w>0.0?1.29:1.0;
        float light=min(.96,(appearance.x+.22*sweep)*facingCamera*depth*cityLight);
        intensityAndTint=vec2(light*edgeFade,appearance.y);
        float particleScale=cityWindow.w>0.0?1.12:1.0;
        gl_PointSize=pixelRatio*particleScale*(appearance.z+.17*sweep);
        gl_Position=projectionMatrix*viewPoint;
      }
    `,
    fragmentShader:`
      uniform vec3 cyan;
      uniform vec3 violet;
      uniform float opacity;
      varying vec2 intensityAndTint;

      void main() {
        float radius=length(gl_PointCoord-.5);
        float disc=1.0-smoothstep(.22,.59,radius);
        if(disc<.03) discard;
        gl_FragColor=vec4(mix(cyan,violet,intensityAndTint.y),disc*intensityAndTint.x*opacity);
      }
    `,
  });
  return {mesh:new T.Points(geometry,material),scan};
}

export function sampleSegment(a,b,spacing,visit) {
  const count=Math.max(1,Math.round(Math.hypot(...b.map((value,index)=>value-a[index]))/spacing));
  for(let step=0;step<count;step++){
    const t=(step+.3)/count;
    visit(a.map((value,index)=>value+(b[index]-value)*t));
  }
}
