import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const clamp = THREE.MathUtils.clamp;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// Every static car component is baked into a material batch. Wheels stay articulated.
export class Parts {
  constructor() { this.parts = new Map(); }
  add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(key)) geometry.deleteAttribute(key);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    geometry.clearGroups();
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(geometry);
  }
  box(size, material, position, rotation = [0, 0, 0], radius = 0.02) {
    this.add(radius > 0 ? new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(v => v / 2.1))) : new THREE.BoxGeometry(...size), material, position, rotation);
  }
  tube(points, radius, material, steps = 32, closed = false) {
    this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => V(...p)), closed, 'catmullrom', 0.3), steps, radius, 5, closed), material);
  }
  finish(parent) {
    for (const [material, geometries] of this.parts) {
      const merged = mergeGeometries(geometries, false);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !material.userData?.noShadow;
      mesh.receiveShadow = true;
      mesh.name = `batch:${material.name || 'detail'}`;
      parent.add(mesh);
      geometries.forEach(g => g.dispose());
    }
    this.parts.clear();
  }
}

export function surface(fn, nu = 24, nv = 10, reverse = false) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = fn(i / nu, j / nv);
    positions.push(...p); uvs.push(i / nu, j / nv);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (reverse) indices.push(a, c, b, b, c, d); else indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function smoothProfile(points, z) {
  for (let i = 0; i < points.length - 1; i++) {
    if (z <= points[i + 1][0]) {
      const t = clamp((z - points[i][0]) / (points[i + 1][0] - points[i][0]), 0, 1);
      const s = t * t * (3 - 2 * t);
      return THREE.MathUtils.lerp(points[i][1], points[i + 1][1], s);
    }
  }
  return points[points.length - 1][1];
}

export function materials(color, model) {
  function physical(name, options) { const m = new THREE.MeshPhysicalMaterial(options); m.name = name; return m; }
  function standard(name, options) { const m = new THREE.MeshStandardMaterial(options); m.name = name; return m; }
  return {
    paint: physical('pearlescent body paint', { color, metalness: 0.76, roughness: 0.19, clearcoat: 1, clearcoatRoughness: 0.075, envMapIntensity: 1.7, side: THREE.DoubleSide }),
    glass: physical('smoked laminated glass', { color: '#172e3c', metalness: 0.38, roughness: 0.075, transparent: true, opacity: 0.91, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false }),
    black: standard('satin black trim', { color: '#10151a', roughness: 0.49, metalness: 0.28 }),
    carbon: physical('graphite composite', { color: '#182128', metalness: 0.43, roughness: 0.34, clearcoat: 0.65 }),
    rubber: standard('tire rubber', { color: '#15191c', roughness: 0.92, metalness: 0.02 }),
    tread: standard('tire molded detail', { color: '#252a2c', roughness: 0.91 }),
    rim: standard('forged brushed alloy', { color: model === 'kasumi' ? '#d5c19b' : '#b7c7d1', metalness: 0.88, roughness: 0.26 }),
    brake: standard('machined rotor steel', { color: '#707d83', metalness: 0.82, roughness: 0.43 }),
    caliper: physical('ceramic brake calipers', { color: model === 'vesper' ? '#edbd42' : '#e94b32', metalness: 0.22, roughness: 0.34, clearcoat: 0.8 }),
    chrome: standard('polished metal', { color: '#cbd9e2', metalness: 0.96, roughness: 0.17 }),
    interior: standard('charcoal alcantara', { color: '#212b32', roughness: 0.92 }),
    leather: standard('seat bolsters', { color: '#101c23', roughness: 0.6 }),
    seam: standard('contrast stitching', { color: '#d4b58b', roughness: 0.8 }),
    white: standard('daytime light emitters', { color: '#e8f8ff', emissive: '#d2f2ff', emissiveIntensity: 2.8, roughness: 0.18, metalness: 0.12 }),
    red: standard('rear light emitters', { color: '#fa2633', emissive: '#f31b24', emissiveIntensity: 1.5, roughness: 0.24 }),
    lens: physical('headlamp optical lenses', { color: '#a1cddd', metalness: 0.3, roughness: 0.08, clearcoat: 1 }),
    amber: standard('amber marker lamps', { color: '#ffa95c', emissive: '#fc7825', emissiveIntensity: 0.7 }),
  };
}

