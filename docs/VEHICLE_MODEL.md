# Original procedural vehicle models

`src/vehicle.js` and `src/premium-vehicle.js` generate five original cars entirely from authored geometry. No manufacturer CAD, ripped game models, or downloaded car assets are used. The module imports Three.js and its MIT-licensed geometry helpers.

## Design

- AURORA GT: long hood, sculpted wheel shoulders, fastback cabin, flush rear lip, silver forged wheels.
- KASUMI R: shorter wheelbase/body, taller compact cabin, champagne wheels, fixed club-sport wing.
- VESPER X: lower cabin shifted forward, wider body, rear intake channels, engine-deck vents and wing.

The original three share a loft vocabulary. NIGHTSLASH and TEMPEST use separate open-cabin deck/shoulder construction with their own proportions, but their dimensions, roofline, stance, vents and aerodynamic elements differ. They are stylized original sports cars, not production-ready automotive CAD.

The body has a continuously sampled crowned upper surface and lower side panels whose boundary is cut around the wheels. Separate curved windshield, roof, rear glass and side glazing preserve cabin depth. Bucket seats, dashboard, steering wheel, console and contrast stitching are present behind the glass.

Near-field detail includes multiple optical blades per headlamp, rear light sculptures, original chevron badges, panel gaps, mirror stalks and optical faces, hood shut lines, wheel-arch trim, intake vanes, side vents, diffuser fins and hollow exhaust tips.

Wheels have lathed crowned tires, bead/sidewall rings, embossed shoulder sipes, forged spokes, rotor discs, drilled-hole geometry, lug nuts, separate calipers and central caps. Rotating parts are grouped separately from steering pivots and fixed calipers.

## New collection

- NIGHTSLASH: 4.38 m heritage coupe, 2.65 m wheelbase, compact roof, four circular projectors and ring tail lamps, six-spoke concave wheels, supported modest wing.
- TEMPEST: 5.02 m muscle coupe, 2.91 m wheelbase, rearward cabin, crowned long hood with vents, three optical cells per headlamp, vertical rear lamps, five-spoke wheels and 355 mm rear tires, integrated lip.
- Canonical specifications live in `src/vehicle-catalog.js`. UI, garage, physics and audio consume this same catalog.
- Shared primitives live in `src/vehicle-primitives.js`. Calipers attach to steering pivots behind the rotating spokes; brake rotors and rims spin together.
- Game collision uses oriented rectangles sized by each model. Cockpit eye/geometry scale and tire smoke locations follow model dimensions.
- Garage simulation figures are generated from the actual physics in `src/vehicle-performance.js`, not manufacturer measurements.
- No external GLB vehicles are used. These original authored procedural models use the existing Three.js MIT geometry tools and existing project environments.

## API

```js
import { CAR_SPECS, createCar, updateCar } from './vehicle.js';
const car = createCar({ model: 'aurora', color: '#e8a64b', detail: 'high' });
updateCar(car, { steer: 0.2, speed: 30, brake: 0, time: elapsed, dt });
```

Coordinates are metres, +Z forward, +Y up, X lateral, ground Y=0. Car origin is the model design reference near the axle midpoint. Speed is m/s. Steering is normalized -1 to 1. Brake is 0 to 1. `userData` exposes `wheels`, `body`, `paint`, `brakeLights`, `spec`, `length`, and `halfWidth`.

Static geometry is merged by material, and material instances are shared throughout a car. Low-detail opponents reduce tessellation and omit tread, drilled holes, lug nuts and stitching. Both versions retain actual curved bodywork, wheel arches, glazing and animated wheels. Environment maps and directional lighting are supplied by the scene; they are essential to showing paint and glass correctly.

Historical three-car geometry checks (before this update): high detail used 45 mesh batches and approximately 92,000–98,000 triangles per car; low detail uses 32 mesh batches and approximately 56,000–62,000 triangles. All three models were instantiated at both detail levels, checked for non-finite vertex positions, and advanced through steering/wheel/brake animation. These counts exclude shadow and transparent-material render passes and are not a measured frame-rate claim.

Do not dispose a single wheel material in isolation: it is shared by other parts of that car. Dispose unique geometry and material objects once when permanently unloading the complete vehicle.

Current validation and limits: see `GARAGE-VALIDATION.md`. These are stylized procedural Demo models, not AAA automotive scan/CAD assets. Cockpit instruments are functional but the interior is simplified.
