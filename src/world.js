import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original, deterministic coastal world. All geometry and textures are generated locally.
const SEA_Y = -12;
const BRIDGE_START = 0.78;
const BRIDGE_END = 0.90;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (a, b, v) => { const t = clamp((v-a)/(b-a),0,1); return t*t*(3-2*t); };

function seeded(seed=7331) {
  return () => { seed=(Math.imul(1664525,seed)+1013904223)>>>0; return seed/4294967296; };
}

function canvasTexture(w, h, paint) {
  const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
  paint(canvas.getContext('2d'),w,h);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

function grainTexture(seed, base, scatter=28) {
  const rng=seeded(seed);
  const texture=canvasTexture(512,512,(ctx,w,h)=>{
    ctx.fillStyle=base; ctx.fillRect(0,0,w,h);
    for(let i=0;i<65000;i++){
      const c=Math.floor(80+rng()*scatter);
      ctx.fillStyle=`rgba(${c},${c},${c},${0.05+rng()*.28})`;
      ctx.fillRect(rng()*w,rng()*h,.3+rng()*1.6,.3+rng()*1.6);
    }
  });
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=8;
  return texture;
}

// A tile covers a few metres of road. Broad tonal patches break up the flat
// asphalt, while fine aggregate and longitudinal wear remain visible up close.
function asphaltTexture(){
  const rng=seeded(20260928);
  const texture=canvasTexture(1024,1024,(ctx,w,h)=>{
    ctx.fillStyle='#5b5e5d';ctx.fillRect(0,0,w,h);
    for(let i=0;i<110;i++){
      const x=rng()*w,y=rng()*h,r=45+rng()*145;
      const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
      const light=rng()>.52;
      gradient.addColorStop(0,light?'rgba(196,189,170,.052)':'rgba(12,20,23,.075)');
      gradient.addColorStop(1,'rgba(80,82,79,0)');
      ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    for(let i=0;i<90000;i++){
      const shade=Math.floor(55+rng()*125);
      ctx.fillStyle=`rgba(${shade},${shade},${shade},${.045+rng()*.11})`;
      ctx.fillRect(rng()*w,rng()*h,.6+rng()*1.8,.6+rng()*2.5);
    }
    for(let i=0;i<165;i++){
      const x=rng()*w,y=rng()*h;
      ctx.strokeStyle=rng()>.5?'rgba(190,187,174,.025)':'rgba(25,30,31,.035)';
      ctx.lineWidth=.6+rng()*2.2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rng()-.5)*5,y+20+rng()*95);ctx.stroke();
    }
  });
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=8;
  return texture;
}

function makeRibbon(track, offset, width, height=0, from=0, to=1, step=3) {
  const n=Math.max(2,Math.ceil((to-from)*track.length/step));
  const p=[],uv=[],indices=[];
  for(let i=0;i<=n;i++){
    const t=mix(from,to,i/n),s=track.sample(t);
    for(const side of [-1,1]){
      const v=s.position.clone().addScaledVector(s.right,offset+side*width/2).addScaledVector(s.up,height);
      p.push(v.x,v.y,v.z); uv.push((side+1)*width/4,t*track.length*.15);
    }
    if(i<n){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function railRibbon(track, offset, from=0, to=1, height=0) {
  const profile=[[-.02,.35],[.035,.44],[-.065,.58],[.035,.71],[-.065,.84],[.035,.97],[-.02,1.05]];
  const n=Math.ceil((to-from)*track.length/4),pos=[],uv=[],idx=[];
  for(let i=0;i<=n;i++){
    const s=track.sample(mix(from,to,i/n));
    for(const [dx,y] of profile){
      const v=s.position.clone().addScaledVector(s.right,offset+dx).addScaledVector(s.up,y+height);
      pos.push(v.x,v.y,v.z); uv.push(i/n*track.length*.03,y);
    }
    if(i<n)for(let k=0;k<profile.length-1;k++){
      const a=i*profile.length+k,b=a+profile.length;
      idx.push(a,a+1,b,a+1,b+1,b);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

function instance(scene, geo, mat, transforms, shadows=false) {
  if(!transforms.length)return null;
  const mesh=new THREE.InstancedMesh(geo,mat,transforms.length),dummy=new THREE.Object3D();
  transforms.forEach((o,i)=>{
    dummy.position.copy(o.p); dummy.rotation.set(0,o.r||0,0);
    if(o.q)dummy.quaternion.copy(o.q);
    if(typeof o.s==='number')dummy.scale.setScalar(o.s); else dummy.scale.copy(o.s||new THREE.Vector3(1,1,1));
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    if(o.color)mesh.setColorAt(i,new THREE.Color(o.color));
  });
  mesh.castShadow=shadows;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);return mesh;
}

function addBox(group, material, position, scale, rotation=0, shadow=true) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...scale),material);
  mesh.position.set(...position); mesh.rotation.y=rotation;
  mesh.castShadow=shadow;mesh.receiveShadow=true;group.add(mesh);return mesh;
}

function addCylinderBetween(group, a, b, radius, material, radial=8) {
  const d=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,d.length(),radial),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(UP,d.normalize());
  mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);return mesh;
}

function localFrame(sample) {
  const g=new THREE.Group();g.position.copy(sample.position);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sample.right,sample.up,sample.tangent));return g;
}

function addTextPanel(group,text,width,height,position,options={}) {
  const texture=canvasTexture(1024,256,(ctx,w,h)=>{
    ctx.fillStyle=options.background||'#122f35';ctx.fillRect(0,0,w,h);
    ctx.fillStyle=options.accent||'#efaa65';ctx.fillRect(0,0,12,h);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=options.color||'#fff7e7';
    ctx.font=`${options.weight||600} ${options.fontSize||92}px Arial,sans-serif`;
    ctx.fillText(text,w/2,h*.5,w*.92);
  });
  const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.6,metalness:.15,side:THREE.DoubleSide});
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);panel.position.set(...position);
  group.add(panel);return panel;
}

