'use client';

import React, { useState, useEffect } from 'react';
import { Package } from 'lucide-react';

const FAILED_URL_CACHE = new Set();

export default function SafeItemImage({
  src,
  alt = 'Item',
  className = 'w-10 h-10 rounded-lg object-cover',
  fallbackClassName = 'w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'
}) {
  const cleanSrc = (typeof src === 'string' && src.trim() !== '') ? src.trim() : null;
  const isKnownBad = cleanSrc ? FAILED_URL_CACHE.has(cleanSrc) : true;

  const [hasError, setHasError] = useState(isKnownBad);
  const [isLoading, setIsLoading] = useState(!isKnownBad);

  useEffect(() => {
    if (!cleanSrc || FAILED_URL_CACHE.has(cleanSrc)) {
      setHasError(true);
      setIsLoading(false);
    } else {
      setHasError(false);
      setIsLoading(true);
    }
  }, [cleanSrc]);

  if (!cleanSrc || hasError) {
    return (
      <div className={fallbackClassName} aria-label={alt}>
        <Package className="w-5 h-5 stroke-[1.5]" />
      </div>
    );
  }

  return (
    <div className="relative inline-block overflow-hidden rounded-lg">
      {isLoading && (
        <div className={`absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700 ${className}`} />
      )}
      <img
        src={cleanSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          if (cleanSrc) FAILED_URL_CACHE.add(cleanSrc);
          setIsLoading(false);
          setHasError(true);
        }}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
      />
    </div>
  );
}