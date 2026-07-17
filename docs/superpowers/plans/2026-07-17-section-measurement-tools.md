# Section/Measurement Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BVH-accelerated raycasting, click-to-measure distance, and a free-orientation cross-section clipping plane with a stencil-buffer filled cap to the Three.js viewer engine.

**Architecture:** `ThreeViewer` owns all Three.js scene objects and interaction (BVH bounds trees, measurement markers/line, the `TransformControls` gizmo, the clipping plane, and the stencil-cap meshes) and reports state upward via callback props. `ViewerPanel` owns the React state for both tools and renders a new right-docked `MeasureSectionSidebar`. Both tools are scoped to `viewerEngine === 'three'` only and are mutually exclusive.

**Tech Stack:** React 18, TypeScript, Three.js 0.185, `three-mesh-bvh` (new dependency), PrimeReact (`Slider`, `Button`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-section-measurement-tools-design.md` — implement exactly what it describes; this plan resolves low-level Three.js API details the spec left at a conceptual level (noted inline where it does).
- Scoped to `viewerEngine === 'three'` only; no changes to the `model-viewer` engine path.
- No unit-test infrastructure exists for `src/*.ts` (`jest.config.js` is `preset: "jest-puppeteer"`, `testMatch: ["**/tests/**/*.js"]` — e2e only). Follow the established Stage 2 convention: verify each task by running the dev server and observing behavior in the browser, not by adding a new test harness.
- Dev server: `npm run start:development` (port 4000, matches `tests/e2e.test.js`'s `baseUrl`).
- Raw model units throughout (no unit conversion) — matches OpenSCAD's own unitless/mm-by-convention coordinates.

## Pre-existing bug fixed alongside Task 1

Baseline `npm run test:e2e` on `main` (before this plan's changes) fails 3 of 7 tests with a console
error `"ThreeViewer: STL load error"`. Root cause: `ViewerPanel` always mounts `ThreeViewer` (only
CSS-hides it via `display: none` when `viewerEngine === 'model-viewer'`), so its STL-fetch effect
keeps fetching `state.output?.outFileURL` even while hidden. `src/state/model.ts` (around line 417-432)
revokes the *previous* `outFileURL` blob synchronously as soon as a new render completes; when two
renders land close together (a preview render immediately followed by a final render — the common
case for fast-compiling models), the hidden `ThreeViewer`'s in-flight `fetch()` of the first blob URL
can lose the race against that revocation, producing a generic fetch failure (not an `AbortError`, so
the existing `if ((err as Error).name !== 'AbortError')` guard doesn't suppress it).

Task 1 fixes this by adding an `active` prop that gates the entire STL-fetch/parse/BVH-compute effect —
which also avoids wasting BVH computation on a hidden viewer, directly useful for Task 1's own work.
This does not address the (separate, out-of-scope) theoretical version of the same race if two renders
land close together *while* the Three engine is actively displayed — only the always-mounted-while-hidden
case, which is what the failing tests exercise.

---

### Task 1: BVH setup, bounds-tree wiring, and hidden-viewer STL-fetch fix

**Files:**
- Modify: `package.json` (add `three-mesh-bvh` dependency)
- Create: `src/viewer/setup-bvh.ts`
- Modify: `src/index.tsx:1-11` (add side-effect import)
- Modify: `src/components/ThreeViewer.tsx:19-22,102-145` (add `active` prop, gate the STL-load effect on it, compute/dispose bounds tree)
- Modify: `src/components/ViewerPanel.tsx:314` (pass `active={viewerEngine === 'three'}` to `ThreeViewer`)

**Interfaces:**
- Produces:
  - Importing `../viewer/setup-bvh.ts` anywhere guarantees `THREE.Mesh.prototype.raycast`, `THREE.BufferGeometry.prototype.computeBoundsTree`, and `THREE.BufferGeometry.prototype.disposeBoundsTree` are patched globally. No other task needs to re-patch.
  - `ThreeViewer` prop `active: boolean` (true only when `viewerEngine === 'three'`). Tasks 2-4 don't need to read or pass this themselves — their own toolbar toggles are already only rendered when `viewerEngine === 'three'`, so `measureEnabled`/`sectionEnabled` are never true while `active` is false — but they must preserve this prop when they extend `ThreeViewerProps` in later tasks.

- [ ] **Step 1: Install `three-mesh-bvh`**

```bash
npm install three-mesh-bvh
```

Expected: `package.json` dependencies gain `"three-mesh-bvh": "^0.9.11"` (or whatever version npm resolves), `package-lock.json` updated.

- [ ] **Step 2: Create the BVH setup module**

Create `src/viewer/setup-bvh.ts`:

```ts
import {
  BufferGeometry,
  Mesh,
} from 'three';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';

Mesh.prototype.raycast = acceleratedRaycast;
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
```

- [ ] **Step 3: Import the setup module once at app bootstrap**

In `src/index.tsx`, add near the other early imports (after the existing imports, before `const log = debug('app:log');`):

```ts
import './viewer/setup-bvh.ts';
```

- [ ] **Step 4: Add the `active` prop and gate the STL-load effect on it**

In `src/components/ThreeViewer.tsx`, update the props interface (around line 19-22):

```ts
interface ThreeViewerProps {
  stlUrl: string | null;
  active: boolean;
}
```

Update the component signature to destructure `active`:

```ts
const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(
  ({ stlUrl, active }, ref) => {
```

In the STL-load effect (around line 103-145), add an early return when inactive, right after the existing `if (!stlUrl) return;` line, and add `active` to the dependency array:

```ts
    useEffect(() => {
      if (!stlUrl) return;
      if (!active) return;
      const abort = new AbortController();
```

```ts
      return () => abort.abort();
    }, [stlUrl, active]);
```

- [ ] **Step 5: Compute/dispose the bounds tree on STL load**

In the same effect, after `geometry.computeBoundingSphere();` add:

```ts
          geometry.computeBoundingSphere();
          geometry.computeBoundsTree();
          const sphere = geometry.boundingSphere!;
```

And where the previous mesh is removed, dispose its bounds tree before disposing the geometry:

```ts
          if (meshRef.current) {
            scene.remove(meshRef.current);
            meshRef.current.geometry.disposeBoundsTree();
            meshRef.current.geometry.dispose();
          }
```

- [ ] **Step 6: Pass `active` from `ViewerPanel`**

In `src/components/ViewerPanel.tsx`, update the `ThreeViewer` render (around line 314):

```tsx
        <ThreeViewer
          ref={threeViewerRef}
          stlUrl={state.output?.outFileURL ?? null}
          active={viewerEngine === 'three'}
        />
```

- [ ] **Step 7: Verify the fix and no regressions**

Run: `npm run start:development`, open `http://localhost:4000/`.
- Confirm the default model still loads in the classic (`model-viewer`) engine, with no console errors.
- Click the "Three.js" toggle button in the viewer toolbar to switch engines; confirm the STL still renders correctly with no new console errors.
- Switch back to the classic engine, then edit the source to trigger a fresh render (e.g. change `cube(10)` to `cube(15)`); confirm no `"ThreeViewer: STL load error"` appears in the console while the Three engine is inactive.

Run the e2e baseline suite to confirm the pre-existing failures are gone:

```bash
npm run test:e2e
```

Expected: `Tests: 7 passed, 7 total` (up from the pre-Task-1 baseline of 4 passed, 3 failed — see "Pre-existing bug fixed alongside Task 1" above). If a port-4000 process is already listening from a previous run, stop it first (`lsof -i :4000` to find the PID, `kill` it) — otherwise the test run hangs on an interactive prompt instead of starting its own dev server.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/viewer/setup-bvh.ts src/index.tsx src/components/ThreeViewer.tsx src/components/ViewerPanel.tsx
git commit -m "feat: add BVH-accelerated raycasting via three-mesh-bvh

Also fixes a pre-existing blob-URL revocation race: ThreeViewer stayed
mounted (CSS-hidden) even when the classic engine was active, and kept
fetching STL blobs that model.ts had already revoked."
```

---

### Task 2: Click-to-measure distance

**Files:**
- Create: `src/viewer/section-measure-types.ts`
- Create: `src/components/MeasureSectionSidebar.tsx`
- Modify: `src/components/ThreeViewer.tsx` (measure props, click-vs-drag detection, raycast, markers/line)
- Modify: `src/components/ViewerPanel.tsx` (measure toggle state, toolbar button, sidebar rendering)

**Interfaces:**
- Consumes: `geometry.computeBoundsTree()`/`disposeBoundsTree()` and the patched `Mesh.prototype.raycast` from Task 1 (used transparently by `Raycaster.intersectObject`).
- Produces:
  - `MeasureState` type (from `section-measure-types.ts`), consumed by Task 3/4 unchanged.
  - `ThreeViewer` props `measureEnabled: boolean`, `onMeasureChange: (state: MeasureState) => void`.
  - `MeasureSectionSidebar` component with props `measureEnabled: boolean`, `measureState: MeasureState`, `onClearMeasure: () => void`, `sectionEnabled: boolean` (unused by this component until Task 3, but included now so `ViewerPanel` doesn't need to touch this file's prop signature twice — Task 3 adds the section-specific props alongside it).

- [ ] **Step 1: Create the shared types module**

Create `src/viewer/section-measure-types.ts`:

```ts
export interface MeasureState {
  pointA: [number, number, number] | null;
  pointB: [number, number, number] | null;
  distance: number | null;
}

export const EMPTY_MEASURE_STATE: MeasureState = {
  pointA: null,
  pointB: null,
  distance: null,
};

export interface SectionState {
  normal: [number, number, number];
  offset: number;
}

export const DEFAULT_SECTION_STATE: SectionState = {
  normal: [0, 1, 0],
  offset: 0,
};
```

- [ ] **Step 2: Add measure props, markers, and click detection to `ThreeViewer`**

In `src/components/ThreeViewer.tsx`, update imports (add to the existing `three` import list and add two new imports):

```ts
import {
  AmbientLight,
  DirectionalLight,
  Line,
  LineBasicMaterial,
  BufferGeometry as ThreeBufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MeasureState, EMPTY_MEASURE_STATE } from '../viewer/section-measure-types';
```

Note: `BufferGeometry` is aliased to `ThreeBufferGeometry` only if needed to avoid a name clash — in this file there is no existing `BufferGeometry` import, so the plain name `BufferGeometry` is fine; use that instead of the alias. Import as:

```ts
import {
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MeasureState, EMPTY_MEASURE_STATE } from '../viewer/section-measure-types';
```

Update the props interface:

```ts
interface ThreeViewerProps {
  stlUrl: string | null;
  active: boolean;
  measureEnabled: boolean;
  onMeasureChange: (state: MeasureState) => void;
}
```

Update the component signature and add refs (alongside the existing refs, e.g. after `materialRef`):

```ts
const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(
  ({ stlUrl, active, measureEnabled, onMeasureChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null);
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<Mesh | null>(null);
    const materialRef = useRef<MeshStandardMaterial | null>(null);
    const animFrameRef = useRef<number>(0);

    const measureEnabledRef = useRef(measureEnabled);
    useEffect(() => { measureEnabledRef.current = measureEnabled; }, [measureEnabled]);
    const onMeasureChangeRef = useRef(onMeasureChange);
    useEffect(() => { onMeasureChangeRef.current = onMeasureChange; }, [onMeasureChange]);

    const measureStateRef = useRef<MeasureState>(EMPTY_MEASURE_STATE);
    const markerARef = useRef<Mesh | null>(null);
    const markerBRef = useRef<Mesh | null>(null);
    const measureLineRef = useRef<Line | null>(null);
```

Clear measurement markers whenever `measureEnabled` toggles off (add a new effect near the other prop-driven effects):

```ts
    useEffect(() => {
      if (measureEnabled) return;
      const scene = sceneRef.current;
      if (scene) {
        if (markerARef.current) { scene.remove(markerARef.current); markerARef.current = null; }
        if (markerBRef.current) { scene.remove(markerBRef.current); markerBRef.current = null; }
        if (measureLineRef.current) { scene.remove(measureLineRef.current); measureLineRef.current = null; }
      }
      measureStateRef.current = EMPTY_MEASURE_STATE;
      onMeasureChangeRef.current(EMPTY_MEASURE_STATE);
    }, [measureEnabled]);
```

In the mount-once effect (`useEffect(() => { ... }, [])`), after `controlsRef.current = controls;` and before the `animate` function, add the raycaster, click-vs-drag tracking, and the measurement click handler:

```ts
      const raycaster = new Raycaster();
      const markerGeometry = new SphereGeometry(1, 12, 8); // scaled per-marker below
      let pointerDownPos: { x: number; y: number } | null = null;

      function placeMarker(color: number, point: Vector3): Mesh {
        const radius = (meshRef.current?.geometry.boundingSphere?.radius ?? 1) * 0.02;
        const marker = new Mesh(markerGeometry, new MeshBasicMaterial({ color }));
        marker.scale.setScalar(radius);
        marker.position.copy(point);
        scene.add(marker);
        return marker;
      }

      function handleMeasureClick(clientX: number, clientY: number) {
        if (!measureEnabledRef.current || !meshRef.current) return;

        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(meshRef.current, false);
        if (hits.length === 0) return;
        const point = hits[0].point.clone();

        const current = measureStateRef.current;
        if (current.pointA === null) {
          if (markerARef.current) { scene.remove(markerARef.current); markerARef.current = null; }
          if (markerBRef.current) { scene.remove(markerBRef.current); markerBRef.current = null; }
          if (measureLineRef.current) { scene.remove(measureLineRef.current); measureLineRef.current = null; }

          markerARef.current = placeMarker(0x00ffff, point);
          const next: MeasureState = { pointA: point.toArray() as [number, number, number], pointB: null, distance: null };
          measureStateRef.current = next;
          onMeasureChangeRef.current(next);
        } else if (current.pointB === null) {
          markerBRef.current = placeMarker(0xff00ff, point);
          const a = new Vector3(...current.pointA);
          const distance = a.distanceTo(point);
          const lineGeometry = new BufferGeometry().setFromPoints([a, point]);
          const line = new Line(lineGeometry, new LineBasicMaterial({ color: 0xffffff }));
          scene.add(line);
          measureLineRef.current = line;

          const next: MeasureState = { pointA: current.pointA, pointB: point.toArray() as [number, number, number], distance };
          measureStateRef.current = next;
          onMeasureChangeRef.current(next);
        } else {
          if (markerARef.current) { scene.remove(markerARef.current); markerARef.current = null; }
          if (markerBRef.current) { scene.remove(markerBRef.current); markerBRef.current = null; }
          if (measureLineRef.current) { scene.remove(measureLineRef.current); measureLineRef.current = null; }

          markerARef.current = placeMarker(0x00ffff, point);
          const next: MeasureState = { pointA: point.toArray() as [number, number, number], pointB: null, distance: null };
          measureStateRef.current = next;
          onMeasureChangeRef.current(next);
        }
      }

      function onCanvasPointerDown(e: PointerEvent) {
        pointerDownPos = { x: e.clientX, y: e.clientY };
      }
      function onCanvasPointerUp(e: PointerEvent) {
        if (!pointerDownPos) return;
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        pointerDownPos = null;
        if (Math.hypot(dx, dy) > 5) return; // drag, not a click
        handleMeasureClick(e.clientX, e.clientY);
      }
      renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);
```

Add cleanup for these two listeners in the same effect's return function (alongside the existing `ro.disconnect()` etc.):

```ts
      return () => {
        cancelAnimationFrame(animFrameRef.current);
        ro.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
        renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
        controls.dispose();
        material.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
```

- [ ] **Step 3: Add the sidebar component (measure section only for now)**

Create `src/components/MeasureSectionSidebar.tsx`:

```tsx
import { Button } from 'primereact/button';
import { MeasureState } from '../viewer/section-measure-types';

interface MeasureSectionSidebarProps {
  measureEnabled: boolean;
  measureState: MeasureState;
  onClearMeasure: () => void;
}

function formatPoint(p: [number, number, number] | null): string {
  if (!p) return '—';
  return `${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)}`;
}

export default function MeasureSectionSidebar({
  measureEnabled,
  measureState,
  onClearMeasure,
}: MeasureSectionSidebarProps) {
  if (!measureEnabled) return null;

  return (
    <div style={{
      width: '200px',
      padding: '10px',
      overflow: 'auto',
      borderLeft: '1px solid rgba(128,128,128,0.3)',
      fontSize: '12px',
    }}>
      <h4 style={{ marginTop: 0 }}>Measure</h4>
      <div>Point A: {formatPoint(measureState.pointA)}</div>
      <div>Point B: {formatPoint(measureState.pointB)}</div>
      <div>Distance: {measureState.distance !== null ? measureState.distance.toFixed(3) : '—'}</div>
      <Button
        label="Clear"
        className="p-button-text p-button-sm"
        style={{ marginTop: '8px' }}
        onClick={onClearMeasure}
      />
    </div>
  );
}
```

- [ ] **Step 4: Wire measure mode into `ViewerPanel`**

In `src/components/ViewerPanel.tsx`:

Add imports:

```ts
import MeasureSectionSidebar from './MeasureSectionSidebar';
import { MeasureState, EMPTY_MEASURE_STATE } from '../viewer/section-measure-types';
```

Add state (alongside the existing `viewerEngine`/`threeViewerRef` state, around line 64-65):

```ts
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measureState, setMeasureState] = useState<MeasureState>(EMPTY_MEASURE_STATE);
```

Add a toolbar toggle button, in the toolbar `div` (after the existing engine-toggle button, before the toolbar `div`'s closing tag, around line 224-225) — only when the engine is `'three'`:

```tsx
        {viewerEngine === 'three' && (
          <button
            onClick={() => setMeasureEnabled(e => !e)}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              cursor: 'pointer',
              pointerEvents: 'all',
              fontWeight: measureEnabled ? 'bold' : 'normal',
            }}
            title="Toggle measure mode"
          >
            Measure
          </button>
        )}
```

Update the `ThreeViewer` render (around line 314) to pass the new props:

```tsx
        <ThreeViewer
          ref={threeViewerRef}
          stlUrl={state.output?.outFileURL ?? null}
          active={viewerEngine === 'three'}
          measureEnabled={measureEnabled}
          onMeasureChange={setMeasureState}
        />
```

Render the sidebar as a sibling of the main flex container's children — change the outermost returned `div` to a flex row wrapping the existing content plus the sidebar. Replace the component's `return (...)` block's outer structure: keep everything currently inside the top-level `div` as an inner wrapper `div` with `flex: 1`, and add the sidebar next to it:

```tsx
  return (
    <div className={className}
          style={{
              display: 'flex',
              flexDirection: 'row',
              position: 'relative',
              flex: 1,
              width: '100%',
              ...(style ?? {})
          }}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', flex: 1 }}>
        {/* ... all existing JSX that was previously the outer div's children stays here unchanged ... */}
      </div>
      {viewerEngine === 'three' && (
        <MeasureSectionSidebar
          measureEnabled={measureEnabled}
          measureState={measureState}
          onClearMeasure={() => setMeasureState(EMPTY_MEASURE_STATE)}
        />
      )}
    </div>
  );
```

- [ ] **Step 5: Manual verification**

Run: `npm run start:development`, open `http://localhost:4000/#src=cube(%5B20%2C20%2C20%5D)%3B`.
- Switch to the Three.js engine.
- Click "Measure" in the toolbar (button text becomes bold).
- Click one face of the cube → a cyan marker appears, sidebar shows "Point A" coordinates.
- Click a different face → a magenta marker appears, a white line connects the two markers, sidebar shows "Point B" and a "Distance" value.
- Click a third time → markers/line reset, a new Point A is placed.
- Click "Clear" → sidebar resets to "—" placeholders and markers disappear.
- Toggle "Measure" off → sidebar disappears, markers/line disappear, orbiting still works normally.
- No new console errors.

- [ ] **Step 6: Commit**

```bash
git add src/viewer/section-measure-types.ts src/components/MeasureSectionSidebar.tsx src/components/ThreeViewer.tsx src/components/ViewerPanel.tsx
git commit -m "feat: add click-to-measure distance tool to Three.js viewer"
```

---

### Task 3: Cross-section clipping plane (gizmo + slider, no cap yet)

**Files:**
- Modify: `src/components/ThreeViewer.tsx` (section props, `TransformControls`, plane derivation, mesh clipping)
- Modify: `src/components/MeasureSectionSidebar.tsx` (add section UI)
- Modify: `src/components/ViewerPanel.tsx` (section toggle state, mutual exclusion, wiring)

**Interfaces:**
- Consumes: `SectionState`/`DEFAULT_SECTION_STATE` from `section-measure-types.ts` (Task 2).
- Produces:
  - `ThreeViewer` props `sectionEnabled: boolean`, `sectionOffset: number`, `onSectionChange: (state: SectionState) => void`.
  - `MeasureSectionSidebar` props `sectionEnabled: boolean`, `sectionState: SectionState`, `onSectionOffsetChange: (offset: number) => void`, `onResetSection: () => void`.
  - The mesh's shared `MeshStandardMaterial` (`materialRef.current`) gets a `clippingPlanes` array that Task 4's stencil-cap objects read the same `Plane` instance from — Task 4 must reuse the exact `Plane` object created here (stored in a ref: `sectionPlaneRef.current: Plane | null`), not recompute it independently.

- [ ] **Step 1: Add section props, gizmo, and plane derivation to `ThreeViewer`**

Update the `three` import to add `Plane`, `Quaternion`, `Object3D`:

```ts
import {
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { MeasureState, EMPTY_MEASURE_STATE, SectionState, DEFAULT_SECTION_STATE } from '../viewer/section-measure-types';
```

Update the props interface:

```ts
interface ThreeViewerProps {
  stlUrl: string | null;
  active: boolean;
  measureEnabled: boolean;
  onMeasureChange: (state: MeasureState) => void;
  sectionEnabled: boolean;
  sectionOffset: number;
  onSectionChange: (state: SectionState) => void;
}
```

Update the component signature and add refs:

```ts
const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(
  ({ stlUrl, active, measureEnabled, onMeasureChange, sectionEnabled, sectionOffset, onSectionChange }, ref) => {
    // ...existing refs from Task 1/2...
    const sectionEnabledRef = useRef(sectionEnabled);
    useEffect(() => { sectionEnabledRef.current = sectionEnabled; }, [sectionEnabled]);
    const sectionOffsetRef = useRef(sectionOffset);
    useEffect(() => { sectionOffsetRef.current = sectionOffset; }, [sectionOffset]);
    const onSectionChangeRef = useRef(onSectionChange);
    useEffect(() => { onSectionChangeRef.current = onSectionChange; }, [onSectionChange]);

    const sectionHelperRef = useRef<Object3D | null>(null);
    const transformControlsRef = useRef<TransformControls | null>(null);
    const sectionPlaneRef = useRef<Plane | null>(null);
    const updatePlaneFromGizmoRef = useRef<() => void>(() => {});
```

`updatePlaneFromGizmoRef` exists so the effect that reacts to `sectionEnabled`/`sectionOffset` changes (added later in this task) can invoke the mount-effect-local `updatePlaneFromGizmo` function without re-running the whole mount effect.

In the mount-once effect, after the measurement raycaster/click-handling code from Task 2, add the section-mode setup:

```ts
      const sectionHelper = new Object3D();
      sectionHelperRef.current = sectionHelper;

      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.setMode('rotate');
      transformControlsRef.current = transformControls;
      transformControls.addEventListener('dragging-changed', (event) => {
        controls.enabled = !(event as any).value;
      });

      function updatePlaneFromGizmo() {
        const sphere = meshRef.current?.geometry.boundingSphere;
        if (!sphere) return;
        const normal = new Vector3(0, 0, 1).applyQuaternion(sectionHelper.quaternion).normalize();
        const origin = sphere.center.clone().addScaledVector(normal, sectionOffsetRef.current);
        const plane = sectionPlaneRef.current ?? new Plane();
        plane.setFromNormalAndCoplanarPoint(normal, origin);
        sectionPlaneRef.current = plane;
        materialRef.current!.clippingPlanes = sectionEnabledRef.current ? [plane] : [];
        onSectionChangeRef.current({
          normal: [normal.x, normal.y, normal.z],
          offset: sectionOffsetRef.current,
        });
      }
      updatePlaneFromGizmoRef.current = updatePlaneFromGizmo;
      transformControls.addEventListener('change', updatePlaneFromGizmo);
```

Add cleanup for the gizmo in the mount effect's return function:

```ts
      return () => {
        cancelAnimationFrame(animFrameRef.current);
        ro.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
        renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
        transformControls.dispose();
        controls.dispose();
        material.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
```

Add a new effect (outside the mount-once effect) that adds/removes the gizmo helper from the scene and attaches/detaches it when `sectionEnabled` changes:

```ts
    useEffect(() => {
      const scene = sceneRef.current;
      const helper = sectionHelperRef.current;
      const transformControls = transformControlsRef.current;
      if (!scene || !helper || !transformControls) return;

      if (sectionEnabled) {
        const sphere = meshRef.current?.geometry.boundingSphere;
        helper.position.copy(sphere ? sphere.center : new Vector3());
        helper.quaternion.identity();
        scene.add(helper);
        scene.add(transformControls.getHelper());
        transformControls.attach(helper);
        updatePlaneFromGizmoRef.current();
      } else {
        transformControls.detach();
        scene.remove(transformControls.getHelper());
        scene.remove(helper);
        materialRef.current!.clippingPlanes = [];
      }
    }, [sectionEnabled]);

    useEffect(() => {
      if (!sectionEnabled) return;
      updatePlaneFromGizmoRef.current();
    }, [sectionEnabled, sectionOffset]);
```

Also update `renderer.localClippingEnabled = true;` once, right after the `WebGLRenderer` is constructed in the mount effect:

```ts
      const renderer = new WebGLRenderer({ antialias: true, stencil: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(w, h);
      renderer.setClearColor(0x1e1e1e);
      renderer.localClippingEnabled = true;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
```

- [ ] **Step 2: Add section UI to the sidebar**

Update `src/components/MeasureSectionSidebar.tsx`:

```tsx
import { Button } from 'primereact/button';
import { Slider } from 'primereact/slider';
import { MeasureState, SectionState } from '../viewer/section-measure-types';

interface MeasureSectionSidebarProps {
  measureEnabled: boolean;
  measureState: MeasureState;
  onClearMeasure: () => void;
  sectionEnabled: boolean;
  sectionState: SectionState;
  sectionRadius: number;
  onSectionOffsetChange: (offset: number) => void;
  onResetSection: () => void;
}

function formatPoint(p: [number, number, number] | null): string {
  if (!p) return '—';
  return `${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)}`;
}

export default function MeasureSectionSidebar({
  measureEnabled,
  measureState,
  onClearMeasure,
  sectionEnabled,
  sectionState,
  sectionRadius,
  onSectionOffsetChange,
  onResetSection,
}: MeasureSectionSidebarProps) {
  if (!measureEnabled && !sectionEnabled) return null;

  return (
    <div style={{
      width: '200px',
      padding: '10px',
      overflow: 'auto',
      borderLeft: '1px solid rgba(128,128,128,0.3)',
      fontSize: '12px',
    }}>
      {measureEnabled && (
        <>
          <h4 style={{ marginTop: 0 }}>Measure</h4>
          <div>Point A: {formatPoint(measureState.pointA)}</div>
          <div>Point B: {formatPoint(measureState.pointB)}</div>
          <div>Distance: {measureState.distance !== null ? measureState.distance.toFixed(3) : '—'}</div>
          <Button
            label="Clear"
            className="p-button-text p-button-sm"
            style={{ marginTop: '8px' }}
            onClick={onClearMeasure}
          />
        </>
      )}
      {sectionEnabled && (
        <>
          <h4 style={{ marginTop: 0 }}>Section</h4>
          <div>Normal: {formatPoint(sectionState.normal)}</div>
          <div style={{ margin: '10px 0' }}>
            <div>Offset: {sectionState.offset.toFixed(2)}</div>
            <Slider
              style={{ marginTop: '6px' }}
              value={sectionState.offset}
              min={-sectionRadius}
              max={sectionRadius}
              step={sectionRadius / 100}
              onChange={(e) => onSectionOffsetChange(e.value as number)}
            />
          </div>
          <Button
            label="Reset plane"
            className="p-button-text p-button-sm"
            onClick={onResetSection}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire section mode into `ViewerPanel`, mutually exclusive with measure**

In `src/components/ViewerPanel.tsx`, update the import:

```ts
import { MeasureState, EMPTY_MEASURE_STATE, SectionState, DEFAULT_SECTION_STATE } from '../viewer/section-measure-types';
```

Add state alongside `measureEnabled`/`measureState`:

```ts
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionState, setSectionState] = useState<SectionState>(DEFAULT_SECTION_STATE);
  const [sectionRadius, setSectionRadius] = useState(1);
```

Replace the `measureEnabled` setter calls so the two tools are mutually exclusive — change the "Measure" button's `onClick` to:

```tsx
            onClick={() => {
              setMeasureEnabled(e => {
                const next = !e;
                if (next) setSectionEnabled(false);
                return next;
              });
            }}
```

Add a "Section" toggle button right after the "Measure" button:

```tsx
        {viewerEngine === 'three' && (
          <button
            onClick={() => {
              setSectionEnabled(e => {
                const next = !e;
                if (next) setMeasureEnabled(false);
                return next;
              });
            }}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              cursor: 'pointer',
              pointerEvents: 'all',
              fontWeight: sectionEnabled ? 'bold' : 'normal',
            }}
            title="Toggle cross-section mode"
          >
            Section
          </button>
        )}