function buildSky(scene,renderer) {
  const sunDirection=new THREE.Vector3(-.82,.32,-.46).normalize();
  const uniforms={sunDirection:{value:sunDirection},time:{value:0}};
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms,
    vertexShader:`varying vec3 vDirection;void main(){vDirection=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader:`
      varying vec3 vDirection;uniform vec3 sunDirection;uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float f=0.,a=.55;for(int i=0;i<5;i++){f+=a*noise(p);p=mat2(1.72,1.12,-1.12,1.72)*p;a*=.47;}return f;}
      void main(){
        vec3 d=normalize(vDirection);float h=max(d.y,0.);float sun=max(dot(d,sunDirection),0.);
        vec3 zenith=vec3(.18,.39,.57),horizon=vec3(.75,.74,.64),warm=vec3(1.0,.63,.36);
        vec3 c=mix(horizon,zenith,pow(h,.43));
        c+=warm*pow(sun,10.)*.31*(1.-h);
        c+=vec3(1.,.76,.41)*pow(sun,450.)*.55;
        c+=vec3(1.,.87,.6)*smoothstep(.99965,.9999,sun)*8.;
        if(d.y>.012){
          vec2 p=d.xz/(d.y+.15)*1.8+vec2(time*.0007,0.);
          float n=fbm(p*1.65+fbm(p*.8));
          float cloud=smoothstep(.47,.74,n)*smoothstep(.015,.12,d.y);
          float wisps=smoothstep(.51,.70,fbm(p*vec2(.4,4.)+9.))*smoothstep(.15,.6,d.y)*.25;
          vec3 shadow=vec3(.56,.63,.66),light=vec3(1.05,.95,.79);
          vec3 cloudCol=mix(shadow,light,smoothstep(.44,.66,n)+pow(sun,4.)*.18);
          c=mix(c,cloudCol,clamp(cloud*.85+wisps,0.,.9));
        }
        c=mix(c,vec3(.59,.66,.67),1.-smoothstep(-.10,.02,d.y));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(9000,32,20),material);sky.frustumCulled=false;
  sky.renderOrder=-100;scene.add(sky);
  const envScene=new THREE.Scene(),envSky=new THREE.Mesh(new THREE.SphereGeometry(50,32,16),material);
  envScene.add(envSky);
  const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileCubemapShader();
  const environment=pmrem.fromScene(envScene,.06,.1,200);scene.environment=environment.texture;
  pmrem.dispose();envSky.geometry.dispose();
  scene.fog=new THREE.FogExp2('#bdc6c3',.00031);
  const hemi=new THREE.HemisphereLight('#a8c5e1','#4e4939',.55);scene.add(hemi);
  const sunLight=new THREE.DirectionalLight('#ffd6a0',3.2);
  sunLight.position.copy(sunDirection).multiplyScalar(280);
  sunLight.castShadow=true;sunLight.shadow.mapSize.set(2048,2048);
  Object.assign(sunLight.shadow.camera,{left:-90,right:90,top:85,bottom:-85,near:1,far:650});
  sunLight.shadow.bias=-.00022;sunLight.shadow.normalBias=.045;sunLight.shadow.radius=2;
  scene.add(sunLight,sunLight.target);
  return {sunDirection,sunLight,hemi,sky,environment,update:t=>uniforms.time.value=t};
}

function buildNightDetails(scene, track) {
  const group = new THREE.Group();
  group.name = 'afterlight-night-details';
  const fixtureMat = new THREE.MeshStandardMaterial({ color: '#172b45', metalness: .78, roughness: .28 });
  const amber = new THREE.MeshStandardMaterial({ color: '#ffb86b', emissive: '#ff7b28', emissiveIntensity: 11.0, toneMapped: false });
  const cyan = new THREE.MeshStandardMaterial({ color: '#8df7ff', emissive: '#1be7ff', emissiveIntensity: 8.4, toneMapped: false });
  const magenta = new THREE.MeshStandardMaterial({ color: '#ff9ce8', emissive: '#ff27b8', emissiveIntensity: 7.2, toneMapped: false });
  const poleGeo = new THREE.CylinderGeometry(.055, .095, 5.9, 8);
  const armGeo = new THREE.CylinderGeometry(.045, .045, 1.6, 8);
  const lampGeo = new THREE.SphereGeometry(.13, 10, 8);
  const markerGeo = new THREE.BoxGeometry(.12, .025, .82);
  const glowGeo = new THREE.CircleGeometry(3.8, 32);
  const lights = [];
  const addLamp = (t, side, index) => {
    const s = track.sample(t), p = s.position.clone().addScaledVector(s.right, side * (track.width * .5 + 4.0));
    const litSegment = true;
    const g = new THREE.Group(); g.position.copy(p); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent));
    const pole = new THREE.Mesh(poleGeo, fixtureMat); pole.position.y = 2.95; pole.castShadow = false; g.add(pole);
    const arm = new THREE.Mesh(armGeo, fixtureMat); arm.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2; arm.position.set(side * .68, 5.72, 0); g.add(arm);
    const lampMaterial = (index % 3 === 0 ? amber : cyan).clone(); lampMaterial.emissiveIntensity = litSegment ? lampMaterial.emissiveIntensity : .06;
    const lamp = new THREE.Mesh(lampGeo, lampMaterial); lamp.position.set(side * 1.34, 5.72, 0); g.add(lamp);
    if (litSegment && index % 5 === 0) {
      const lightColor = index % 3 === 0 ? '#ff9b4a' : '#46eaff';
      // A downward cone creates the real pool of light on the road surface.
      const target = new THREE.Object3D(); target.position.set(-side * 4.8, .04, 0); g.add(target);
      const spot = new THREE.SpotLight(lightColor, 330, 52, .68, .78, 1.55);
      spot.position.set(side * 1.34, 5.7, 0); spot.target = target; spot.castShadow = false; g.add(spot); lights.push(spot);
      if (index % 2 === 0) {
        const point = new THREE.PointLight(lightColor, 240, 24, 1.8);
        point.position.set(side * 1.34, 5.7, 0); point.castShadow = false; g.add(point); lights.push(point);
      }
      const poolMat = new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: .70, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const pool = new THREE.Mesh(glowGeo, poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(-side * 4.8, .12, 0); g.add(pool);
    }
    group.add(g);
  };
  const count = Math.max(24, Math.min(60,Math.floor(track.length / 42)));
  for (let i = 0; i < count; i++) { const t = i / count; addLamp(t, i % 2 ? 1 : -1, i); }
  for (let i = 0; i < count * 2; i++) {
    const t = i / (count * 2), s = track.sample(t);
    const side = i % 2 ? 1 : -1;
    const litSegment = true;
    const p = s.position.clone().addScaledVector(s.right, side * (track.width * .5 + 1.7));
    const markerMaterial = (i % 5 === 0 ? magenta : cyan).clone(); markerMaterial.emissiveIntensity = litSegment ? markerMaterial.emissiveIntensity : .035;
    const marker = new THREE.Mesh(markerGeo, markerMaterial);
    marker.position.copy(p).addScaledVector(s.up, .055); marker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent));
    marker.rotation.x = Math.PI / 2; group.add(marker);
  }
  const starsGeo = new THREE.BufferGeometry(), stars = [];
  const rng = seeded(9041);
  for (let i = 0; i < 850; i++) {
    const a = rng() * Math.PI * 2, y = .12 + rng() * .82, r = 2500 + rng() * 4500;
    const rr = Math.sqrt(1 - y * y); stars.push(Math.cos(a) * rr * r, y * r, Math.sin(a) * rr * r);
  }
  starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  const starField = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: '#d9efff', size: 7, sizeAttenuation: true, transparent: true, opacity: .92, depthWrite: false }));
  starField.frustumCulled = false; group.add(starField);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 20), new THREE.MeshBasicMaterial({ color: '#b9ddff', transparent: true, opacity: .92 }));
  moon.position.set(-1600, 1350, -3000); group.add(moon);
  const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 20), new THREE.MeshBasicMaterial({ color: '#5cb7ff', transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false }));
  moonGlow.position.copy(moon.position); group.add(moonGlow);
  scene.add(group); group.visible = false;
  return { group, lights, nightSky: group, moon };
}

