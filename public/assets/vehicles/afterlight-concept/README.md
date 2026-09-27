# AFTERLIGHT concept vehicle asset

The official Sketchfab download is preserved under `my_futuristic_concept_car/`. The game loads `my_futuristic_concept_car/scene.gltf` directly; its `.bin`, texture, and `license.txt` references remain in that source directory. Do not rename the `.gltf` to `.glb`.

The original source is 36,266 triangles with one merged mesh and one material. The texture set has three 2048 × 2048 PNGs. The adapter scales its +Z-forward bounds to the existing Aurora length and grounds its bounding box. The car has been checked in a running third-person race view.

The source has no independent wheel nodes or dedicated paint, glass, tire, rim, light, trim, or interior materials. `CustomMaterial` uses a shared texture atlas, so this spike preserves its PBR textures and original white paint. Imported wheel animation and paint swatches cannot be applied selectively without modifying the source asset or adding a selective mask.