```

`ThreeViewer` doesn't currently report the mesh's bounding-sphere radius to the parent, but the sidebar's slider needs it as its min/max range. Add a fourth callback prop, `onBoundingSphereChange: (radius: number) => void`, fired from the STL-load effect in `ThreeViewer` (the effect Task 1 added `active`/BVH handling to) right after `const sphere = geometry.boundingSphere!;`:

In `ThreeViewer.tsx`, add to the props interface (alongside `onSectionChange` in the block updated above):

```ts
  onBoundingSphereChange: (radius: number) => void;
```

And in the STL-load effect:

```ts
          const sphere = geometry.boundingSphere!;
          onBoundingSphereChangeRef.current(sphere.radius);
```

(add the matching `onBoundingSphereChangeRef` ref + its sync effect alongside the other callback refs from Tasks 1-3.)

Back in `ViewerPanel.tsx`, update the `ThreeViewer` render (the block Task 2 added `onMeasureChange` to) to its final form for this task:

```tsx
        <ThreeViewer
          ref={threeViewerRef}
          stlUrl={state.output?.outFileURL ?? null}
          active={viewerEngine === 'three'}
          measureEnabled={measureEnabled}
          onMeasureChange={setMeasureState}
          sectionEnabled={sectionEnabled}
          sectionOffset={sectionState.offset}
          onSectionChange={setSectionState}
          onBoundingSphereChange={setSectionRadius}
        />
