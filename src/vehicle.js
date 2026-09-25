import * as THREE from 'three';
import {buildPremiumCar} from './premium-vehicle.js';
import {CAR_SPECS} from './vehicle-catalog.js';
export {CAR_SPECS} from './vehicle-catalog.js';
import {Parts,surface,smoothProfile,materials,makeWheel,interior} from './vehicle-primitives.js';
const clamp=THREE.MathUtils.clamp,TAU=Math.PI*2;
/** Creates a detailed original GT/sports car without external model assets or DOM. */
export function createCar({ model = 'aurora', color, detail = 'high' } = {}) {
  const spec = CAR_SPECS.find(s => s.id === model) || CAR_SPECS[0];
  model = spec.id;
  const high = detail !== 'low';
  const exotic = model === 'vesper', club = model === 'kasumi';
  const m = materials(color ?? spec.color, model);
  if(spec.premium){const built=buildPremiumCar(spec,m,high);return equipCar(built.car,built.body,m,spec,detail,{...spec.design,halfWidth:spec.halfWidth,wing:built.wing});}
  const car = new THREE.Group(); car.name = spec.label;
  const body = new THREE.Group(); body.name = 'sprung body'; car.add(body);
  const p = new Parts();
  const frontAxle = spec.wheelbase / 2, rearAxle = -spec.wheelbase / 2;
  const nose = exotic ? 2.37 : club ? 2.18 : 2.32;
  const tail = exotic ? -2.30 : club ? -2.16 : -2.29;
  const halfWidth = exotic ? 1.015 : club ? .93 : .99;
  const cabinShift = exotic ? .25 : club ? -.06 : 0;
  const roofY = exotic ? 1.30 : club ? 1.44 : 1.43;
  const hoodScale = exotic ? .91 : 1;
  const widths = [[tail, .81], [tail + .20, .94], [-1.42, 1], [-.8, .965], [0, .94], [1.35, 1], [nose - .2, .94], [nose, .85]];
  const tops = [[tail, .72], [tail + .28, .82], [-1.15, .94], [0, .94], [.65, .92 * hoodScale], [1.3, .80 * hoodScale], [nose - .35, .70 * hoodScale], [nose, .64]];
  const width = z => smoothProfile(widths, z) * halfWidth;
  const arch = z => {
    const d = Math.min(Math.abs(z - frontAxle), Math.abs(z - rearAxle));
    return d < .43 ? .372 + Math.sqrt(Math.max(0, .43 * .43 - d * d)) : .245;
  };
  const top = (u, z) => {
    const base = smoothProfile(tops, z), edge = Math.abs(u);
    const fender = Math.exp(-Math.pow((z - frontAxle) / .68, 2)) + Math.exp(-Math.pow((z - rearAxle) / .62, 2));
    const shoulder = Math.max(base - .025 + .14 * fender, arch(z) + .052);
    const blend = Math.pow(edge, 3.2);
    return base + .025 * (1 - u * u) + (shoulder - base) * blend;
  };
  const longitudinal = high ? 112 : 60;
  // A continuous crowned upper shell flows into muscular wheel shoulders.
  p.add(surface((u, v) => { const z = tail + (nose - tail) * v, x = u * 2 - 1; return [x * width(z), top(x, z), z]; }, high ? 36 : 18, longitudinal, true), m.paint);
  for (const side of [-1, 1]) {
    // The lower boundary rises around the tire. These are real openings, not black decals.
    p.add(surface((u, v) => {
      const z = tail + (nose - tail) * u, lo = arch(z), hi = top(1, z);
      const y = lo + (hi - lo) * v;
      return [side * (width(z) - .025 * Math.sin(Math.PI * v) - .065 * (1 - v)), y, z];
    }, longitudinal, 10, side > 0), m.paint);
    // Fine arch lip with interior black wheel tub visible above each tire.
    for (const axle of [frontAxle, rearAxle]) {
      const pts = [], innerPts = [];
      for (let i = 0; i <= 36; i++) {
        const a = .05 + (Math.PI - .10) * i / 36;
        const z = axle + Math.cos(a) * .43, y = .372 + Math.sin(a) * .43;
        pts.push([side * (width(z) - .056), y + .001, z]);
        innerPts.push([side * (width(z) - .087), y - .017, z]);
      }
      p.tube(pts, .010, m.paint, high ? 42 : 24);
      p.tube(innerPts, .019, m.black, high ? 38 : 22);
      // A full liner closes the wheel housing behind the moving tire.
      p.add(surface((u,v)=>{
        const a=u*Math.PI;
        return [side*THREE.MathUtils.lerp(halfWidth-.45,halfWidth-.07,v),.372+Math.sin(a)*.445,axle+Math.cos(a)*.445];
      },high?36:20,3,side<0),m.black);
      p.add(new THREE.CircleGeometry(.44,high?40:24,0,Math.PI),m.black,[side*(halfWidth-.44),.372,axle],[0,side*Math.PI/2,0]);
    }
    p.tube([[side * .88 * halfWidth, .25, rearAxle + .52], [side * .95 * halfWidth, .245, -.2], [side * .90 * halfWidth, .25, frontAxle - .52]], .035, m.carbon, 24);
    p.tube([[side * .9 * halfWidth, .284, rearAxle + .54], [side * .96 * halfWidth, .28, -.2], [side * .91 * halfWidth, .28, frontAxle - .56]], .009, m.paint, 24);
  }
  // Sculpted end caps follow the shell, with intake and optical units layered over them.
  for (const [z, front] of [[nose, true], [tail, false]]) {
    p.add(surface((u, v) => {
      const x = (u * 2 - 1) * width(z), lo = front ? .27 : .32;
      return [x, lo + (top(u * 2 - 1, z) - lo) * v, z + (front ? 1 : -1) * .035 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)];
    }, 28, 8, !front), m.paint);
  }
  // Dark underside does not fill the visible wheel apertures.
  p.box([1.30, .055, nose - tail - .2], m.black, [0, .25, (nose + tail) / 2], [0, 0, 0], .018);

  // Cabin: curved roof, raked windshield, fastback rear glass and sculpted side glazing.
  const roofFront = .09 + cabinShift, roofBack = -.72 + cabinShift;
  const windBase = .67 + cabinShift, rearBase = -1.29 + cabinShift;
  const roofHalf = exotic ? .625 : club ? .65 : .66;
  p.add(surface((u, v) => {
    const t = u * 2 - 1, z = roofBack + (roofFront - roofBack) * v;
    return [t * roofHalf * (1 - .035 * Math.cos(v * TAU)), roofY + .052 * (1 - t * t) + .018 * Math.sin(v * Math.PI), z];
  }, 28, 18, true), exotic ? m.carbon : m.paint);
  const windFn = (u, v) => {
    const t = u * 2 - 1, half = THREE.MathUtils.lerp(.755, roofHalf, v);
    return [t * half, THREE.MathUtils.lerp(.97, roofY, v) + .027 * (1 - t * t), THREE.MathUtils.lerp(windBase, roofFront, v) + .04 * (1 - t * t) * Math.sin(Math.PI * v)];
  };
  const rearFn = (u, v) => {
    const t = u * 2 - 1, half = THREE.MathUtils.lerp(.77, roofHalf, v);
    return [t * half, THREE.MathUtils.lerp(.97, roofY, v) + .025 * (1 - t * t), THREE.MathUtils.lerp(rearBase, roofBack, v) - .025 * (1 - t * t)];
  };
  p.add(surface(windFn, 26, 16), m.glass);
  p.add(surface(rearFn, 26, 16, true), m.glass);
  for (const fn of [windFn, rearFn]) {
    for (const edge of [0, 1]) {
      const pts = [];
      for (let i = 0; i <= 18; i++) pts.push(fn(i / 18, edge));
      p.tube(pts, edge ? .017 : .022, m.black, 25);
    }
  }
  for (const side of [-1, 1]) {
    const pts = [
      [side * .755, .97, windBase], [side * roofHalf, roofY, roofFront],
      [side * roofHalf, roofY, roofBack], [side * .77, .97, rearBase],
    ];
    // Side windows form a four-sided ruled surface; subtle convexity catches sky light.
    p.add(surface((u, v) => {
      const bottomZ = THREE.MathUtils.lerp(rearBase + .02, windBase - .015, u);
      const topZ = THREE.MathUtils.lerp(roofBack, roofFront, u);
      return [side * (THREE.MathUtils.lerp(.765, roofHalf, v) + .012 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)), THREE.MathUtils.lerp(.975, roofY, v) + .008 * Math.sin(Math.PI * u), THREE.MathUtils.lerp(bottomZ, topZ, v)];
    }, 20, 10, side > 0), m.glass);
    p.tube([pts[0], [side * .715, 1.10, windBase - .18], pts[1]], .035, m.paint, 24);
    p.tube([pts[1], [side * roofHalf, roofY + .01, (roofFront + roofBack) / 2], pts[2]], .027, m.paint, 28);
    p.tube([pts[2], [side * .714, 1.14, rearBase + .18], pts[3]], exotic ? .07 : .061, m.paint, 24);
    p.tube([[side * .77, .97, rearBase], [side * .80, .959, -.2 + cabinShift], [side * .755, .97, windBase]], .02, m.black, 36);
    p.tube([[side * .71, roofY - .025, -.56 + cabinShift], [side * .78, .979, -.79 + cabinShift]], .018, m.black, 14);
    // Door outlines sit on the lower side, terminating clear of the wheel arches.
    const doorRear = -.77 + cabinShift, doorFront = .72 + cabinShift;
    const doorPts = [
      [side * (width(doorRear) + .002), top(1, doorRear) - .02, doorRear],
      [side * (width(doorRear) - .027), .61, doorRear + .02],
      [side * (width(doorRear + .15) - .052), .35, doorRear + .15],
      [side * (width(.1) - .055), .325, .1],
      [side * (width(doorFront - .13) - .05), .38, doorFront - .13],
      [side * (width(doorFront) - .018), .68, doorFront],
      [side * (width(doorFront) + .001), top(1, doorFront) - .015, doorFront],
    ];
    p.tube(doorPts, high ? .0035 : .004, m.black, 48);
    p.box([.014, .025, .15], m.black, [side * (width(doorRear + .18) - .003), .845, doorRear + .18], [0, 0, 0], .01);
    p.box([.016, .009, .105], m.chrome, [side * width(doorRear + .18), .85, doorRear + .18], [0, 0, 0], .004);
    // Mirrors on a real stalk with painted fairing and optical face.
    p.tube([[side * .77, .99, .45 + cabinShift], [side * .91, 1.01, .49 + cabinShift], [side * 1.02, 1.025, .49 + cabinShift]], .018, m.black, 12);
    p.add(new THREE.SphereGeometry(1, 18, 10), m.paint, [side * 1.035, 1.045, .49 + cabinShift], [0, side * -.12, 0], [.137, .060, .082]);
    p.box([.174, .062, .012], m.chrome, [side * 1.037, 1.049, .424 + cabinShift], [0, side * -.12, 0], .02);
    p.tube([[side * .97, 1.043, .55 + cabinShift], [side * 1.06, 1.043, .561 + cabinShift]], .004, m.white, 10);
  }
  interior(p, m, cabinShift, high);

  // Hood shut lines, subtle power bulges and tucked windshield wipers.
  for (const side of [-1, 1]) {
    const hoodPoints = [];
    for (let i = 0; i <= 20; i++) {
      const z = windBase + .04 + (nose - .22 - windBase) * i / 20;
      const x = side * (.53 + .06 * Math.sin(Math.PI * i / 20));
      hoodPoints.push([x, top(x / width(z), z) + .004, z]);
    }
    p.tube(hoodPoints, .003, m.black, 34);
    if (high) {
      const crease = hoodPoints.map(v => [v[0] * .79, v[1] + .006, v[2]]);
      p.tube(crease, .007, m.paint, 34);
    }
    p.tube([[side * .15, .987, windBase + .015], [side * .43, 1.005, windBase - .015], [side * .66, 1.015, windBase - .043]], .009, m.black, 14);
  }

  // Front lower intake and side channels are inset black volumes with real grille vanes.
  p.box([1.10, .195, .10], m.black, [0, .408, nose + .026], [0, 0, 0], .057);
  p.box([1.24, .030, .18], m.carbon, [0, .284, nose + .046], [0, 0, 0], .012);
  for (const side of [-1, 1]) {
    p.box([.25, .18, .12], m.black, [side * .68, .395, nose - .039], [0, side * .14, 0], .034);
    p.box([.028, .16, .19], m.paint, [side * .506, .407, nose + .027], [0, side * -.18, 0], .01);
    for (let i = 0; i < (high ? 3 : 2); i++) p.box([.194, .012, .055], m.carbon, [side * .68, .345 + i * .045, nose + .023], [0, side * .14, 0], .003);
    const lampZ = nose - .145;
    p.box([.46, .105, .145], m.black, [side * .58, .668, lampZ], [-.16, side * -.19, side * -.045], .038);
    p.box([.425, .073, .143], m.lens, [side * .58, .673, lampZ + .009], [-.16, side * -.19, side * -.045], .029);
    // Thin double optical blades give the car a distinct light signature.
    for (const y of [.655, .688]) p.tube([[side * .386, y, lampZ + .077], [side * .59, y + .011, lampZ + .087], [side * .776, y + .010, lampZ + .058]], exotic ? .008 : .010, m.white, 22);
    if (high) for (let i = 0; i < 3; i++) p.add(new THREE.SphereGeometry(.02, 10, 6), m.white, [side * (.47 + i * .095), .672, lampZ + .080], [0, 0, 0], [1, .7, .3]);
    p.box([.015, .045, .075], m.amber, [side * (width(nose - .45) + .008), .62, nose - .45], [0, 0, 0], .008);
  }
  if (high) for (let i = -7; i <= 7; i++) p.box([.013, .143, .018], m.carbon, [i * .064, .408, nose + .084], [0, 0, .15], .003);

  // Rear horizontal light sculpture, diffuser and twin metal exhaust outlets.
  p.box([1.54, .13, .095], m.black, [0, .705, tail - .025], [0, 0, 0], .04);
  for (const side of [-1, 1]) {
    p.tube([[side * .07, .745, tail - .079], [side * .52, .741, tail - .083], [side * .748, .715, tail - .064]], .012, m.red, 25);
    p.tube([[side * .20, .693, tail - .081], [side * .55, .690, tail - .083], [side * .75, .704, tail - .064]], .008, m.red, 22);
    p.box([.33, .14, .078], m.black, [side * .58, .473, tail - .026], [0, 0, 0], .025);
    for (let i = 0; i < (high ? 4 : 2); i++) p.box([.29, .008, .01], m.carbon, [side * .58, .428 + i * .028, tail - .074], [0, 0, 0], .002);
    const exhaustY = exotic ? .49 : .345;
    const exhaustX = exotic ? .31 : .59;
    p.add(new THREE.CylinderGeometry(.068, .063, .13, high ? 24 : 14, 1, true), m.chrome, [side * exhaustX, exhaustY, tail - .057], [Math.PI / 2, 0, 0]);
    p.add(new THREE.CircleGeometry(.057, 20), m.black, [side * exhaustX, exhaustY, tail - .127], [0, Math.PI, 0]);
  }
  p.box([1.63, .11, .31], m.carbon, [0, .265, tail + .021], [-.08, 0, 0], .033);
  for (let i = -3; i <= 3; i++) p.box([.014, .11, .35], m.carbon, [i * .2, .261, tail + .034], [-.12, 0, 0], .004);
  p.box([.34, .11, .021], m.black, [0, .494, tail - .047], [0, 0, 0], .01);
  p.box([.29, .08, .022], m.chrome, [0, .494, tail - .060], [0, 0, 0], .008);
  // Original split-chevron emblem (geometry, never a copied manufacturer badge).
  for (const side of [-1, 1]) {
    p.box([.013, .052, .006], m.chrome, [side * .014, .718, tail - .093], [0, 0, side * -.43], .002);
    p.box([.009, .035, .035], m.chrome, [side * .012, top(0, nose - .26) + .008, nose - .26], [.63, 0, side * -.35], .002);
  }
  // Aerodynamics and additional design language differentiate the three originals.
  if (exotic) {
    for (const side of [-1, 1]) {
      p.box([.028, .25, .50], m.black, [side * .96, .66, -.66], [0, side * .08, side * -.06], .06);
      p.tube([[side * .948, .52, -.40], [side * .988, .73, -.76], [side * .967, .85, -.95]], .025, m.paint, 26);
      for (let i = 0; i < 3; i++) p.box([.032, .012, .29], m.carbon, [side * .98, .59 + i * .062, -.64], [0, side * .06, 0], .003);
      // Ventilated rear engine deck.
      for (let i = 0; i < 6; i++) p.box([.29, .012, .035], m.black, [side * .32, .905 - i * .012, -1.35 - i * .074], [0, 0, 0], .005);
    }
  } else {
    for (const side of [-1, 1]) {
      const ventZ = frontAxle - .58;
      p.box([.02, .112, .235], m.black, [side * (width(ventZ) - .002), .701, ventZ], [0, 0, 0], .025);
      for (let i = 0; i < 3; i++) p.box([.029, .009, .181], m.chrome, [side * width(ventZ), .669 + i * .032, ventZ], [0, 0, 0], .003);
    }
  }
  const wing = new THREE.Group(); wing.name = 'active rear aero'; body.add(wing);
  const aero = new Parts();
  if (club || exotic) {
    const wingY = club ? 1.02 : .99, wingZ = tail + .30;
    for (const side of [-1, 1]) aero.box([.031, .18, .13], m.carbon, [side * .56, wingY - .11, wingZ], [-.13, 0, 0], .01);
    aero.add(surface((u, v) => [(u * 2 - 1) * (club ? .96 : .90), wingY + .038 * Math.sin(v * Math.PI) - .026 * v, wingZ - .14 + v * .29], 24, 10, true), m.carbon);
    for (const side of [-1, 1]) aero.box([.025, .092, .34], m.carbon, [side * (club ? .96 : .90), wingY + .012, wingZ], [0, 0, 0], .018);
  } else {
    const wingPoints = [];
    for (let i = 0; i <= 24; i++) { const x = (i / 24 * 2 - 1) * .84, z = tail + .13 + .065 * Math.pow(x / .84, 2); wingPoints.push([x, top(x / width(z), z) + .025, z]); }
    aero.tube(wingPoints, .021, m.carbon, 38);
  }
  aero.finish(wing);
  p.finish(body);

  return equipCar(car,body,m,spec,detail,{nose,halfWidth,frontAxle,rearAxle,wing});
}