function buildOcean(scene,sunDirection) {
  const uniforms={time:{value:0},sunDirection:{value:sunDirection}};
  const mat=new THREE.ShaderMaterial({
    uniforms,side:THREE.FrontSide,
    vertexShader:`uniform float time;varying vec3 vWorld;void main(){vec3 p=position;vec4 world=modelMatrix*vec4(p,1.);world.y+=sin(world.x*.042+time*.72)*.19+sin(world.z*.058+time*.85)*.16+sin((world.x+world.z)*.025+time*.63)*.23;vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform float time;uniform vec3 sunDirection;varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz;float t=time;
        float nx=cos(p.x*.042+t*.72)*.07+cos((p.x+p.y)*.025+t*.63)*.08+sin(p.x*.24+p.y*.17-t*1.4)*.032;
        float nz=cos(p.y*.058+t*.85)*.07+cos((p.x+p.y)*.025+t*.63)*.08+cos(p.x*.19-p.y*.28+t*1.1)*.027;
        vec3 n=normalize(vec3(-nx,1.,-nz));vec3 view=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.-max(dot(n,view),0.),4.);
        vec3 deep=vec3(.028,.19,.23),reflected=vec3(.49,.66,.68);
        float bands=sin(p.x*.006+p.y*.003)*.5+.5;
        vec3 c=mix(deep,vec3(.045,.29,.30),bands*.36);
        c=mix(c,reflected,fresnel*.85);
        vec3 h=normalize(view+sunDirection);float spec=pow(max(dot(n,h),0.),240.);
        c+=vec3(1.,.78,.48)*spec*2.6;
        float sparkle=pow(max(dot(n,h),0.),1500.);c+=vec3(1.,.94,.77)*sparkle*.5;
        float haze=1.-exp(-length(cameraPosition-vWorld)*.00031);c=mix(c,vec3(.59,.66,.65),haze);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo=new THREE.PlaneGeometry(16000,16000,180,180);geo.rotateX(-Math.PI/2);
  const ocean=new THREE.Mesh(geo,mat);ocean.position.y=SEA_Y;scene.add(ocean);
  return {mesh:ocean,update:t=>uniforms.time.value=t};
}

function buildTerrain(scene,track) {
  const samples=Array.from({length:640},(_,i)=>({...track.sample(i/640),t:i/640}));
  function nearest(x,z){
    let best=Infinity,index=0;
    for(let i=0;i<samples.length;i++){
      const p=samples[i].position,d=(p.x-x)**2+(p.z-z)**2;
      if(d<best){best=d;index=i;}
    }
    const a=samples[index],b=samples[(index+1)%samples.length];
    const dx=b.position.x-a.position.x,dz=b.position.z-a.position.z;
    const alpha=clamp(((x-a.position.x)*dx+(z-a.position.z)*dz)/(dx*dx+dz*dz),0,1);
    const px=mix(a.position.x,b.position.x,alpha),pz=mix(a.position.z,b.position.z,alpha);
    return {distance:Math.hypot(px-x,pz-z),height:mix(a.position.y,b.position.y,alpha),t:(index+alpha)/samples.length};
  }
  function baseHeight(x,z){
    const coast=-440+Math.sin(z*.009)*56+Math.cos(z*.003)*42;
    const inland=smooth(coast-75,coast+125,x);
    const hill=130*Math.exp(-((x-70)**2/155000+(z-15)**2/190000));
    const ridge=165*Math.exp(-((x-730)**2/230000+(z+50)**2/1400000));
    const undulation=Math.sin(x*.018+Math.cos(z*.007))*5+Math.sin(z*.024+x*.01)*3;
    return mix(-20,14+hill+ridge+undulation,inland);
  }
  function height(x,z,near=null){
    near=near||nearest(x,z);let h=baseHeight(x,z);
    if(near.distance<110){
      const bridge=smooth(BRIDGE_START-.012,BRIDGE_START+.006,near.t)*(1-smooth(BRIDGE_END-.006,BRIDGE_END+.012,near.t));
      const roadGround=mix(near.height-.9,-17,bridge);
      h=mix(roadGround,h,smooth(18,110,near.distance));
    }
    // The western bridge crosses a real inlet; the water remains visible below its deck.
    if(x< -350 && z> -80 && z<245){
      const inlet=smooth(-320,-445,x)*smooth(-110,-45,z)*(1-smooth(190,265,z));
      h=mix(h,-18,inlet*.99);
    }
    return h;
  }
  const geo=new THREE.PlaneGeometry(4200,4400,220,230);geo.rotateX(-Math.PI/2);geo.translate(350,0,0);
  const pos=geo.attributes.position,col=[],uv=geo.attributes.uv;
  const grass=new THREE.Color('#77845b'),dry=new THREE.Color('#b4a578'),rock=new THREE.Color('#9d927f'),sand=new THREE.Color('#c7b89b');
  const color=new THREE.Color();
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i),near=nearest(x,z),y=height(x,z,near);pos.setY(i,y);
    const variation=(Math.sin(x*.063+Math.sin(z*.021))*Math.cos(z*.043)+1)*.5;
    color.copy(grass).lerp(dry,variation*.52);
    if(y<11)color.lerp(sand,1-smooth(-3,18,y));
    const slope=Math.abs(baseHeight(x+8,z)-baseHeight(x-8,z))+Math.abs(baseHeight(x,z+8)-baseHeight(x,z-8));
    color.lerp(rock,smooth(10,31,slope)*.75);
    if(near.distance<35)color.lerp(dry,.5);
    col.push(color.r,color.g,color.b);uv.setXY(i,x/35,z/35);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.computeVertexNormals();
  const texture=grainTexture(13,'#cecbb8',90);
  const mat=new THREE.MeshStandardMaterial({map:texture,vertexColors:true,roughness:1,metalness:0});
  const land=new THREE.Mesh(geo,mat);land.receiveShadow=true;scene.add(land);

  // Narrow, high resolution shoulders avoid coarse terrain poking through the road.
  const shoulderMat=new THREE.MeshStandardMaterial({color:'#aaa083',roughness:1,map:texture});
  for(const side of [-1,1]){
    const g=makeRibbon(track,side*(track.width/2+1.35),2.7,-.09);
    const m=new THREE.Mesh(g,shoulderMat);m.receiveShadow=true;scene.add(m);
  }
  // Distant mountain silhouettes use smooth, irregular ridgelines and aerial perspective.
  const mountainMaterials=['#81938e','#93a19b','#a5b0a8'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:1}));
  for(let layer=0;layer<3;layer++){
    const g=new THREE.PlaneGeometry(8500,1350,160,24);g.rotateX(-Math.PI/2);
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),across=(z+675)/1350;
      const ridge=Math.pow(Math.max(0,Math.sin(across*Math.PI)),1.35);
      const crest=250+180*Math.sin(x*.0015+layer*3)**2+100*Math.sin(x*.0043+layer)**2;
      p.setXYZ(i,1350+layer*450+z,crest*ridge*(1+layer*.22)-18,x-1500);
    }
    g.computeVertexNormals();const m=new THREE.Mesh(g,mountainMaterials[layer]);scene.add(m);
  }
  return {height,nearest,land};
}

function buildRoad(scene,track) {
  const asphalt=asphaltTexture();
  const roadMat=new THREE.MeshStandardMaterial({map:asphalt,bumpMap:asphalt,bumpScale:.023,color:'#a3aaa9',roughness:.94,metalness:.025});
  const roadMesh=new THREE.Mesh(makeRibbon(track,0,track.width,.02),roadMat);roadMesh.receiveShadow=true;scene.add(roadMesh);
  const edgeMat=new THREE.MeshStandardMaterial({color:'#e6e3d0',roughness:.92});
  for(const side of [-1,1]){
    const line=new THREE.Mesh(makeRibbon(track,side*(track.width/2-.5),.14,.036),edgeMat);line.receiveShadow=true;scene.add(line);
  }
  const dashes=[];
  for(let meter=1;meter<track.length;meter+=11)dashes.push(makeRibbon(track,0,.14,.044,meter/track.length,Math.min(meter+4.8,track.length)/track.length,2.4));
  const dashGeo=mergeGeometries(dashes);dashes.forEach(g=>g.dispose());
  const dash=new THREE.Mesh(dashGeo,edgeMat);dash.receiveShadow=true;scene.add(dash);

  const redMat=new THREE.MeshStandardMaterial({color:'#bb6550',roughness:.92}),whiteMat=new THREE.MeshStandardMaterial({color:'#ddd4bf',roughness:.92});
  const curbRed=[],curbWhite=[],posts=[],reflectors=[],lamps=[];
  for(let meter=0;meter<track.length;meter+=4){
    const t=meter/track.length,s=track.sample(t);
    if(Math.abs(s.curvature)>.0030 && (t<BRIDGE_START||t>BRIDGE_END)){
      for(const side of [-1,1]){
        const p=s.position.clone().addScaledVector(s.right,side*(track.width/2+.36));p.y+=.07;
        const o={p,r:s.heading,s:new THREE.Vector3(.67,.16,3.85)};
        (Math.floor(meter/4)%2?curbRed:curbWhite).push(o);
      }
    }
    if(Math.round(meter)%12===0)for(const side of [-1,1]){
      const p=s.position.clone().addScaledVector(s.right,side*(track.width/2+1.8));p.y+=.5;
      posts.push({p,r:s.heading,s:new THREE.Vector3(.115,1.12,.12)});
      if(Math.round(meter)%36===0)reflectors.push({p:p.clone().addScaledVector(s.right,-side*.072).add(new THREE.Vector3(0,.33,0)),r:s.heading,s:new THREE.Vector3(.025,.08,.19)});
    }
  }
  instance(scene,new THREE.BoxGeometry(1,1,1),redMat,curbRed);instance(scene,new THREE.BoxGeometry(1,1,1),whiteMat,curbWhite);
  const steel=new THREE.MeshStandardMaterial({color:'#a9b4b0',roughness:.47,metalness:.72,side:THREE.DoubleSide});
  instance(scene,new THREE.BoxGeometry(1,1,1),steel,posts);
  instance(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#fff2cc',emissive:'#d6a55f',emissiveIntensity:.3,roughness:.35}),reflectors);
  for(const side of [-1,1]){
    const rail=new THREE.Mesh(railRibbon(track,side*(track.width/2+1.8)),steel);rail.receiveShadow=true;scene.add(rail);
  }
  // Finish line consists of individual enamel squares with a slightly worn off-white tone.
  const checkerA=[],checkerB=[];
  for(let row=0;row<2;row++)for(let col=0;col<20;col++){
    const s=track.sample((row*.68)/track.length);
    const p=s.position.clone().addScaledVector(s.right,(col-9.5)*.68).addScaledVector(s.up,.057);
    ((row+col)%2?checkerA:checkerB).push({p,r:s.heading,s:new THREE.Vector3(.68,.009,.68)});
  }
  instance(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#e5e2d7',roughness:.8}),checkerA);
  instance(scene,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#242d31',roughness:.85}),checkerB);
  return roadMesh;
}

function buildBridge(scene,track) {
  const concrete=new THREE.MeshStandardMaterial({color:'#c8c2b1',roughness:.85});
  const ivory=new THREE.MeshStandardMaterial({color:'#e4dcc5',roughness:.52,metalness:.15});
  const coral=new THREE.MeshStandardMaterial({color:'#c4785e',roughness:.57,metalness:.38});
  const cables=new THREE.MeshStandardMaterial({color:'#d4d4c8',roughness:.43,metalness:.67});
  const group=new THREE.Group();group.name='Aster cable-stayed coastal bridge';scene.add(group);
  const bottom=new THREE.Mesh(makeRibbon(track,0,18,-1.0,BRIDGE_START,BRIDGE_END),concrete);bottom.receiveShadow=true;group.add(bottom);
  for(const side of [-1,1]){
    const fasciaGeo=railRibbon(track,side*9.0,BRIDGE_START,BRIDGE_END,-1.45);
    const fascia=new THREE.Mesh(fasciaGeo,ivory);group.add(fascia);
  }
  for(const t of [.815,.869]){
    const s=track.sample(t),tower=localFrame(s);group.add(tower);
    for(const side of [-1,1]){
      addCylinderBetween(tower,new THREE.Vector3(side*10,-s.position.y+SEA_Y-3,0),new THREE.Vector3(side*10,-.6,0),1.35,concrete,12);
      addCylinderBetween(tower,new THREE.Vector3(side*10,0,0),new THREE.Vector3(side*5.7,39,0),.95,ivory,10);
      addBox(tower,coral,[side*5.75,38,0],[1.92,2.8,1.92]);
    }
    addBox(tower,ivory,[0,29.5,0],[13.6,1.45,1.55]);
    addBox(tower,ivory,[0,-1.1,0],[22,1.9,3]);
    for(let k=1;k<=6;k++)for(const direction of [-1,1])for(const side of [-1,1]){
      const anchorT=t+direction*k*9.5/track.length;
      if(anchorT<BRIDGE_START||anchorT>BRIDGE_END)continue;
      const target=track.sample(anchorT);
      const a=s.position.clone().addScaledVector(s.right,side*(5.75+k*.018)).addScaledVector(s.up,38-k*.65);
      const b=target.position.clone().addScaledVector(target.right,side*8.45).addScaledVector(target.up,.6);
      addCylinderBetween(group,a,b,.046,cables,5);
    }
  }
  // Deck cross-beams and piers retain a believable structural silhouette from the coast.
  for(let t=BRIDGE_START+.004;t<BRIDGE_END;t+=.014){
    const s=track.sample(t),frame=localFrame(s);group.add(frame);
    addBox(frame,concrete,[0,-1.38,0],[18,1.0,1.15]);
  }
  return group;
}

function buildVegetation(scene,terrain,track) {
  const rng=seeded(1977),trees=[],trunks=[],bushes=[],rocks=[],grass=[];
  // Broad Mediterranean pine crowns, several overlapping irregular boughs per tree.
  const crowns=[];
  const crownParts=[[0,8.2,0,3.7,1.7,3.3],[-2.5,7.1,.7,2.8,1.3,2.5],[2.1,7.7,-1.3,2.7,1.4,2.6],[.4,9.15,-.5,2.9,1.5,2.8],[-.5,7,2.5,2.5,1.2,2.2]];
  for(const [x,y,z,sx,sy,sz] of crownParts){
    const g=new THREE.IcosahedronGeometry(1,2),p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const vx=p.getX(i),vy=p.getY(i),vz=p.getZ(i),n=1+Math.sin(vx*18+vy*11+vz*15)*.105;
      p.setXYZ(i,vx*sx*n+x,vy*sy*n+y,vz*sz*n+z);
    }g.computeVertexNormals();crowns.push(g);
  }
  // Alpha-tested pine needle sprays give each crown a fine, irregular silhouette.
  // Shared cluster geometry and a local painted atlas keep all trees in one draw call.
  crowns.forEach(g=>g.dispose());
  const foliage=canvasTexture(256,256,(ctx,w,h)=>{
    const random=seeded(931);ctx.clearRect(0,0,w,h);
    for(let i=0;i<2300;i++){
      const a=random()*Math.PI*2,r=Math.sqrt(random());
      const x=128+Math.cos(a)*r*111,y=128+Math.sin(a)*r*104;
      const light=Math.round(97+random()*100);
      ctx.strokeStyle=`rgba(${light},${Math.min(235,light+20)},${Math.max(70,light-18)},${.72+random()*.28})`;
      ctx.lineWidth=.7+random()*1.3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a+.8)*8,y+Math.sin(a+.8)*8);ctx.stroke();
    }
  });
  const sprays=[];
  for(const [x,y,z,sx,sy,sz] of crownParts)for(let n=0;n<7;n++){
    const g=new THREE.PlaneGeometry(sx*1.65,sy*1.5,2,1);
    g.rotateY(n*Math.PI/3.5);g.rotateX((n%3-1)*.38);
    g.translate(x+Math.sin(n*2.4)*sx*.28,y+Math.cos(n*1.9)*sy*.34,z+Math.cos(n*2.4)*sz*.3);sprays.push(g);
  }
  const crownGeo=mergeGeometries(sprays);sprays.forEach(g=>g.dispose());
  const trunkPath=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.2,3,0),new THREE.Vector3(-.3,5.4,.25),new THREE.Vector3(.2,8.1,0)]);
  const trunkGeo=new THREE.TubeGeometry(trunkPath,9,.22,7,false);
  const rockGeo=new THREE.IcosahedronGeometry(1,2),rp=rockGeo.attributes.position;
  for(let i=0;i<rp.count;i++){
    const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),k=1+.18*Math.sin(x*8+y*7+z*11)+.09*Math.sin(z*21);
    rp.setXYZ(i,x*k,y*k*.78,z*k);
  }rockGeo.computeVertexNormals();
  for(let i=0;i<3300;i++){
    const x=-610+rng()*1690,z=-1050+rng()*2090,near=terrain.nearest(x,z),y=terrain.height(x,z,near);
    if(y<8||near.distance<19||y>165)continue;
    const p=new THREE.Vector3(x,y-.35,z),r=rng()*Math.PI*2;
    if(i<780 && near.distance>25 && x>-430){
      const scale=.72+rng()*.8;
      trees.push({p,r,s:new THREE.Vector3(scale*(.84+rng()*.25),scale,scale),color:new THREE.Color().setHSL(.23+rng()*.035,.18+rng()*.1,.22+rng()*.075)});
      trunks.push({p,r,s:trees[trees.length-1].s});
    }else if(i<1700){
      bushes.push({p,r,s:new THREE.Vector3(1.2+rng()*2.4,.65+rng()*1.1,1.2+rng()*2),color:new THREE.Color().setHSL(.22+rng()*.055,.20,.28+rng()*.1)});
    }else if(rng()>.28){
      rocks.push({p,r,s:new THREE.Vector3(1.2+rng()*4.2,.8+rng()*3.1,1.0+rng()*3),color:new THREE.Color().setHSL(.1,.13,.42+rng()*.17)});
    }
  }
  // Eroded limestone clusters break up the ocean / terrain seam with a readable cliff face.
  for(let z=-940;z<940;z+=14){
    const x=-488+Math.sin(z*.009)*56+Math.cos(z*.003)*42;
    const near=terrain.nearest(x,z),y=terrain.height(x,z,near);
    if(near.distance<27||(near.t>BRIDGE_START&&near.t<BRIDGE_END)||y>34||y< -18)continue;
    rocks.push({p:new THREE.Vector3(x,y-4,z),r:rng()*6.28,
      s:new THREE.Vector3(10+rng()*9,7+rng()*7,9+rng()*8),
      color:new THREE.Color().setHSL(.095,.16,.5+rng()*.1)});
  }
  // A dense belt of small stones gives the driving corridor material scale.
  for(let meter=0;meter<track.length;meter+=2.7){
    const t=meter/track.length;
    if(t>BRIDGE_START-.02&&t<BRIDGE_END+.02)continue;
    const s=track.sample(t),side=rng()>.5?1:-1,offset=side*(10+rng()*6);
    const p=s.position.clone().addScaledVector(s.right,offset);p.y=terrain.height(p.x,p.z)-.1;
    if(p.y<0)continue;
    rocks.push({p,r:rng()*6.28,s:new THREE.Vector3(.2+rng()*.8,.1+rng()*.35,.2+rng()*.65)});
    for(let j=0;j<4;j++){
      const gp=p.clone().add(new THREE.Vector3((rng()-.5)*5,0,(rng()-.5)*5));
      if(terrain.nearest(gp.x,gp.z).distance<9.5)continue;
      gp.y=terrain.height(gp.x,gp.z);grass.push({p:gp,r:rng()*6.28,s:.7+rng()*.7,color:new THREE.Color().setHSL(.19+rng()*.03,.24,.37+rng()*.12)});
    }
  }
  instance(scene,crownGeo,new THREE.MeshStandardMaterial({map:foliage,alphaTest:.42,color:'#9eae86',roughness:1,side:THREE.DoubleSide}),trees,true);
  instance(scene,trunkGeo,new THREE.MeshStandardMaterial({color:'#655947',roughness:1}),trunks,true);
  instance(scene,new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#bdc39c',roughness:1}),bushes);
  instance(scene,rockGeo,new THREE.MeshStandardMaterial({color:'#b4b0a3',roughness:1}),rocks);
  const grassGeo=new THREE.BufferGeometry(),gp=[];
  for(let i=0;i<5;i++){
    const a=i*2.399,x=Math.cos(a)*.24,z=Math.sin(a)*.24;
    gp.push(x-.06,0,z,x+.06,0,z,x+.12,.4+(i%3)*.13,z+.04);
  }
  grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(gp,3));grassGeo.computeVertexNormals();
  instance(scene,grassGeo,new THREE.MeshStandardMaterial({color:'#d7cda4',roughness:1,side:THREE.DoubleSide}),grass);
}

function buildFestival(scene,track,terrain) {
  const dark=new THREE.MeshStandardMaterial({color:'#183c41',roughness:.58,metalness:.3});
  const cream=new THREE.MeshStandardMaterial({color:'#e5dcc6',roughness:.85});
  const coral=new THREE.MeshStandardMaterial({color:'#d69a66',roughness:.7});
  const silver=new THREE.MeshStandardMaterial({color:'#a9b4b3',roughness:.42,metalness:.72});
  const glass=new THREE.MeshStandardMaterial({color:'#416b72',roughness:.19,metalness:.42});
  const frame=localFrame(track.sample(0));scene.add(frame);frame.name='Afterlight starting pavilion';
  for(const side of [-1,1]){
    addBox(frame,cream,[side*10,3.6,0],[1.25,7.2,1.5]);
    addBox(frame,dark,[side*10,1.9,-.82],[1.33,3.6,.15]);
    addBox(frame,coral,[side*10,5.9,-.86],[1.36,.12,.17]);
    addBox(frame,cream,[side*10,.18,0],[3.4,.36,3.5]);
  }
  addBox(frame,dark,[0,7.0,0],[21.5,1.55,1.1]);
  addBox(frame,coral,[0,7.83,0],[21.7,.11,1.15]);
  addTextPanel(frame,'A F T E R L I G H T',17.8,1.13,[0,7,-.57],{fontSize:86});
  const reverse=addTextPanel(frame,'COASTLINE  /  01',17.8,1.13,[0,7,.57],{fontSize:80});reverse.rotation.y=Math.PI;
  const lightMat=new THREE.MeshStandardMaterial({color:'#f0b568',emissive:'#efac55',emissiveIntensity:.6,roughness:.35});
  for(let i=0;i<5;i++){
    addBox(frame,dark,[(i-2)*.72,5.93,-.28],[.55,.6,.43]);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.03,16),lightMat);mesh.rotation.x=Math.PI/2;
    mesh.position.set((i-2)*.72,5.93,-.52);frame.add(mesh);
  }
  // Race control: a glazed, louvered pavilion beside the starting grid.
  const pavilion=new THREE.Group();pavilion.position.set(-23,-.7,-28);frame.add(pavilion);
  addBox(pavilion,cream,[0,.2,0],[16,.4,29]);
  addBox(pavilion,cream,[0,2.5,0],[13,4.6,22]);
  addBox(pavilion,glass,[6.55,2.7,0],[.09,3.1,20]);
  addBox(pavilion,glass,[0,2.7,-11.055],[11.4,3.1,.08]);
  addBox(pavilion,dark,[0,5.05,0],[17,.46,27]);
  addBox(pavilion,coral,[0,5.35,0],[17.2,.14,27.2]);
  for(let i=-5;i<=5;i++)addBox(pavilion,dark,[i*1.17,2.8,-11.12],[.09,3.4,.14]);
  for(let i=-9;i<=9;i++)addBox(pavilion,dark,[6.64,2.8,i],[.14,3.4,.07]);
  for(let i=0;i<4;i++)addBox(pavilion,cream,[8+i*.43,.15-i*.14,0],[.44,.28,8]);
  const brand=addTextPanel(pavilion,'ASTERA  /  MOTOR CLUB',12,1.1,[0,4.32,-11.21],{fontSize:70,background:'#183c41'});
  // Timber spectator terrace, compact canopies and individually modelled railings.
  const wood=new THREE.MeshStandardMaterial({color:'#9e7d58',roughness:.92});
  for(let tier=0;tier<4;tier++)addBox(frame,wood,[24+tier*1.15,tier*.49,-25],[1.15,.35,27]);
  for(let z=-37;z<=-13;z+=4){
    addBox(frame,silver,[29,2.4,z],[.065,1.4,.065],0,false);
  }
  addBox(frame,silver,[29,3.02,-25],[.065,.065,26],0,false);
  for(const z of [-62,20]){
    for(const side of [-1,1]){
      const tent=new THREE.Group();tent.position.set(side*22,-.5,z);frame.add(tent);
      for(const x of [-3.5,3.5])for(const zz of [-3.5,3.5])addBox(tent,silver,[x,1.65,zz],[.06,3.3,.06]);
      const roof=new THREE.ConeGeometry(5.3,1.6,4);roof.rotateY(Math.PI/4);
      const mesh=new THREE.Mesh(roof,cream);mesh.position.y=4.1;mesh.castShadow=true;tent.add(mesh);
      addBox(tent,dark,[0,3.3,0],[7.5,.45,7.5]);
    }
  }
  // Upright fabric flags: restrained amber, cream and midnight green.
  const flagPoles=[],flagMats=[coral,cream,dark];
  for(let i=0;i<16;i++){
    const side=i%2?1:-1,t=-.013+(i/2)*.004,s=track.sample(t);
    const p=s.position.clone().addScaledVector(s.right,side*12.8);
    const g=localFrame({...s,position:p});scene.add(g);
    addBox(g,silver,[0,3.5,0],[.045,7,.045],0,false);
    const flagGeo=new THREE.PlaneGeometry(1.35,4.6,5,8),fp=flagGeo.attributes.position;
    for(let v=0;v<fp.count;v++)fp.setZ(v,Math.sin(fp.getY(v)*1.8+i)*.09+Math.sin(fp.getX(v)*3)*.08);
    flagGeo.computeVertexNormals();const mat=flagMats[i%3].clone();mat.side=THREE.DoubleSide;
    const flag=new THREE.Mesh(flagGeo,mat);flag.position.set(.7,4.65,0);g.add(flag);
  }
  // Direction boards and braking markers are road furniture, not repeated arches.
  const signMat=new THREE.MeshStandardMaterial({color:'#173b41',roughness:.72});
  for(const t of [.19,.31,.39,.48,.68,.94]){
    const s=track.sample(t),p=s.position.clone().addScaledVector(s.right,-10.2),g=localFrame({...s,position:p});scene.add(g);
    addBox(g,silver,[0,1.25,0],[.07,2.5,.07]);addTextPanel(g,'COASTLINE  →',2.3,.64,[0,2.15,-.07],{fontSize:80});
  }
  // Curved, restrained luminaires establish scale in the opening approach.
  const lampFace=new THREE.MeshStandardMaterial({color:'#ffefd0',emissive:'#ffe3ad',emissiveIntensity:.32,roughness:.4});
  for(let i=0;i<11;i++){
    const s=track.sample(-.06+i*.012),p=s.position.clone().addScaledVector(s.right,-10.1),g=localFrame({...s,position:p});scene.add(g);
    addCylinderBetween(g,new THREE.Vector3(0,0,0),new THREE.Vector3(0,7.0,0),.065,dark,7);
    const path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,6.8,0),new THREE.Vector3(.13,7.4,0),new THREE.Vector3(.55,7.65,0),new THREE.Vector3(1.7,7.65,0)]);
    const neck=new THREE.Mesh(new THREE.TubeGeometry(path,8,.054,6,false),dark);g.add(neck);
    addBox(g,dark,[1.7,7.65,0],[1.25,.15,.36],0,false);
    addBox(g,lampFace,[1.7,7.565,0],[1.1,.015,.24],0,false);
  }
  return frame;
}

function buildLandmarks(scene,terrain,track) {
  const ivory=new THREE.MeshStandardMaterial({color:'#e2d9c4',roughness:.85});
  const dark=new THREE.MeshStandardMaterial({color:'#31545a',roughness:.5,metalness:.35});
  const terracotta=new THREE.MeshStandardMaterial({color:'#b88566',roughness:.95});
  const glass=new THREE.MeshStandardMaterial({color:'#8cafb5',metalness:.48,roughness:.16});
  const rng=seeded(197);
  // Lighthouse on an offshore rocky islet, visible from the finish and long coast.
  const island=new THREE.Group();island.position.set(-725,-3,-405);scene.add(island);
  const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(1,3),new THREE.MeshStandardMaterial({color:'#a79980',roughness:1}));
  rock.scale.set(62,28,47);rock.position.y=-13;island.add(rock);
  const foundation=new THREE.Mesh(new THREE.CylinderGeometry(13,18,3,40),ivory);foundation.position.y=12;island.add(foundation);
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(3.4,5.2,31,32),ivory);tower.position.y=29; tower.castShadow=true;island.add(tower);
  for(const y of [18,28,38]){
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(4.55-(y-18)*.058,4.65-(y-18)*.058,1.35,32),terracotta);ring.position.y=y;island.add(ring);
  }
  const gallery=new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.2,.4,32),ivory);gallery.position.y=44.8;island.add(gallery);
  const lantern=new THREE.Mesh(new THREE.CylinderGeometry(2.9,2.9,3.9,16),glass);lantern.position.y=47.0;island.add(lantern);
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2;addBox(island,dark,[Math.cos(a)*4.7,45.6,Math.sin(a)*4.7],[.055,1.15,.055],0,false);
    if(i%2===0)addBox(island,dark,[Math.cos(a)*2.95,47,Math.sin(a)*2.95],[.08,4,.08],0,false);
  }
  const railing=new THREE.Mesh(new THREE.TorusGeometry(4.7,.055,5,48),dark);railing.rotation.x=Math.PI/2;railing.position.y=46.1;island.add(railing);
  const cap=new THREE.Mesh(new THREE.ConeGeometry(4.1,2.9,32),dark);cap.position.y=50.3;island.add(cap);
  addBox(island,ivory,[12,15,4],[14,5,9]);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(10,3.6,4),terracotta);roof.rotation.y=Math.PI/4;roof.scale.z=.7;roof.position.set(12,19.1,4);island.add(roof);

  // White coastal villas with pitched roofs, glazing, pergolas and small balconies.
  const villas=[[-260,-490],[-85,-540],[110,-500],[385,290],[465,180]];
  for(let i=0;i<villas.length;i++){
    const [x,z]=villas[i],y=terrain.height(x,z),g=new THREE.Group();g.position.set(x,y-.3,z);g.rotation.y=.3+i*.63;scene.add(g);
    addBox(g,ivory,[0,4,0],[17,8,12]);addBox(g,ivory,[7.5,2.6,3],[11,5.2,14]);
    addBox(g,dark,[0,4.2,-6.06],[12.4,4.5,.08]);
    for(const xx of [-6,-2,2,6])addBox(g,ivory,[xx,4.2,-6.15],[.2,4.7,.18]);
    const rg=new THREE.CylinderGeometry(0,1,1,4,1);rg.rotateY(Math.PI/4);
    const rm=new THREE.Mesh(rg,terracotta);rm.scale.set(13,4,10);rm.position.y=10;g.add(rm);
    addBox(g,ivory,[0,.15,-11],[25,.3,10]);
    for(let j=-5;j<=5;j++)addBox(g,terracotta,[j*1.8,4,-12],[.15,.18,10]);
    for(const xx of [-9,9])for(const zz of [-8,-16])addBox(g,ivory,[xx,2,zz],[.2,4,.2]);
  }

  const rotors=[];
  for(const [x,z,s] of [[720,-50,1],[870,230,.86],[840,-390,.96]]){
    const g=new THREE.Group();g.position.set(x,terrain.height(x,z),z);scene.add(g);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(1.6,3.3,68*s,16),ivory);mast.position.y=34*s;g.add(mast);
    addBox(g,ivory,[0,68*s,0],[3.8,3.7,8]);
    const rotor=new THREE.Group();rotor.position.set(0,68*s,-4.6);g.add(rotor);rotors.push(rotor);
    const hub=new THREE.Mesh(new THREE.SphereGeometry(1.9,12,8),ivory);rotor.add(hub);
    for(let k=0;k<3;k++){
      const blade=new THREE.Shape();blade.moveTo(-.65,1);blade.bezierCurveTo(-2.7,9,-1.5,22,-.15,30);blade.bezierCurveTo(.6,18,1.5,7,.65,1);
      const geo=new THREE.ExtrudeGeometry(blade,{depth:.23,bevelEnabled:true,bevelSize:.12,bevelThickness:.12,bevelSegments:1,curveSegments:7});
      const mesh=new THREE.Mesh(geo,ivory);mesh.rotation.z=k/3*Math.PI*2;mesh.scale.setScalar(s);rotor.add(mesh);
    }
  }
  const boats=[];
  for(const [x,z,scale] of [[-960,-140,1],[-1120,410,.75],[-710,660,.65]]){
    const boat=new THREE.Group();boat.position.set(x,SEA_Y+.8,z);boat.rotation.y=.3+rng()*2;boat.scale.setScalar(scale);scene.add(boat);boats.push(boat);
    const hull=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),ivory);hull.scale.set(2.0,1.0,6.7);boat.add(hull);
    addBox(boat,dark,[0,.8,0],[2.2,.6,6]);
    addCylinderBetween(boat,new THREE.Vector3(0,1,0),new THREE.Vector3(0,15,0),.085,dark,6);
    const sailGeo=new THREE.BufferGeometry();sailGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,2,0,0,14.5,0,.4,2.3,6.4],3));sailGeo.computeVertexNormals();
    const sail=new THREE.Mesh(sailGeo,new THREE.MeshStandardMaterial({color:'#f1e7cc',roughness:1,side:THREE.DoubleSide}));boat.add(sail);
  }
  return {rotors,boats};
}

function batchStaticMeshes(scene, exclusions) {
  // Architecture and bridge details are merged by shared material to limit draw calls.
  const batches=new Map(),remove=[];
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh||!o.parent||Array.isArray(o.material)||o.material.isShaderMaterial)return;
    if(exclusions.has(o)||o.geometry.attributes.position.count>3500)return;
    let ancestor=o;while(ancestor){if(exclusions.has(ancestor))return;ancestor=ancestor.parent;}
    const key=`${o.material.uuid}:${o.castShadow?1:0}:${o.receiveShadow?1:0}`;
    if(!batches.has(key))batches.set(key,{geometries:[],objects:[],material:o.material,cast:o.castShadow,receive:o.receiveShadow});
    const b=batches.get(key),g=o.geometry.clone().applyMatrix4(o.matrixWorld);
    // All primitives need a consistent attribute schema before merging.
    if(!g.attributes.normal)g.computeVertexNormals();
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
    b.geometries.push(g.index?g.toNonIndexed():g);b.objects.push(o);
  });
  for(const b of batches.values()){
    if(b.objects.length<2){b.geometries.forEach(g=>g.dispose());continue;}
    const merged=mergeGeometries(b.geometries);b.geometries.forEach(g=>g.dispose());
    if(!merged)continue;
    const mesh=new THREE.Mesh(merged,b.material);mesh.castShadow=b.cast;mesh.receiveShadow=b.receive;
    mesh.name='Batched coastal architecture';scene.add(mesh);b.objects.forEach(o=>o.removeFromParent());
  }
}

export function createWorld(scene,renderer,track) {
  const priorChildren=new Set(scene.children);
  const sky=buildSky(scene,renderer);
  const ocean=buildOcean(scene,sky.sunDirection);
  const terrain=buildTerrain(scene,track);
  const roadMesh=buildRoad(scene,track);
  const bridge=buildBridge(scene,track);
  buildVegetation(scene,terrain,track);
  const festival=buildFestival(scene,track,terrain);
  const landmarks=buildLandmarks(scene,terrain,track);
  const night=buildNightDetails(scene,track);
  batchStaticMeshes(scene,new Set([...priorChildren,night.group,sky.sky,ocean.mesh,roadMesh,...landmarks.rotors,...landmarks.boats]));
  const generatedChildren=scene.children.filter(child=>!priorChildren.has(child)&&child!==night.group);
  const dayMaterials=new Map();
  generatedChildren.forEach(root=>root.traverse?.(o=>{
    const materials=Array.isArray(o.material)?o.material:[o.material];
    materials.filter(Boolean).forEach(material=>{
      if(material.color&&!dayMaterials.has(material))dayMaterials.set(material,{color:material.color.clone(),emissive:material.emissive?.clone(),emissiveIntensity:material.emissiveIntensity});
    });
  }));
  let theme='day';
  return {
    sunDirection:sky.sunDirection,sunLight:sky.sunLight,hemiLight:sky.hemi,skyMesh:sky.sky,roadMesh,terrain,bridge,festival,night,
    get theme(){return theme;},
    setTheme(next='day'){
      theme=next==='night'?'night':'day';
      const isNight=theme==='night';
      night.group.visible=isNight;
      sky.sky.visible=!isNight;
      sky.sunLight.color.set(isNight?'#6c8fc9':'#ffd6a0'); sky.sunLight.intensity=isNight?.22:3.2;
      sky.hemi.intensity=isNight?.13:.55; sky.hemi.color.set(isNight?'#5274b2':'#a8c5e1'); sky.hemi.groundColor.set(isNight?'#07101f':'#4e4939');
      scene.fog=new THREE.FogExp2(isNight?'#081324':'#bdc6c3',isNight?.00043:.00031);
      dayMaterials.forEach((original,material)=>{
        material.color.copy(original.color).multiplyScalar(isNight?.34:1);
        if(material.emissive&&original.emissive)material.emissive.copy(original.emissive);
        if(material.emissive)material.emissiveIntensity=original.emissiveIntensity||0;
      });
      return theme;
    },
    update(time,dt){
      sky.update(time);ocean.update(time);
      landmarks.rotors.forEach((rotor,i)=>rotor.rotation.z=time*(.13+i*.015));
      landmarks.boats.forEach((boat,i)=>{boat.rotation.z=Math.sin(time*.62+i)*.018;boat.position.y=SEA_Y+.8+Math.sin(time*.72+i)*.15;});
    },
    dispose(){sky.environment.dispose();},
  };
}
export {buildSky,buildRoad,buildNightDetails,batchStaticMeshes,makeRibbon,addBox,addCylinderBetween,addTextPanel,localFrame,instance,seeded};
