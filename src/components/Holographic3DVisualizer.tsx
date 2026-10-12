import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  RotateCcw,
  Sparkles,
  Layers,
  Cpu,
  Compass,
  Zap,
  Eye,
  Maximize2,
  Sliders,
} from 'lucide-react';
import { TradingAgent, MarketRegime, TechnicalIndicators } from '../types/trading';

export type HologramMode = 'spatial' | 'blackbox' | 'consensus';

interface Holographic3DVisualizerProps {
  mode?: HologramMode;
  onModeChange?: (mode: HologramMode) => void;
  symbol?: string;
  currentPrice?: number;
  indicators?: TechnicalIndicators | null;
  regime?: MarketRegime;
  agents?: TradingAgent[];
  height?: number | string;
}

export const Holographic3DVisualizer: React.FC<Holographic3DVisualizerProps> = ({
  mode: initialMode = 'blackbox',
  onModeChange,
  symbol = '1HZ100V',
  currentPrice = 1250.5,
  indicators,
  regime,
  agents = [],
  height = 360,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<HologramMode>(initialMode);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [hologramIntensity, setHologramIntensity] = useState(1.0);

  // Sync mode if parent passes updated prop
  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  const handleSelectMode = (newMode: HologramMode) => {
    setMode(newMode);
    onModeChange?.(newMode);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.04);

    const width = container.clientWidth || 400;
    const heightPx = typeof height === 'number' ? height : container.clientHeight || 360;

    const camera = new THREE.PerspectiveCamera(50, width / heightPx, 0.1, 1000);
    camera.position.set(0, 0, 16);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Remove any previous canvases
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // Group for mode-specific holographic meshes
    const hologramGroup = new THREE.Group();
    scene.add(hologramGroup);

    // Ambient & Directional Lights with Cyberpunk Glow Colors
    const ambientLight = new THREE.AmbientLight(0x06b6d4, 0.6 * hologramIntensity);
    scene.add(ambientLight);

    const cyanPointLight = new THREE.PointLight(0x22d3ee, 2.5 * hologramIntensity, 50);
    cyanPointLight.position.set(8, 10, 12);
    scene.add(cyanPointLight);

    const purplePointLight = new THREE.PointLight(0xa855f7, 2.0 * hologramIntensity, 50);
    purplePointLight.position.set(-10, -8, 8);
    scene.add(purplePointLight);

    const emeraldPointLight = new THREE.PointLight(0x10b981, 1.8 * hologramIntensity, 40);
    emeraldPointLight.position.set(0, 12, -8);
    scene.add(emeraldPointLight);

    // Particle Cloud (Cosmic Market Microstructure)
    const particleCount = 280;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    const colorCyan = new THREE.Color(0x06b6d4);
    const colorPurple = new THREE.Color(0xa855f7);
    const colorEmerald = new THREE.Color(0x10b981);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 6 + Math.random() * 8;

      particlePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi);

      const chosenColor = i % 3 === 0 ? colorCyan : i % 3 === 1 ? colorPurple : colorEmerald;
      particleColors[i * 3] = chosenColor.r;
      particleColors[i * 3 + 1] = chosenColor.g;
      particleColors[i * 3 + 2] = chosenColor.b;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });

    const particleField = new THREE.Points(particleGeometry, particleMaterial);
    hologramGroup.add(particleField);

    // Dynamic objects based on active mode
    let dynamicMesh: THREE.Object3D | null = null;
    let orbitalNodes: THREE.Mesh[] = [];
    let laserLines: THREE.Line[] = [];

    // Helper: Build Mode Visuals
    const buildModeGeometry = () => {
      // Clear previous dynamic meshes
      if (dynamicMesh) {
        hologramGroup.remove(dynamicMesh);
        dynamicMesh = null;
      }
      orbitalNodes.forEach((node) => hologramGroup.remove(node));
      orbitalNodes = [];
      laserLines.forEach((line) => hologramGroup.remove(line));
      laserLines = [];

      const modeContainer = new THREE.Group();

      if (mode === 'spatial') {
        // Mode 1: SPATIAL METRICS - Attractor Torus Knot & Holographic Iso-Surfaces
        const rsi = indicators?.rsiNow ?? 50;
        const knotP = Math.max(2, Math.round((rsi / 100) * 4) + 1);
        const knotQ = 3;

        const knotGeom = new THREE.TorusKnotGeometry(3.6, 0.85, 120, 32, knotP, knotQ);
        const knotMat = new THREE.MeshPhysicalMaterial({
          color: 0x06b6d4,
          emissive: 0x0284c7,
          emissiveIntensity: 0.45 * hologramIntensity,
          roughness: 0.15,
          metalness: 0.8,
          transmission: 0.6,
          transparent: true,
          opacity: 0.75,
          wireframe: showWireframe,
        });

        const knotMesh = new THREE.Mesh(knotGeom, knotMat);
        modeContainer.add(knotMesh);

        // Surrounding Holographic Scan Rings
        for (let r = 1; r <= 3; r++) {
          const ringGeom = new THREE.RingGeometry(r * 2.2, r * 2.2 + 0.08, 64);
          const ringMat = new THREE.MeshBasicMaterial({
            color: r === 1 ? 0x22d3ee : r === 2 ? 0xa855f7 : 0x10b981,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.35,
            wireframe: true,
          });
          const ringMesh = new THREE.Mesh(ringGeom, ringMat);
          ringMesh.rotation.x = Math.PI / 2 + (r * Math.PI) / 6;
          modeContainer.add(ringMesh);
        }
      } else if (mode === 'blackbox') {
        // Mode 2: BLACKBOX HUB - Core Crystalline Icosahedron + 4 Orbiting Subagent Cores
        const coreGeom = new THREE.IcosahedronGeometry(2.4, 2);
        const coreMat = new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.65 * hologramIntensity,
          roughness: 0.1,
          metalness: 0.9,
          transmission: 0.75,
          transparent: true,
          opacity: 0.82,
          wireframe: showWireframe,
        });
        const coreMesh = new THREE.Mesh(coreGeom, coreMat);
        modeContainer.add(coreMesh);

        // Core Pulse Sphere inside
        const innerPulseGeom = new THREE.SphereGeometry(1.2, 24, 24);
        const innerPulseMat = new THREE.MeshBasicMaterial({
          color: 0x00f0ff,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
        });
        const innerPulse = new THREE.Mesh(innerPulseGeom, innerPulseMat);
        modeContainer.add(innerPulse);

        // 4 Subagent Satellite Nodes: Executive (Gold), Sniper (Cyan), Quant (Purple), Cyber (Emerald)
        const nodeColors = [0xf59e0b, 0x06b6d4, 0xa855f7, 0x10b981];
        const nodeRadii = [5.0, 5.5, 6.0, 6.5];

        nodeColors.forEach((colorHex, idx) => {
          const nodeGeom = new THREE.OctahedronGeometry(0.55, 1);
          const nodeMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.6,
            roughness: 0.2,
            metalness: 0.8,
            wireframe: showWireframe,
          });
          const nodeMesh = new THREE.Mesh(nodeGeom, nodeMat);
          orbitalNodes.push(nodeMesh);
          modeContainer.add(nodeMesh);

          // Laser line connecting Core to Subagent
          const linePoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(nodeRadii[idx], 0, 0)];
          const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
          const lineMat = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.45,
          });
          const laser = new THREE.Line(lineGeom, lineMat);
          laserLines.push(laser);
          modeContainer.add(laser);
        });
      } else {
        // Mode 3: AGENT CONSENSUS & PHASE-SPACE - Celestial Sphere with BUY / SELL / HOLD Attraction Vectors
        const sphereGeom = new THREE.SphereGeometry(4.2, 32, 24);
        const sphereMat = new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          wireframe: true,
          transparent: true,
          opacity: 0.18,
        });
        const celestialSphere = new THREE.Mesh(sphereGeom, sphereMat);
        modeContainer.add(celestialSphere);

        // BUY Pole (Top - Emerald)
        const buyPoleGeom = new THREE.ConeGeometry(0.7, 1.8, 16);
        const buyPoleMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 0.8,
        });
        const buyPole = new THREE.Mesh(buyPoleGeom, buyPoleMat);
        buyPole.position.set(0, 4.2, 0);
        modeContainer.add(buyPole);

        // SELL Pole (Bottom - Rose)
        const sellPoleGeom = new THREE.ConeGeometry(0.7, 1.8, 16);
        const sellPoleMat = new THREE.MeshStandardMaterial({
          color: 0xf43f5e,
          emissive: 0xf43f5e,
          emissiveIntensity: 0.8,
        });
        const sellPole = new THREE.Mesh(sellPoleGeom, sellPoleMat);
        sellPole.position.set(0, -4.2, 0);
        sellPole.rotation.z = Math.PI;
        modeContainer.add(sellPole);

        // Equilibrium Equator Ring (Amber)
        const eqGeom = new THREE.TorusGeometry(4.2, 0.06, 16, 64);
        const eqMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.5,
        });
        const eqRing = new THREE.Mesh(eqGeom, eqMat);
        eqRing.rotation.x = Math.PI / 2;
        modeContainer.add(eqRing);

        // Individual Agent Vectors from Active Agents
        const agentList = agents.length > 0 ? agents : [
          { name: 'Trend Ingestion', action: 'BUY', winRate: 68 },
          { name: 'Mean Reversion', action: 'HOLD', winRate: 64 },
          { name: 'Volatility Expansion', action: 'BUY', winRate: 72 },
          { name: 'Candle Pattern Scanner', action: 'BUY', winRate: 65 },
        ];

        agentList.forEach((ag: any, idx: number) => {
          const action = ag.recommendedAction || ag.action || 'HOLD';
          const angle = (idx / agentList.length) * Math.PI * 2;
          const yPos = action === 'BUY' ? 2.5 : action === 'SELL' ? -2.5 : 0;
          const xPos = Math.cos(angle) * 3.2;
          const zPos = Math.sin(angle) * 3.2;

          const dotGeom = new THREE.SphereGeometry(0.38, 16, 16);
          const dotColor = action === 'BUY' ? 0x10b981 : action === 'SELL' ? 0xf43f5e : 0xf59e0b;
          const dotMat = new THREE.MeshStandardMaterial({
            color: dotColor,
            emissive: dotColor,
            emissiveIntensity: 0.8,
          });
          const dotMesh = new THREE.Mesh(dotGeom, dotMat);
          dotMesh.position.set(xPos, yPos, zPos);
          modeContainer.add(dotMesh);

          // Vector line to center
          const vPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(xPos, yPos, zPos)];
          const vLineGeom = new THREE.BufferGeometry().setFromPoints(vPoints);
          const vLineMat = new THREE.LineBasicMaterial({
            color: dotColor,
            transparent: true,
            opacity: 0.5,
          });
          const vLine = new THREE.Line(vLineGeom, vLineMat);
          modeContainer.add(vLine);
        });
      }

      dynamicMesh = modeContainer;
      hologramGroup.add(dynamicMesh);
    };

    buildModeGeometry();

    // Mouse / Touch Interaction
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      isDragging = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      prevMouseX = clientX;
      prevMouseY = clientY;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaX = clientX - prevMouseX;
      const deltaY = clientY - prevMouseY;
      prevMouseX = clientX;
      prevMouseY = clientY;

      hologramGroup.rotation.y += deltaX * 0.008;
      hologramGroup.rotation.x += deltaY * 0.008;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    domEl.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Subtle particle float
      particleField.rotation.y = elapsedTime * 0.02;
      particleField.rotation.x = Math.sin(elapsedTime * 0.05) * 0.05;

      // Auto rotation
      if (autoRotate && !isDragging) {
        hologramGroup.rotation.y += 0.007;
        hologramGroup.rotation.x = Math.sin(elapsedTime * 0.4) * 0.08;
      }

      // Orbital node animations in Blackbox mode
      if (mode === 'blackbox' && orbitalNodes.length === 4) {
        const radii = [4.8, 5.3, 5.8, 6.3];
        const speeds = [0.8, -0.6, 0.9, -0.7];

        orbitalNodes.forEach((node, i) => {
          const angle = elapsedTime * speeds[i] + (i * Math.PI) / 2;
          const nx = Math.cos(angle) * radii[i];
          const ny = Math.sin(angle * 1.2) * 1.5;
          const nz = Math.sin(angle) * radii[i];
          node.position.set(nx, ny, nz);
          node.rotation.x += 0.02;
          node.rotation.y += 0.03;

          // Update laser line end point
          if (laserLines[i]) {
            const linePositions = new Float32Array([0, 0, 0, nx, ny, nz]);
            laserLines[i].geometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 400;
      const newH = typeof height === 'number' ? height : container.clientHeight || 360;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      domEl.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      domEl.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);

      renderer.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      if (container.contains(domEl)) {
        container.removeChild(domEl);
      }
    };
  }, [mode, autoRotate, showWireframe, hologramIntensity, height, indicators?.rsiNow, agents]);

  return (
    <div className="relative w-full rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900/90 to-slate-950 border border-cyan-500/30 overflow-hidden shadow-2xl backdrop-blur-xl">
      {/* Top Header Bar & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 bg-slate-900/80 border-b border-cyan-500/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-sm shadow-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase">
            3D Holographic Spatial Engine
          </span>
          <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            Three.js Core
          </span>
        </div>

        {/* Mode Selector Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => handleSelectMode('spatial')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
              mode === 'spatial'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Phase-Space Attractor & Volatility Torus"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Spatial Metrics</span>
            <span className="md:hidden">Spatial</span>
          </button>
          <button
            onClick={() => handleSelectMode('blackbox')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
              mode === 'blackbox'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Blackbox Intelligence Hub Crystalline Core"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Blackbox Hub</span>
            <span className="md:hidden">Blackbox</span>
          </button>
          <button
            onClick={() => handleSelectMode('consensus')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
              mode === 'consensus'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Multi-Agent Consensus Phase Space"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Agent Consensus</span>
            <span className="md:hidden">Consensus</span>
          </button>
        </div>
      </div>

      {/* Hologram Canvas Container */}
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full relative cursor-grab active:cursor-grabbing select-none"
      />

      {/* Holographic Scanline Overlay Aesthetic */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(6,182,212,0.02)_1px,transparent_1px)] bg-[size:100%_4px]" />

      {/* Live HUD Floating Badges */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-300 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
          <span className="text-cyan-400 font-bold">ASSET:</span> {symbol}
          <span className="text-slate-500">|</span>
          <span className="text-emerald-400 font-bold">${currentPrice}</span>
        </div>
        <div className="px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-300 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
          <span className="text-purple-400 font-bold">REGIME:</span>{' '}
          {regime?.type || 'EQUILIBRIUM'}
        </div>
      </div>

      {/* Bottom Controls (Auto-spin, Wireframe, Glow) */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 pointer-events-auto">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all border ${
            autoRotate
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800'
          }`}
          title="Toggle Auto-Rotation"
        >
          {autoRotate ? 'Auto-Spin: ON' : 'Auto-Spin: OFF'}
        </button>
        <button
          onClick={() => setShowWireframe(!showWireframe)}
          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all border ${
            showWireframe
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800'
          }`}
          title="Toggle Hologram Wireframe"
        >
          Wireframe
        </button>
      </div>
    </div>
  );
};