function equipCar(car,body,m,spec,detail,{nose,halfWidth,frontAxle,rearAxle,wing}){
  const high=detail!=='low',model=spec.id;
  // Real dynamic lighting: the meshes are the visible optics, while the spot/point
  // lights illuminate the road and nearby cars. The game toggles these four modes.
  const lightGroup = new THREE.Group(); lightGroup.name = 'dynamic vehicle lighting'; car.add(lightGroup);
  const nearMaterial = new THREE.MeshStandardMaterial({ color: '#e7f7ff', emissive: '#b9eaff', emissiveIntensity: 0, toneMapped: false });
  const ambientBlue = new THREE.MeshBasicMaterial({ color: '#28d9ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const ambientRed = new THREE.MeshBasicMaterial({ color: '#ff2c72', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const nearBulbs = [], beamLights = [], beamTargets = [], ambientNodes = [], ambientPointLights = [];
  for (const side of [-1, 1]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 8), nearMaterial);
    bulb.position.set(side * (spec.premium?.72:.58), spec.premium?.82:.684, nose - .10); lightGroup.add(bulb); nearBulbs.push(bulb);
    const target = new THREE.Object3D(); target.position.set(side * .50, .54, nose + 42); lightGroup.add(target); beamTargets.push(target);
    const beam = new THREE.SpotLight('#dcf6ff', 0, 96, .36, .68, 1.7);
    beam.position.set(side * (spec.premium?.72:.58), spec.premium?.82:.69, nose + .05); beam.target = target; beam.castShadow = false; lightGroup.add(beam); beamLights.push(beam);
    const ambient = new THREE.Mesh(new THREE.BoxGeometry(.32, .028, .035), side < 0 ? ambientBlue : ambientRed);
    ambient.position.set(side * .72, .31, -.02); lightGroup.add(ambient); ambientNodes.push(ambient);
    const point = new THREE.PointLight(side < 0 ? '#24d8ff' : '#ff2e74', 0, 5.5, 2);
    point.position.copy(ambient.position); lightGroup.add(point); ambientPointLights.push(point);
  }

  const wheels = [];
  for (const front of [true, false]) for (const side of [-1, 1]) {
    const wheel = makeWheel(m, side, high, spec.design?.wheelDesign);
    const tireWidth=front?spec.design?.frontTire:spec.design?.rearTire;
    wheel.pivot.scale.set((tireWidth??.30)/.30,spec.wheelRadius/.373,spec.wheelRadius/.373);
    wheel.pivot.position.set(side * (halfWidth - (tireWidth??.30)/2-.035), spec.wheelRadius, front ? frontAxle : rearAxle);
    wheel.pivot.name = `${front ? 'front' : 'rear'} ${side < 0 ? 'left' : 'right'} wheel`;
    car.add(wheel.pivot); wheels.push({ ...wheel, front, side });
  }
  car.userData = { spec, model, wheels, body, paint: m.paint, brakeLights: [m.red], headLights: [m.white], materials: m, wing, wheelRadius: spec.wheelRadius, halfWidth, length: spec.length, speed: 0, detail, lightMode: 0, nearBulbs, beamLights, beamTargets, ambientNodes, ambientPointLights, nearMaterial, ambientBlue, ambientRed, nose };
  setCarLightMode(car, 0);
  return car;
}

