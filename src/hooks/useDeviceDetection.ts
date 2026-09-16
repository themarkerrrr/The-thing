import { useState, useEffect, useCallback } from 'react';

export type DeviceMode = 'auto' | 'mobile' | 'pc';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  isPortrait: boolean;
  isIPhone: boolean;
  isIPad: boolean;
  width: number;
  height: number;
  dpr: number;
  effectiveDevice: 'mobile' | 'pc';
  forcedMode: DeviceMode;
  setForcedMode: (mode: DeviceMode) => void;
}

export function useDeviceDetection(): DeviceInfo {
  const [forcedMode, setForcedModeState] = useState<DeviceMode>(() => {
    try {
      const saved = localStorage.getItem('stickgrounds_device_mode');
      if (saved === 'mobile' || saved === 'pc') return saved;
    } catch {
      // ignore
    }
    return 'auto';
  });

  const getDims = () => {
    if (typeof window === 'undefined') {
      return { width: 1280, height: 720, dpr: 1, isPortrait: false };
    }
    const w = window.visualViewport?.width || window.innerWidth || 1280;
    const h = window.visualViewport?.height || window.innerHeight || 720;
    const dpr = window.devicePixelRatio || 1;
    return {
      width: Math.round(w),
      height: Math.round(h),
      dpr,
      isPortrait: h > w,
    };
  };

  const [state, setState] = useState(getDims);

  const setForcedMode = useCallback((mode: DeviceMode) => {
    setForcedModeState(mode);
    try {
      localStorage.setItem('stickgrounds_device_mode', mode);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setState(getDims());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  // Compute actual hardware detection
  const isTouch = typeof window !== 'undefined' && (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches
  );

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIPhone = typeof navigator !== 'undefined' && /iPhone|iPod/i.test(userAgent);
  const isIPad = typeof navigator !== 'undefined' && (
    /iPad/i.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
  const isMobileUA = isIPhone || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTabletUA = isIPad || /Android(?!.*Mobile)|Tablet/i.test(userAgent);

  const isSmallScreen = state.width <= 768 || (state.width <= 1024 && state.isPortrait);
  const detectedMobile = isMobileUA || (isTouch && isSmallScreen && !isIPad);
  const detectedTablet = isTabletUA || (isTouch && (isIPad || (!isSmallScreen && state.width <= 1180)));
  const detectedDesktop = !detectedMobile && !detectedTablet;

  let effectiveDevice: 'mobile' | 'pc' = 'pc';
  if (forcedMode === 'mobile') {
    effectiveDevice = 'mobile';
  } else if (forcedMode === 'pc') {
    effectiveDevice = 'pc';
  } else {
    effectiveDevice = (detectedMobile || (isTouch && state.width <= 900)) ? 'mobile' : 'pc';
  }

  return {
    isMobile: detectedMobile,
    isTablet: detectedTablet,
    isDesktop: detectedDesktop,
    isTouch,
    isPortrait: state.isPortrait,
    isIPhone,
    isIPad,
    width: state.width,
    height: state.height,
    dpr: state.dpr,
    effectiveDevice,
    forcedMode,
    setForcedMode,
  };
}