```

```tsx
      {viewerEngine === 'three' && (
        <MeasureSectionSidebar
          measureEnabled={measureEnabled}
          measureState={measureState}
          onClearMeasure={() => setMeasureState(EMPTY_MEASURE_STATE)}
          sectionEnabled={sectionEnabled}
          sectionState={sectionState}
          sectionRadius={sectionRadius}
          onSectionOffsetChange={(offset) => setSectionState(s => ({ ...s, offset }))}
          onResetSection={() => setSectionState(DEFAULT_SECTION_STATE)}
        />
      )}
```

- [ ] **Step 4: Manual verification**

Run: `npm run start:development`, open `http://localhost:4000/#src=cube(%5B20%2C20%2C20%5D)%3B`, switch to Three.js engine.
- Click "Section" → a rotation gizmo (three colored rings) appears at the cube's center; "Measure" is not simultaneously active.
- Drag one of the gizmo's rings → the cube visibly clips (hollow cut) along the tilted plane; sidebar's "Normal" readout updates.
- Move the sidebar's offset slider → the clip plane slides along its normal.
- Click "Reset plane" → gizmo returns to identity orientation, offset returns to 0, full cube reappears (still clipped by the identity plane if offset is 0 and plane passes through center — confirm it clips half the cube, not the whole thing).
- Click "Measure" → "Section" turns off, gizmo disappears, clipping plane is removed (full cube shown).
- No new console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ThreeViewer.tsx src/components/MeasureSectionSidebar.tsx src/components/ViewerPanel.tsx
git commit -m "feat: add free-orientation cross-section clipping plane"
```

---

### Task 4: Stencil-buffer filled cap

**Files:**
- Modify: `src/components/ThreeViewer.tsx` (stencil-marking meshes, cap mesh, rebuild-on-STL-reload)

**Interfaces:**
- Consumes: `sectionPlaneRef.current` (the `Plane` instance from Task 3 — reused, not recomputed), `meshRef.current!.geometry` (rebuilt whenever a new STL loads).

**Implementation note (deviates from the spec's literal wording in a compatible way):** the spec says the derived plane is "assigned to the mesh material's `clippingPlanes` and `renderer.clippingPlanes`". In practice, only setting it on `materialRef.current!.clippingPlanes` (done in Task 3) is correct and sufficient — `renderer.clippingPlanes` is a *global* list applied to every material in the scene, which would also incorrectly clip the stencil-marking meshes and the cap mesh below (they must render the mesh's *full, unclipped* geometry to compute correct stencil coverage). This task does not touch `renderer.clippingPlanes`; it stays empty. `renderer.localClippingEnabled = true` (already set in Task 3) is what makes per-material `clippingPlanes` work.

**Technique:** classic single-plane stencil cap (the single-plane case of three.js's clipping+stencil example, simplified because there is only one plane so there are no "other planes" to additionally respect):
1. Render the (already-clipped) main mesh normally — this leaves a hollow cut.
2. Render the mesh's **back faces**, full unclipped geometry, color/depth writes off, incrementing the stencil buffer wherever they pass the depth test.
3. Render the mesh's **front faces**, same, decrementing the stencil buffer.
4. Net stencil value is non-zero exactly where the plane passes through solid interior. Render a cap `PlaneGeometry` there (`stencilFunc: NotEqualStencilFunc`, ref `0`), replacing the stencil back to `0` as it draws, with `depthTest: false` (safe simplification — the scene contains only this one mesh, so there's no other geometry to depth-composite the cap against).

- [ ] **Step 1: Add the stencil-marking and cap meshes**

Update the `three` import to add the stencil-related constants and `PlaneGeometry`:

```ts
import {
  AmbientLight,
  AlwaysStencilFunc,
  BackSide,
  BufferGeometry,
  DecrementWrapStencilOp,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  IncrementWrapStencilOp,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  ReplaceStencilOp,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
```

Add refs for the three extra scene objects and three callable-function refs (alongside `sectionPlaneRef`/`updatePlaneFromGizmoRef`):

```ts
    const stencilBackMeshRef = useRef<Mesh | null>(null);
    const stencilFrontMeshRef = useRef<Mesh | null>(null);
    const capMeshRef = useRef<Mesh | null>(null);
    const rebuildSectionCapRef = useRef<() => void>(() => {});
    const disposeSectionCapRef = useRef<() => void>(() => {});
    const positionCapMeshRef = useRef<() => void>(() => {});
```

Add a `rebuildSectionCap()` function, defined in the mount-once effect (near `updatePlaneFromGizmo`), that (re)builds the three stencil objects from the current mesh geometry:

```ts
      function disposeSectionCap() {
        // (defined before rebuildSectionCap since rebuildSectionCap calls it)
        if (stencilBackMeshRef.current) {
          scene.remove(stencilBackMeshRef.current);
          (stencilBackMeshRef.current.material as MeshBasicMaterial).dispose();
          stencilBackMeshRef.current = null;
        }
        if (stencilFrontMeshRef.current) {
          scene.remove(stencilFrontMeshRef.current);
          (stencilFrontMeshRef.current.material as MeshBasicMaterial).dispose();
          stencilFrontMeshRef.current = null;
        }
        if (capMeshRef.current) {
          scene.remove(capMeshRef.current);
          capMeshRef.current.geometry.dispose();
          (capMeshRef.current.material as MeshBasicMaterial).dispose();
          capMeshRef.current = null;
        }
      }
      disposeSectionCapRef.current = disposeSectionCap;

      function rebuildSectionCap() {
        disposeSectionCap();
        if (!sectionEnabledRef.current || !meshRef.current) return;

        const geometry = meshRef.current.geometry;
        const sphere = geometry.boundingSphere!;

        const backMat = new MeshBasicMaterial({
          colorWrite: false,
          depthWrite: false,
          stencilWrite: true,
          side: BackSide,
          stencilFunc: AlwaysStencilFunc,
          stencilFail: IncrementWrapStencilOp,
          stencilZFail: IncrementWrapStencilOp,
          stencilZPass: IncrementWrapStencilOp,
        });
        const backMesh = new Mesh(geometry, backMat);
        backMesh.renderOrder = 1;
        scene.add(backMesh);
        stencilBackMeshRef.current = backMesh;

        const frontMat = new MeshBasicMaterial({
          colorWrite: false,
          depthWrite: false,
          stencilWrite: true,
          side: FrontSide,
          stencilFunc: AlwaysStencilFunc,
          stencilFail: DecrementWrapStencilOp,
          stencilZFail: DecrementWrapStencilOp,
          stencilZPass: DecrementWrapStencilOp,
        });
        const frontMesh = new Mesh(geometry, frontMat);
        frontMesh.renderOrder = 2;
        scene.add(frontMesh);
        stencilFrontMeshRef.current = frontMesh;

        const capSize = sphere.radius * 2.5;
        const capMat = new MeshBasicMaterial({
          color: materialRef.current!.color,
          side: DoubleSide,
          depthTest: false,
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: NotEqualStencilFunc,
          stencilFail: ReplaceStencilOp,
          stencilZFail: ReplaceStencilOp,
          stencilZPass: ReplaceStencilOp,
        });
        const capMesh = new Mesh(new PlaneGeometry(capSize, capSize), capMat);
        capMesh.renderOrder = 3;
        capMesh.onAfterRender = (r) => r.clearStencil();
        scene.add(capMesh);
        capMeshRef.current = capMesh;

        positionCapMeshRef.current();
      }
      rebuildSectionCapRef.current = rebuildSectionCap;

      function positionCapMesh() {
        const plane = sectionPlaneRef.current;
        const capMesh = capMeshRef.current;
        if (!plane || !capMesh) return;
        const normal = plane.normal;
        const origin = normal.clone().multiplyScalar(-plane.constant);
        capMesh.position.copy(origin);
        capMesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal);
      }
      positionCapMeshRef.current = positionCapMesh;
