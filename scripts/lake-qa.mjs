import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('artifacts/lake',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--disable-gpu-sandbox','--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/lake-inspect.html',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  await page.goto('http://127.0.0.1:5173/lake-inspect.html');
  await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createTrack}=await import('/src/track.js'),{createRegionalWorld}=await import('/src/regional-world.js');
    const {RGBELoader}=await import('/node_modules/three/examples/jsm/loaders/RGBELoader.js');
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
    document.body.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,5000);
    const track=createTrack('harbor'),world=createRegionalWorld(scene,renderer,track);world.setTheme('day');
    const hdr=await new RGBELoader().loadAsync('/environment/kloppenheim_06_puresky_2k.hdr');hdr.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(hdr).texture;scene.environmentIntensity=.8;scene.background=hdr;pmrem.dispose();
    window.lakeQA={scene,world,renderer,camera,hdr,track};
    window.renderView=(position,target,time=4,night=false)=>{
      world.setTheme(night?'night':'day');scene.background=night?new THREE.Color('#06101f'):hdr;scene.environmentIntensity=night?.34:.8;
      camera.position.fromArray(position);camera.lookAt(...target);world.update(time);renderer.render(scene,camera);
    };
  });
  for(const [name,pos,target] of [['overview',[-335,180,385],[0,1,40]],['boats',[-210,22,96],[-125,2,37]],['sailboat',[15,13,-20],[50,6,-62]],['roadside',[-224,12,120],[0,1,40]]]){
    await page.evaluate(({pos,target})=>window.renderView(pos,target),{pos,target});await page.screenshot({path:`artifacts/lake/${name}.png`});
  }
  for(const [name,pos,target]of [['seaward',[400,135,-300],[700,1,-125]],['channel',[230,14,-60],[600,1,-125]],['island',[-750,560,920],[0,1,40]]]){
    await page.evaluate(({pos,target})=>window.renderView(pos,target),{pos,target});await page.screenshot({path:`artifacts/lake/${name}.png`});
  }
  for(const t of [0,.27,.36,.6,.89]){
    await page.evaluate(t=>{
      const s=lakeQA.track.sample(t),p=s.position.clone().addScaledVector(s.tangent,-7.4);p.y+=3;
      const target=s.position.clone().addScaledVector(s.tangent,16);target.y+=1.1;
      window.renderView(p.toArray(),target.toArray());
    },t);await page.screenshot({path:`artifacts/lake/drive-${t}.png`});
  }
  await page.evaluate(()=>window.renderView([-210,22,96],[-125,2,37],9,true));await page.screenshot({path:'artifacts/lake/night.png'});
  await page.evaluate(()=>window.renderView([0,15,40],[0,1,65],2));
  const waveA=await page.screenshot({clip:{x:500,y:300,width:400,height:400}});
  await page.evaluate(()=>window.renderView([0,15,40],[0,1,65],7));
  const waveB=await page.screenshot({clip:{x:500,y:300,width:400,height:400}});
  assert.ok(!waveA.equals(waveB),'water must visibly animate');
  const result=await page.evaluate(()=>({boats:lakeQA.world.lake.boats.length,drawCalls:lakeQA.renderer.info.render.calls,roughness:lakeQA.world.lake.water.material.roughness,emissive:lakeQA.world.lake.water.material.emissive.getHex()}));
  assert.equal(result.boats,8);assert.equal(result.emissive,0);assert.deepEqual(errors,[]);
  await fs.writeFile('artifacts/lake/report.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}
