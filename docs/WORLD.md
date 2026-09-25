# 金潮海岸 — procedural world

`src/world.js` exports `createWorld(scene, renderer, track)` and returns:

- `update(timeSeconds, dtSeconds)`: ocean waves, slow cloud drift, turbine and boat animation.
- `sunDirection`, `sunLight`: the host should move the shadow light and its target along with the player.
- `roadMesh`, `terrain`, `bridge`, `festival`: scene and terrain references.
- `dispose()`: releases the retained PMREM environment target. Full scene teardown remains the host's responsibility.

The world has exactly one playable route, generated from `track.sample(t)`. No extra race track is created. A roughly 306 m cable-stayed bridge occupies normalized positions 0.78–0.90 on the existing western route. Ocean level is -12 m.

Scenery geometry and surface atlases are original and generated locally. The integrated game uses the bundled CC0 Poly Haven HDR sky (see THIRD_PARTY.md); this module retains a procedural sky fallback. The world includes animated sea, terrain conforming to the road, distant mountains, asphalt aggregate, road paint, segmented curbs, profiled steel barriers, cable bridge, alpha-tested pine needle sprays/trunks, rock clusters, grasses, starting pavilion, lighthouse, villas, turbines and sailing boats.

Static scenery is merged by material and shadow settings. Vegetation and repetitive roadside details are instanced. Rotors, boats and preexisting scene children are excluded from merging. The scene uses a local 2048 px directional shadow map; the camera bounds deliberately cover nearby driving rather than the entire island.

Initial structural check (Node, canvas stubs, sky/PMREM skipped): approximately 1.225 million world triangles, 99 mesh draws before lighting passes, 7,648 instances, no non-finite geometry values. Analytic terrain checks at 1,500 sampled lane locations leave at least 0.81 m beneath the driving surface. These are structural measurements, not measured GPU FPS; the final browser build requires visual and performance verification.

The sky and ocean are lightweight artistic approximations. They do not claim physical volumetric clouds, ray-traced water, photogrammetry or scanned material assets.
