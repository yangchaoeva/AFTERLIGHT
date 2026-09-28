# Aurora GT production asset brief

## Decision from the local asset audit

Keep the generated Aurora GT as the playable vehicle while commissioning or authoring a dedicated replacement. The archived Sketchfab concept is visually smoother, but its black two-seat silhouette changes Aurora's identity, and its single mesh and single atlas material do not support the game's independent wheel steering or six paint choices. The existing Green Bug and Blade Air candidates are also stylized sci-fi vehicles with different silhouettes. Triangle count alone is not a sufficient quality gate.

The archived concept contains 36,266 triangles, one mesh, one material, and three 2048 × 2048 textures. Its geometry consists of 485 disconnected components inside the merged mesh; the source does not name or group the wheel parts. The local render is saved at `artifacts/quality-review/concept-asset-preview.png`. Reproduce it by running `npm run dev -- --port 4181` and opening `/scripts/concept-preview.html`; inspect connected components with `node scripts/inspect-concept.mjs`.

## Model handoff

- Preserve Aurora's grand tourer shape and its established sea-salt green default. Use the current car and the fixed garage front, orbit, wheel, and rear camera views as shape references.
- Use metres, +Y up, +Z forward. Match the current 4.61 m overall length, 2.72 m wheelbase, approximately 1.98 m width, and 0.373 m wheel radius. Ground the tires at Y = 0 and center the car on X = 0.
- Export a GLB with separately named body, four wheel pivots and wheel meshes (`front-left`, `front-right`, `rear-left`, `rear-right`), glazing, lamp lenses, interior, and brake components. Wheel pivots must sit on their axle centers and roll around local X; front pivots must also steer around local Y.
- Give paint, glass, rubber, rims, lights, trim, and interior distinct PBR materials. Paint must accept all six current swatches without recoloring windows, tires, or lamps. Keep the source project, texture sources, license or authorship statement, and export settings with the GLB.
- Provide a showroom mesh with rounded panel transitions, inset optical housings, door and hood seams, and a finished underside. Supply a reduced race LOD once the showroom model is accepted; measure actual draw calls, triangles, loading time, and frame time before setting its final budget.

## Integration gate

1. Load the GLB in an opt-in preview, leaving the generated car as fallback. Do not change physics, collision dimensions, or vehicle performance values.
2. Check front, orbit, wheel, and rear garage screenshots at the same camera positions as `scripts/quality-qa.mjs`. Reject visible gaps, floating optics, texture blur, wrong wheel placement, or a silhouette that reads as a different vehicle.
3. Verify steering, rolling, brake lights, headlight modes, paint swatches, model export, thumbnail generation, quick retry, and asset disposal.
4. Compare a two-lap race and garage on medium and native quality against the recorded baseline. Adopt the asset only after visual improvement is clear and the chosen quality preset remains usable on the target machine.
