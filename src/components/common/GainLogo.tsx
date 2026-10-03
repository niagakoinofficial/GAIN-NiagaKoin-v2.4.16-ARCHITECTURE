import React, { useState } from 'react';

interface GainLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showText?: boolean;
}

export function GainLogo({ size = 'md', className = '', showText = false }: GainLogoProps) {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
    '2xl': 'w-28 h-28',
  };

  const dim = sizeClasses[size] || sizeClasses.md;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div className={`relative shrink-0 rounded-2xl overflow-hidden shadow-lg shadow-amber-500/20 border border-amber-500/40 bg-[#0B0F17] flex items-center justify-center ${dim}`}>
        {!hasError ? (
          <img
            src="/gain-logo.png"
            alt="GAIN — Niaga Koin"
            className="w-full h-full object-cover rounded-2xl transform transition hover:scale-105 duration-300"
            referrerPolicy="no-referrer"
            onError={() => setHasError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 font-black font-mono">
            G
          </div>
        )}
      </div>

      {showText && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1">
            <span className="font-mono font-black text-white tracking-wider text-base">GAIN</span>
            <span className="text-[10px] font-bold text-amber-400 font-mono px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              PRO
            </span>
          </div>
          <span className="text-[10px] text-amber-300/90 font-sans tracking-tight">
            (Niaga Koin)
          </span>
          <span className="text-[8px] text-slate-400 font-mono tracking-wider">
            Growth • Awareness • Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