```

Note `rebuildSectionCap` calls `positionCapMeshRef.current()` at its end, and `positionCapMeshRef.current` is assigned to the real `positionCapMesh` function a few lines later in the same effect — this is safe because `rebuildSectionCap` is only ever *invoked* later (from the `sectionEnabled` effect or the STL-load effect below), by which point the mount effect has finished running top-to-bottom and all three ref assignments (`disposeSectionCapRef`, `rebuildSectionCapRef`, `positionCapMeshRef`) are in place.

- [ ] **Step 2: Call `rebuildSectionCap`/`positionCapMesh` at the right times**

In the `sectionEnabled`-driven effect from Task 3, after `updatePlaneFromGizmoRef.current();` in the `if (sectionEnabled)` branch, add:

```ts
        rebuildSectionCapRef.current();
```

And in the `else` branch (section mode turning off), add `disposeSectionCapRef.current();` right after `materialRef.current!.clippingPlanes = [];` so the full effect body reads:

```ts
    useEffect(() => {
      const scene = sceneRef.current;
      const helper = sectionHelperRef.current;
      const transformControls = transformControlsRef.current;
      if (!scene || !helper || !transformControls) return;

      if (sectionEnabled) {
        const sphere = meshRef.current?.geometry.boundingSphere;
        helper.position.copy(sphere ? sphere.center : new Vector3());
        helper.quaternion.identity();
        scene.add(helper);
        scene.add(transformControls.getHelper());
        transformControls.attach(helper);
        updatePlaneFromGizmoRef.current();
        rebuildSectionCapRef.current();
      } else {
        transformControls.detach();
        scene.remove(transformControls.getHelper());
        scene.remove(helper);
        materialRef.current!.clippingPlanes = [];
        disposeSectionCapRef.current();
      }
    }, [sectionEnabled]);
