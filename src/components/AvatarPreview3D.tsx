import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createStickmanMesh, animateStickman, updateStickmanColor, updateNameTag, StickmanMeshParts } from '../game/StickmanModel.ts';

interface AvatarPreview3DProps {
  color: string;
  name: string;
  className?: string;
}

export const AvatarPreview3D: React.FC<AvatarPreview3DProps> = ({ color, name, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<StickmanMeshParts | null>(null);
  const rotationYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 240;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f3f4f6');

    // Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 1.35, 3.8);
    camera.lookAt(0, 0.95, 0);

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      console.warn('WebGL not supported for avatar preview:', err);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd1d5db, 0.95);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(5, 10, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.6);
    rimLight.position.set(-5, 6, -5);
    scene.add(rimLight);

    // Studio circular turntable floor / shadow receiver
    const pedestalGeo = new THREE.CylinderGeometry(1.2, 1.25, 0.08, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.05,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.position.y = -0.04;
    pedestalMesh.receiveShadow = true;
    scene.add(pedestalMesh);

    // Create Avatar Stickman/Object mesh
    const parts = createStickmanMesh(color, name || 'YOU');
    partsRef.current = parts;
    scene.add(parts.root);

    // Animation Loop
    let reqId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Auto rotate slightly when not dragging
      if (!isDraggingRef.current) {
        rotationYRef.current += delta * 0.75;
      }
      if (partsRef.current?.root) {
        partsRef.current.root.rotation.y = rotationYRef.current;
        animateStickman(partsRef.current, elapsed, 'idle', 0, delta);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Mouse / Touch Drag to Rotate
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMouseXRef.current = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - lastMouseXRef.current;
      lastMouseXRef.current = e.clientX;
      rotationYRef.current += deltaX * 0.015;
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        lastMouseXRef.current = e.touches[0].clientX;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - lastMouseXRef.current;
      lastMouseXRef.current = e.touches[0].clientX;
      rotationYRef.current += deltaX * 0.015;
    };
    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    // Handle container resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w && h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      partsRef.current = null;
    };
  }, []);

  // Update Color dynamically
  useEffect(() => {
    if (partsRef.current) {
      updateStickmanColor(partsRef.current, color);
      updateNameTag(partsRef.current, name || 'YOU', color);
    }
  }, [color, name]);

  return (
    <div className={`relative overflow-hidden cursor-grab active:cursor-grabbing select-none ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-1.5 inset-x-0 text-center pointer-events-none text-[10px] font-comic font-bold text-neutral-500 uppercase tracking-wider">
        Drag to rotate
      </div>
    </div>
  );
};
