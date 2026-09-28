import fs from 'node:fs';

const root = 'public/assets/vehicles/afterlight-concept/my_futuristic_concept_car/';
const gltf = JSON.parse(fs.readFileSync(`${root}scene.gltf`, 'utf8'));
const buffer = fs.readFileSync(`${root}scene.bin`);
const primitive = gltf.meshes[0].primitives[0];
const attribute = gltf.accessors[primitive.attributes.POSITION];
const positionView = gltf.bufferViews[attribute.bufferView];
const indexAccessor = gltf.accessors[primitive.indices];
const indexView = gltf.bufferViews[indexAccessor.bufferView];
const positions = new Float32Array(buffer.buffer, buffer.byteOffset + positionView.byteOffset, attribute.count * 3);
const indices = new Uint32Array(buffer.buffer, buffer.byteOffset + indexView.byteOffset, indexAccessor.count);
const parent = Int32Array.from({ length: attribute.count }, (_, i) => i);
function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
function unite(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
for (let i = 0; i < indices.length; i += 3) { unite(indices[i], indices[i + 1]); unite(indices[i], indices[i + 2]); }
const components = new Map();
for (let i = 0; i < indices.length; i += 3) {
  const root = find(indices[i]);
  let component = components.get(root);
  if (!component) { component = { triangles: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; components.set(root, component); }
  component.triangles++;
  for (let j = 0; j < 3; j++) {
    const vertex = indices[i + j];
    const point = [positions[vertex * 3], -positions[vertex * 3 + 2], positions[vertex * 3 + 1]];
    for (let k = 0; k < 3; k++) { component.min[k] = Math.min(component.min[k], point[k]); component.max[k] = Math.max(component.max[k], point[k]); }
  }
}
const values = [...components.values()].sort((a, b) => b.triangles - a.triangles);
console.log(JSON.stringify({ componentCount: values.length, components: values.filter(value => value.triangles > 50).map(value => ({
  triangles: value.triangles,
  center: value.min.map((min, i) => +((min + value.max[i]) / 2).toFixed(3)),
  size: value.min.map((min, i) => +(value.max[i] - min).toFixed(3)),
})) }, null, 2));