// Keep the player's light topology fixed so L only changes uniforms, not shader variants.
export function configureDynamicCarLights(car){car.userData.stableLightLayout=true;setCarLightMode(car,car.userData.lightMode,car.userData.lightProfile);}

export function setCarLightMode(car, mode = 0, profile = {}) {
  const data = car?.userData;
  if (!data?.beamLights) return 0;
  mode = ((Math.round(mode) % 4) + 4) % 4;
  const near = mode === 1, high = mode === 2, ambient = mode === 3;
  const tint = profile.tint || '#dcf6ff';
  data.nearMaterial.color.set(near||high?tint:'#10171d'); data.nearMaterial.emissive.set(tint);
  data.nearMaterial.emissiveIntensity = near ? (profile.brightness ?? 3.6) : high ? (profile.brightness ?? 5.5) : 0;
  data.headLights.forEach(material => { material.emissiveIntensity = near ? 2.8 : high ? 5.2 : ambient ? .22 : 0; });
  data.nearBulbs.forEach(mesh => { mesh.visible = data.stableLightLayout || near || high; });
  data.beamTargets.forEach((target,index)=>target.position.set(index===0?-.50:.50, .42, data.nose + (high ? 150 : 48)));
  data.beamLights.forEach(light => { light.color.set(tint); light.visible = data.stableLightLayout || near || high; light.intensity = near ? (profile.beam ?? 90) : high ? (profile.highBeam ?? 360) : 0; light.distance = high ? 190 : 96; light.angle = high ? .21 : .38; light.penumbra = high ? .42 : .66; });
  data.ambientBlue.opacity = ambient ? .82 : 0; data.ambientRed.opacity = ambient ? .82 : 0;
  data.ambientNodes.forEach(node => { node.visible = data.stableLightLayout || ambient; });
  data.ambientPointLights.forEach(light => { light.visible = data.stableLightLayout || ambient; light.intensity = ambient ? (profile.ambientBrightness ?? 2.2) : 0; });
  data.lightMode = mode; data.lightProfile = profile;
  return mode;
}

export function cycleCarLightMode(car, profile = {}) {
  return setCarLightMode(car, (car?.userData?.lightMode ?? 0) + 1, profile);
}

/** Kinematic detail animation. Speed is metres per second; steer is -1..1. */
export function updateCar(car, { steer = 0, speed = 0, brake = 0, time = 0, dt = 1 / 60 } = {}) {
  const data = car.userData;
  dt = clamp(dt, 0, .08);
  for (const wheel of data.wheels) {
    wheel.pivot.rotation.y = wheel.front ? steer * .44 : 0;
    wheel.spin.rotation.x += speed * dt / data.wheelRadius;
  }
  data.speed = speed;
  // Road pitch belongs to the car root. Keep the shell stable relative to it.
  data.body.rotation.x = 0;
  data.body.rotation.z = 0;
  data.body.position.y = 0;
  for (const material of data.brakeLights) material.emissiveIntensity = brake > .05 ? 5.0 : 1.45;
}
