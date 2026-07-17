import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  AmbientLight,
  BufferAttribute,
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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseOff } from '../io/import_off';
import { MeasureState, EMPTY_MEASURE_STATE } from '../viewer/section-measure-types';

export interface ThreeViewerHandle {
  setCameraView(theta: number, phi: number): void;
  clearMeasurement(): void;
}

interface ThreeViewerProps {
  meshDataUrl: string | null;
  active: boolean;
  measureEnabled: boolean;
  onMeasureChange: (state: MeasureState) => void;
}

const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(
  ({ meshDataUrl, active, measureEnabled, onMeasureChange }, ref) => {
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

    // Clear measurement markers whenever measureEnabled toggles off
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

    // Mount once: set up Three.js scene
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth || 600;
      const h = container.clientHeight || 400;

      const renderer = new WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(w, h);
      renderer.setClearColor(0x1e1e1e);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const camera = new PerspectiveCamera(45, w / h, 0.1, 10000);
      camera.position.set(0, 0, 5);
      cameraRef.current = camera;

      const scene = new Scene();
      scene.add(new AmbientLight(0xffffff, 0.6));
      const dirLight = new DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(1, 2, 3);
      scene.add(dirLight);
      sceneRef.current = scene;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;

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

      const material = new MeshStandardMaterial({
        color: 0xf5a623,
        flatShading: true,
        metalness: 0.1,
        roughness: 0.8,
      });
      materialRef.current = material;

      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const ro = new ResizeObserver(() => {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw === 0 || ch === 0) return;
        renderer.setSize(cw, ch);
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
      });
      ro.observe(container);

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
    }, []);

    // Reload geometry when meshDataUrl changes
    useEffect(() => {
      if (!meshDataUrl) return;
      if (!active) return;
      const abort = new AbortController();

      fetch(meshDataUrl, { signal: abort.signal })
        .then(r => r.text())
        .then(text => {
          if (abort.signal.aborted) return;

          const polyhedron = parseOff(text);
          const positions = new Float32Array(polyhedron.vertices.length * 3);
          polyhedron.vertices.forEach((v, i) => {
            positions[i * 3] = v.x;
            positions[i * 3 + 1] = v.y;
            positions[i * 3 + 2] = v.z;
          });
          const indices: number[] = [];
          polyhedron.faces.forEach(f => indices.push(...f.vertices));

          const geometry = new BufferGeometry();
          geometry.setAttribute('position', new BufferAttribute(positions, 3));
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          geometry.computeBoundsTree();
          const sphere = geometry.boundingSphere!;

          const scene = sceneRef.current!;
          const camera = cameraRef.current!;
          const controls = controlsRef.current!;

          if (meshRef.current) {
            scene.remove(meshRef.current);
            meshRef.current.geometry.disposeBoundsTree();
            meshRef.current.geometry.dispose();
          }

          const mesh = new Mesh(geometry, materialRef.current!);
          scene.add(mesh);
          meshRef.current = mesh;

          controls.target.copy(sphere.center);
          camera.position
            .copy(sphere.center)
            .addScaledVector(new Vector3(0, 0, 1), sphere.radius * 2.5);
          camera.near = sphere.radius * 0.01;
          camera.far = sphere.radius * 100;
          camera.updateProjectionMatrix();
          controls.update();
        })
        .catch(err => {
          if ((err as Error).name !== 'AbortError') {
            console.error('ThreeViewer: mesh load error', err);
          }
        });

      return () => abort.abort();
    }, [meshDataUrl, active]);

    useImperativeHandle(
      ref,
      () => ({
        setCameraView(theta: number, phi: number) {
          const sphere = meshRef.current?.geometry.boundingSphere;
          if (!sphere) return;
          const dir = new Vector3(
            Math.cos(theta) * Math.sin(phi),
            Math.sin(theta) * Math.sin(phi),
            Math.cos(phi),
          );
          cameraRef.current!
            .position.copy(sphere.center)
            .addScaledVector(dir, sphere.radius * 2.5);
          controlsRef.current!.target.copy(sphere.center);
          controlsRef.current!.update();
        },
        clearMeasurement() {
          const scene = sceneRef.current;
          if (scene) {
            if (markerARef.current) { scene.remove(markerARef.current); markerARef.current = null; }
            if (markerBRef.current) { scene.remove(markerBRef.current); markerBRef.current = null; }
            if (measureLineRef.current) { scene.remove(measureLineRef.current); measureLineRef.current = null; }
          }
          measureStateRef.current = EMPTY_MEASURE_STATE;
          onMeasureChangeRef.current(EMPTY_MEASURE_STATE);
        },
      }),
      [],
    );

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
      />
    );
  },
);

ThreeViewer.displayName = 'ThreeViewer';
export default ThreeViewer;