export function makeWheel(m, side, high, design={}) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group(); pivot.add(spin);
  const p = new Parts();
  const radial = high ? 44 : 24;
  // The lathed tire includes a crowned tread, shoulder, recessed sidewall and bead.
  const tireProfile = [
    [.247, -.142], [.302, -.15], [.339, -.134], [.36, -.106], [.369, -.06],
    [.373, 0], [.369, .06], [.36, .106], [.339, .134], [.302, .15], [.247, .142],
    [.242, .112], [.242, -.112], [.247, -.142],
  ];
  p.add(new THREE.LatheGeometry(tireProfile.map(v => new THREE.Vector2(...v)), radial), m.rubber, [0, 0, 0], [0, 0, Math.PI / 2]);
  const face = side * .151;
  p.add(new THREE.CylinderGeometry(.235,.235,.24,radial,1,true),m.rim,[0,0,0],[0,0,Math.PI/2]);
  const discX = side * (.072-(design.deep??0));
  const axisX = [0, Math.PI / 2, 0];
  p.add(new THREE.TorusGeometry(.243, .014, 8, radial), m.rim, [face, 0, 0], axisX);
  p.add(new THREE.TorusGeometry(.224, .006, 5, radial), m.rim, [face + side * .007, 0, 0], axisX);
  p.add(new THREE.CylinderGeometry(.213, .213, .018, radial), m.brake, [discX, 0, 0], [0, 0, Math.PI / 2]);
  p.add(new THREE.CylinderGeometry(.083, .083, .028, 24), m.rim, [face - side * .045, 0, 0], [0, 0, Math.PI / 2]);
  p.add(new THREE.CylinderGeometry(.049, .049, .012, 20), m.black, [face + side * .006, 0, 0], [0, 0, Math.PI / 2]);
  p.add(new THREE.CylinderGeometry(.02, .02, .015, 12), m.rim, [face + side * .012, 0, 0], [0, 0, Math.PI / 2]);
  const spokeCount = design.spokes ?? (high ? 10 : 5);
  for (let i = 0; i < spokeCount; i++) {
    const a = i * TAU / spokeCount + .13;
    const r = .148;
    // Tangentially swept twin-depth forged spokes.
    p.box([.029, .165, design.spokeWidth ?? (high ? .024 : .04)], m.rim, [face - side * (design.deep ?? .008), Math.cos(a) * r, Math.sin(a) * r], [a + .14, 0, side * -.12], .005);
  }
  if (high) {
    for (const x of [-.142, .142]) {
      p.add(new THREE.TorusGeometry(.314, .0023, 3, radial), m.tread, [x, 0, 0], axisX);
      p.add(new THREE.TorusGeometry(.285, .0018, 3, radial), m.tread, [x, 0, 0], axisX);
    }
    for (let i = 0; i < 32; i++) {
      const a = i * TAU / 32;
      // Thin embossed shoulder sipes; batch geometry costs no extra draw calls.
      p.box([.18, .0019, .009], m.tread, [0, .372 * Math.cos(a), .372 * Math.sin(a)], [a, -.18, 0], 0);
    }
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24, r = i % 2 ? .163 : .189;
      p.add(new THREE.CircleGeometry(.007, 5), m.black, [discX + side * .010, Math.cos(a) * r, Math.sin(a) * r], [0, side * Math.PI / 2, 0]);
    }
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      p.add(new THREE.CylinderGeometry(.008, .008, .012, 6), m.chrome, [face + side * .005, Math.cos(a) * .063, Math.sin(a) * .063], [0, 0, Math.PI / 2]);
    }
  }
  p.finish(spin);
  const fixed = new Parts();
  fixed.box([.075, .138, .073], m.caliper, [side * (.078-(design.deep??0)), .018, -.17], [.15, 0, 0], .022);
  if (high) fixed.box([.077, .087, .02], m.chrome, [side * (.079-(design.deep??0)), .02, -.211], [.15, 0, 0], .003);
  fixed.finish(pivot);
  return { pivot, spin };
}

export function interior(p, m, cabinShift, high) {
  // Interior is genuinely present behind tinted glass, including twin bucket seats.
  p.box([1.37, .14, 1.66], m.interior, [0, .65, -.28 + cabinShift], [0, 0, 0], .05);
  p.box([1.4, .20, .30], m.leather, [0, .98, .40 + cabinShift], [.09, 0, 0], .045);
  p.box([.2, .21, 1.1], m.black, [0, .78, -.12 + cabinShift], [0, 0, 0], .035);
  for (const side of [-1, 1]) {
    const x = side * .4;
    p.box([.43, .11, .47], m.interior, [x, .77, -.26 + cabinShift], [.08, 0, 0], .045);
    p.box([.38, .48, .12], m.interior, [x, 1.00, -.59 + cabinShift], [-.16, 0, 0], .045);
    p.box([.23, .17, .105], m.leather, [x, 1.28, -.64 + cabinShift], [-.13, 0, 0], .035);
    for (const s of [-1, 1]) {
      p.box([.075, .42, .17], m.leather, [x + s * .18, .96, -.55 + cabinShift], [-.16, 0, s * .09], .032);
      p.box([.068, .095, .4], m.leather, [x + s * .18, .81, -.26 + cabinShift], [.08, 0, 0], .02);
      if (high) p.tube([[x + s * .13, .79, -.12 + cabinShift], [x + s * .13, .80, -.43 + cabinShift], [x + s * .135, 1.16, -.58 + cabinShift]], .003, m.seam, 16);
    }
  }
  p.add(new THREE.TorusGeometry(.135, .017, 7, 24), m.leather, [.40, 1.03, .24 + cabinShift], [-.4, 0, 0]);
  p.box([.21, .025, .025], m.chrome, [.4, 1.03, .24 + cabinShift], [-.4, 0, 0], .007);
  p.box([.10, .066, .045], m.black, [.4, 1.02, .24 + cabinShift], [-.4, 0, 0], .012);
  p.box([.24, .125, .015], m.black, [.40, 1.07, .435 + cabinShift], [-.18, 0, 0], .012);
  p.box([.22, .12, .015], m.lens, [.02, 1.08, .42 + cabinShift], [-.18, 0, 0], .012);
}

