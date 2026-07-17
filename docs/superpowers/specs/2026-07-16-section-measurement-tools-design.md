# Section/Measurement Tools — Design Spec

**Stage:** 3.1 (per `STAGE-3-advanced.md`)
**Status:** approved, ready for planning
**Prerequisite:** Stage 2 complete (tag `stage-2-complete`)

## Goal

Add BVH-accelerated raycasting, click-to-measure distance, and a free-orientation
cross-section clipping plane with a filled cap to the Three.js viewer
(`ThreeViewer` / `ViewerPanel`). Scoped to the `three` viewer engine only — the
classic `model-viewer` engine is unaffected.

## Out of scope

- Multiple saved measurements (only one active two-point measurement at a time).
- Cross-section on the classic `model-viewer` engine.
- Persisting measurement/section state across reloads.

## Architecture

- **`src/viewer/setup-bvh.ts`** (new): patches `THREE.Mesh.prototype.raycast`,
  `BufferGeometry.prototype.computeBoundsTree`/`disposeBoundsTree` from
  `three-mesh-bvh`. Imported once at app bootstrap (module side-effect import).
- **`ThreeViewer`** (existing, extended): owns the Three.js scene and all
  interactive rendering. Gains:
  - BVH bounds tree computed on each STL load, disposed on mesh replacement/unmount.
  - New props: `measureEnabled: boolean`, `sectionEnabled: boolean`.
  - New callback props: `onMeasureChange(state: MeasureState)`,
    `onSectionChange(state: SectionState)`.
  - Internally owns the measurement markers/line, the `TransformControls` gizmo,
    the clipping plane, and the stencil-cap mesh — none of this is exposed to
    the parent beyond the state callbacks.
- **`ViewerPanel`** (existing, extended): owns React state for
  `measureEnabled`/`sectionEnabled`/`measureState`/`sectionState`. Adds two
  toggle buttons to the existing toolbar overlay (visible only when
  `viewerEngine === 'three'`), mutually exclusive (enabling one disables the
  other). Renders the new sidebar.
- **`MeasureSectionSidebar`** (new component): right-docked panel, visible when
  `viewerEngine === 'three'` and either tool is active. Renders measurement
  readout + Clear button, or section readout + offset slider + Reset button.

### Types

```ts
interface MeasureState {
  pointA: [number, number, number] | null;
  pointB: [number, number, number] | null;
  distance: number | null;
}

interface SectionState {
  normal: [number, number, number];
  offset: number; // along normal, range [-radius, +radius]
}
```

## BVH & click-to-measure

1. `setup-bvh.ts` patches prototypes at import time (side-effect only, no exports needed beyond re-export for clarity).
2. After STL parse in `ThreeViewer`, call `geometry.computeBoundsTree()`. Before disposing/replacing the mesh, call `geometry.disposeBoundsTree()`.
3. When `measureEnabled` is true, a `pointerdown`/`pointerup` pair on the renderer canvas distinguishes click-vs-drag (reuse the small-movement-threshold pattern already used in `ViewerPanel` for the axes-widget click detection). A genuine click raycasts (BVH-accelerated) against the mesh:
   - No existing point → set point A, add a small sphere marker.
   - Point A set, no point B → set point B, add marker + connecting `Line`, compute Euclidean distance, call `onMeasureChange`.
   - Both set → clear markers/line, start over from point A with this click.
4. Orbiting (drag) continues to work unchanged while measure mode is on — only non-drag clicks place points, so `OrbitControls` needs no special-casing here.
5. Turning measure mode off clears markers/line and resets `MeasureState` to nulls.

## Cross-section: free-orientation plane + filled cap

1. **Orientation:** a `TransformControls` (three.js addon) in rotate-only mode, attached to an invisible helper `Object3D` positioned at the mesh's bounding-sphere center. The helper's local +Z axis is the plane normal.
2. **Combining with OrbitControls:** on the gizmo's `dragging-changed` event, toggle `OrbitControls.enabled` to prevent the camera from fighting the gizmo drag.
3. **Offset:** a PrimeReact `Slider` in the sidebar, range `[-radius, +radius]` (bounding-sphere radius), moves the plane along its current normal. Chosen over translate handles on the gizmo to avoid visual/interaction clash with the rotate handles and camera orbiting.
4. **Derived plane:** recomputed whenever the gizmo rotates or the slider moves: `normal` = helper's local Z axis in world space; `constant = -normal.dot(origin)` where `origin = sphereCenter + normal * offset`. Assigned to the mesh material's `clippingPlanes` and `renderer.clippingPlanes`; `renderer.localClippingEnabled = true`.
5. **Filled cap (stencil-buffer technique, per three.js's `webgl_clipping_stencil` example):**
   - Main material: `clippingPlanes: [plane]`.
   - Two additional stencil-marking materials (front-face and back-face passes, color writes disabled) increment/decrement the stencil buffer where the plane cuts solid geometry.
   - A `PlaneGeometry` cap mesh, sized to cover the model's cross-section extent (bounding-sphere diameter), positioned/oriented to the derived plane, rendered last with stencil test `equal`/ref `1` and stencil writes disabled. Cap color reuses the model's base material color.
   - Renderer must be created with `stencil: true` (three.js default — verify not disabled).
6. Turning section mode off: remove clipping planes from renderer/material, dispose the gizmo/helper, dispose the cap mesh/materials/stencil materials.

## Sidebar UI

- Docked right, ~200px wide, similar visual weight/styling to `CustomizerPanel`.
- **Measure mode:** Point A / Point B coordinates (X/Y/Z, 2 decimals) as placed; computed distance once both are set; "Clear" button resets `MeasureState`.
- **Section mode:** read-only normal readout (derived from gizmo), offset `Slider`, "Reset plane" button (re-centers helper orientation and zeroes offset).
- Only one tool's controls render at a time, matching the mutually-exclusive toolbar toggles.
- No unit conversion — raw model units, consistent with OpenSCAD's own unitless/mm-by-convention coordinates.

## Testing

- Unit-level: distance calculation (pure function, given two points), plane derivation from gizmo transform + offset (pure function, given quaternion/center/offset).
- Manual/visual verification (per project convention, e.g. `run` skill / dev server):
  - Click on mesh face → point marker appears, sidebar shows coordinates.
  - Second click → distance shown, line drawn between markers.
  - Third click → measurement resets and starts a new one.
  - Section mode: rotating the gizmo tilts the clip plane; slider moves it along the normal; cross-section shows a solid filled cap, not a hollow cut.
  - Toggling engine to `model-viewer` hides both tools and their toolbar buttons/sidebar.
  - Toggling measure/section mutually exclusive in the toolbar.

## Acceptance criteria (subset of Stage 3, relevant to this spec)

- [ ] Click on mesh face shows XYZ coordinates in the UI
- [ ] Two-click distance measurement works for typical part sizes
- [ ] Cross-section slider/gizmo clips the mesh with a filled cap
