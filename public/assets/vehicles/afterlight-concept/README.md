# AFTERLIGHT concept vehicle asset

The original Sketchfab download is preserved under `my_futuristic_concept_car/`. It is an inactive visual reference; the game currently renders Aurora GT with its generated model. Its `.bin`, texture, and `license.txt` references remain in that source directory. Do not rename the `.gltf` to `.glb`.

The original source is 36,266 triangles with one merged mesh and one material. The texture set has three 2048 × 2048 PNGs. A local visual review normalized its +Z-forward bounds to the existing Aurora length and grounded its bounding box. The reference is a black futuristic two-seat coupe, substantially different from Aurora GT's established shape.

The source has no independent wheel nodes or dedicated paint, glass, tire, rim, light, trim, or interior materials. `CustomMaterial` uses a shared texture atlas, so imported wheel animation and paint swatches cannot be applied selectively without modifying the source asset or adding a selective mask. See `docs/aurora-asset-brief.md` before considering it for runtime use.
