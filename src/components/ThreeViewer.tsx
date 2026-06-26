import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface ThreeViewerHandle {
  setCameraView(theta: number, phi: number): void;
}

interface ThreeViewerProps {
  stlUrl: string | null;
}

const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(
  ({ stlUrl }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null);
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<Mesh | null>(null);
    const materialRef = useRef<MeshStandardMaterial | null>(null);
    const animFrameRef = useRef<number>(0);

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
        controls.dispose();
        material.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    // Reload geometry when stlUrl changes
    useEffect(() => {
      if (!stlUrl) return;
      const abort = new AbortController();

      fetch(stlUrl, { signal: abort.signal })
        .then(r => r.arrayBuffer())
        .then(buffer => {
          if (abort.signal.aborted) return;

          const geometry = new STLLoader().parse(buffer);
          geometry.computeBoundingSphere();
          const sphere = geometry.boundingSphere!;

          const scene = sceneRef.current!;
          const camera = cameraRef.current!;
          const controls = controlsRef.current!;

          if (meshRef.current) {
            scene.remove(meshRef.current);
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
            console.error('ThreeViewer: STL load error', err);
          }
        });

      return () => abort.abort();
    }, [stlUrl]);

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
