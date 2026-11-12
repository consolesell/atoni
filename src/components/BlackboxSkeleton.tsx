import React from 'react';
import { Cpu, Sparkles } from 'lucide-react';

export const BlackboxSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-950/80 rounded-xl border border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-cyan-400/60 animate-spin" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="h-4 w-44 bg-slate-800 rounded" />
            <div className="h-3 w-64 bg-slate-800/60 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-slate-800 rounded-lg" />
          <div className="h-8 w-24 bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* 3D Holographic Canvas Placeholder */}
      <div className="relative h-72 sm:h-96 w-full rounded-2xl bg-slate-950 border border-slate-800/80 overflow-hidden flex flex-col items-center justify-center text-center p-6">
        <div className="absolute inset-0 bg-radial from-cyan-950/20 via-transparent to-transparent opacity-50" />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-cyan-500/40 border-t-cyan-400 animate-spin flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-cyan-400" />
          </div>
          <p className="text-xs font-mono font-bold text-slate-300">
            Initializing 3D Phase-Space Attractor Manifolds...
          </p>
          <span className="text-[10px] font-mono text-slate-500">
            WebGL context loading in background
          </span>
        </div>
      </div>

      {/* Control Strip Skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-28 bg-slate-950/80 rounded-xl border border-slate-800/60 p-4 flex flex-col gap-2">
          <div className="h-3 w-24 bg-slate-800 rounded" />
          <div className="h-6 w-36 bg-slate-800/70 rounded mt-auto" />
        </div>
        <div className="h-28 bg-slate-950/80 rounded-xl border border-slate-800/60 p-4 flex flex-col gap-2">
          <div className="h-3 w-28 bg-slate-800 rounded" />
          <div className="h-6 w-32 bg-slate-800/70 rounded mt-auto" />
        </div>
        <div className="h-28 bg-slate-950/80 rounded-xl border border-slate-800/60 p-4 flex flex-col gap-2">
          <div className="h-3 w-20 bg-slate-800 rounded" />
          <div className="h-6 w-28 bg-slate-800/70 rounded mt-auto" />
        </div>
      </div>
    </div>
  );
};