```

Update `updatePlaneFromGizmo` (Task 3) to reposition the cap whenever the plane changes — at the end of that function (right after `onSectionChangeRef.current({...});`), add:

```ts
        positionCapMeshRef.current();
```

In the STL-load effect (Task 1/2), after the new mesh is added to the scene and its bounds tree computed, rebuild the cap if section mode is currently active:

```ts
          const mesh = new Mesh(geometry, materialRef.current!);
          scene.add(mesh);
          meshRef.current = mesh;

          if (sectionEnabledRef.current) {
            rebuildSectionCapRef.current();
          }
```

- [ ] **Step 3: Manual verification**

Run: `npm run start:development`, open `http://localhost:4000/#src=cube(%5B20%2C20%2C20%5D)%3B`, switch to Three.js engine.
- Click "Section" → gizmo appears, cross-section is now a **solid orange fill** at the cut plane (matching the cube's material color), not a hollow void.
- Drag the gizmo to tilt the plane → the filled cap follows the new orientation.
- Move the offset slider → the filled cap follows the new position, still solid.
- Edit the source to a different shape (e.g. `sphere(15);`) while section mode is active → confirm the cap rebuilds correctly against the new geometry (no leftover cap from the old mesh, no console errors).
- Toggle "Section" off → cap, gizmo, and clipping all disappear; full model reappears.
- No new console errors, no stencil-buffer visual artifacts (z-fighting, flickering) under normal orbiting.

- [ ] **Step 4: Commit**

```bash
git add src/components/ThreeViewer.tsx
git commit -m "feat: add stencil-buffer filled cap to cross-section tool"
```

---

## Stage 3.1 acceptance criteria (from the spec)

- [ ] Click on mesh face shows XYZ coordinates in the UI — Task 2
- [ ] Two-click distance measurement works for typical part sizes — Task 2
- [ ] Cross-section slider/gizmo clips the mesh with a filled cap — Tasks 3 & 4

After Task 4's commit, if all manual verifications passed, tag the milestone:

```bash
git tag stage-3.1-complete
```
