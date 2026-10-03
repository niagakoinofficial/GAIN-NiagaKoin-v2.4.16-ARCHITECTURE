import React, { useState } from 'react';

export interface CoinLogoProps {
  coin: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  fallbackSymbol?: string;
  fallbackBg?: string;
  fallbackColor?: string;
}

const sizeClasses: Record<string, { box: string; img: string }> = {
  xs: { box: 'w-5 h-5 min-w-[20px]', img: 'w-4 h-4' },
  sm: { box: 'w-7 h-7 min-w-[28px]', img: 'w-5 h-5' },
  md: { box: 'w-9 h-9 min-w-[36px]', img: 'w-7 h-7' },
  lg: { box: 'w-10 h-10 min-w-[40px]', img: 'w-8 h-8' },
  xl: { box: 'w-12 h-12 min-w-[48px]', img: 'w-10 h-10' },
};

export const CoinLogo: React.FC<CoinLogoProps> = ({
  coin,
  size = 'md',
  className = '',
  fallbackSymbol,
  fallbackBg = 'bg-slate-800',
  fallbackColor = 'text-white',
}) => {
  // Normalize symbol (handles 'BTC/USDT' or 'btc' -> 'BTC')
  const cleanSymbol = (coin || 'BTC').split('/')[0].trim().toUpperCase();
  const lowerSymbol = cleanSymbol.toLowerCase();

  const [hasError, setHasError] = useState(false);
  const [useCdnFallback, setUseCdnFallback] = useState(false);

  const localSrc = `/coins/${lowerSymbol}.svg`;
  const cdnSrc =
    cleanSymbol === 'ZEC'
      ? 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/zec.svg'
      : `https://cdn.jsdelivr.net/gh/madenix/Crypto-logo-cdn@main/Logos/${cleanSymbol}.svg`;

  const currentSrc = useCdnFallback ? cdnSrc : localSrc;

  const sizeConfig = typeof size === 'string' ? sizeClasses[size] || sizeClasses.md : null;
  const customBoxStyle = typeof size === 'number' ? { width: `${size}px`, height: `${size}px`, minWidth: `${size}px` } : undefined;
  const customImgStyle = typeof size === 'number' ? { width: `${Math.round(size * 0.8)}px`, height: `${Math.round(size * 0.8)}px` } : undefined;

  const handleImageError = () => {
    if (!useCdnFallback) {
      setUseCdnFallback(true);
    } else {
      setHasError(true);
    }
  };

  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl overflow-hidden bg-slate-100/80 dark:bg-slate-900/80 p-0.5 border border-slate-200/60 dark:border-slate-800/80 shadow-xs shrink-0 select-none ${
        sizeConfig ? sizeConfig.box : ''
      } ${className}`}
      style={customBoxStyle}
      title={`${cleanSymbol} Official Logo`}
    >
      {!hasError ? (
        <img
          src={currentSrc}
          alt={`${cleanSymbol} Logo`}
          onError={handleImageError}
          referrerPolicy="no-referrer"
          className={`object-contain transition-opacity duration-200 ${
            sizeConfig ? sizeConfig.img : ''
          }`}
          style={customImgStyle}
          loading="lazy"
        />
      ) : (
        <div
          className={`w-full h-full rounded-lg ${fallbackBg} ${fallbackColor} flex items-center justify-center font-bold text-xs uppercase font-mono`}
        >
          {fallbackSymbol || cleanSymbol.slice(0, 3)}
        </div>
      )}
    </div>
  );
};
