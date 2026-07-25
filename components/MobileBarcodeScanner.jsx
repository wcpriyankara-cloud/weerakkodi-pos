'use client';// src/components/MobileBarcodeScanner.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function MobileBarcodeScanner({
  isOpen = false,
  onScan,
  onClose,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const mountedRef = useRef(false);
  const scanLockedRef = useRef(false);
  const lastScanRef = useRef({ code: '', time: 0 });

  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [status, setStatus] = useState('Camera à¶†à¶»à¶¸à·Šà¶· à·€à·™à¶¸à·’à¶±à·Š...');
  const [starting, setStarting] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [detectedCode, setDetectedCode] = useState('');
  const [detectedFormat, setDetectedFormat] = useState('');
  const [scanFps, setScanFps] = useState(0);
  const [useZxing, setUseZxing] = useState(false);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // STOP SCANNER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const stopScanner = useCallback(() => {
    mountedRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      const stream = streamRef.current;
      if (stream?.getTracks) {
        stream.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
      }
    } catch {}

    try {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    } catch {}

    streamRef.current = null;
    trackRef.current = null;
    scanLockedRef.current = false;
    setTorchAvailable(false);
    setTorchOn(false);
    setDetectedCode('');
    setDetectedFormat('');
  }, []);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // HANDLE SUCCESS SCAN
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const handleSuccessScan = useCallback(
    (code, formatName) => {
      if (!code || scanLockedRef.current) return;

      const now = Date.now();
      if (
        lastScanRef.current.code === code &&
        now - lastScanRef.current.time < 2000
      ) return;

      lastScanRef.current = { code, time: now };
      scanLockedRef.current = true;

      // stop scan interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      setDetectedCode(code);
      setDetectedFormat(formatName || '');
      setStatus(`âœ… ${formatName ? formatName + ': ' : ''}${code}`);

      console.log('[MobileScanner] âœ… Scanned:', code, '| Format:', formatName);

      try {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } catch {}

      try {
        onScan?.(code, {
          rawCode: code,
          format: null,
          formatName: formatName || 'UNKNOWN',
        });
      } catch (e) {
        console.error('onScan error:', e);
      }

      setTimeout(() => {
        stopScanner();
        onClose?.();
        scanLockedRef.current = false;
      }, 300);
    },
    [onClose, onScan, stopScanner]
  );

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // METHOD 1: Native BarcodeDetector (Chrome/Android â€” FASTEST)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const startNativeBarcodeDetector = useCallback(
    (videoEl) => {
      if (!('BarcodeDetector' in window)) return false;

      try {
        // à·ƒà·’à¶ºà¶½à·” formats support
        const detector = new window.BarcodeDetector({
          formats: [
            'ean_13', 'ean_8',
            'upc_a', 'upc_e',
            'code_128', 'code_39', 'code_93',
            'codabar', 'itf',
            'qr_code', 'data_matrix',
            'pdf417', 'aztec',
          ],
        });

        console.log('[MobileScanner] Using Native BarcodeDetector âœ…');

        let fpsCount = 0;
        let fpsTimer = Date.now();

        intervalRef.current = setInterval(async () => {
          if (scanLockedRef.current || !mountedRef.current) return;
          if (!videoEl || videoEl.readyState < 2) return;

          try {
            const barcodes = await detector.detect(videoEl);

            if (barcodes.length > 0) {
              const best = barcodes[0];
              handleSuccessScan(best.rawValue, best.format?.toUpperCase() || 'BARCODE');
              return;
            }

            // FPS counter
            fpsCount++;
            const now = Date.now();
            if (now - fpsTimer >= 1000) {
              setScanFps(fpsCount);
              fpsCount = 0;
              fpsTimer = now;
            }
          } catch {}
        }, 100); // 10fps scan rate

        return true;
      } catch (e) {
        console.warn('[MobileScanner] BarcodeDetector init failed:', e);
        return false;
      }
    },
    [handleSuccessScan]
  );

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // METHOD 2: ZXing Library (Fallback for iOS/Firefox)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const startZxingDecoder = useCallback(
    async (videoEl) => {
      try {
        console.log('[MobileScanner] Using ZXing fallback...');
        setUseZxing(true);

        // dynamic import â€” ZXing not loaded à¶šà·…à·œà¶­à·Š crash à¶±à·‘
        const zxingModule = await import('@zxing/browser').catch(() => null);
        const zxingLib = await import('@zxing/library').catch(() => null);

        if (!zxingModule || !zxingLib) {
          throw new Error('ZXing modules not available');
        }

        const {
          BarcodeFormat,
          DecodeHintType,
          NotFoundException,
        } = zxingLib;

        const { BrowserMultiFormatReader } = zxingModule;

        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
          BarcodeFormat.RSS_14,
          BarcodeFormat.RSS_EXPANDED,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.PDF_417,
          BarcodeFormat.AZTEC,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('Canvas not found');

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let fpsCount = 0;
        let fpsTimer = Date.now();

        const decodeFrame = async () => {
          if (scanLockedRef.current || !mountedRef.current) return;

          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;

          if (vw > 0 && vh > 0) {
            // center crop â€” scan box area only
            const cropW = Math.floor(vw * 0.9);
            const cropH = Math.floor(vh * 0.45);
            const cropX = Math.floor((vw - cropW) / 2);
            const cropY = Math.floor((vh - cropH) / 2);

            canvas.width = cropW;
            canvas.height = cropH;
            ctx.drawImage(videoEl, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            try {
              let result = null;

              if (typeof reader.decodeFromCanvas === 'function') {
                result = reader.decodeFromCanvas(canvas);
              } else if (typeof reader.decode === 'function') {
                result = reader.decode(canvas);
              }

              if (result) {
                const fmt = result.getBarcodeFormat();
                const fmtName = BarcodeFormat[fmt] || 'BARCODE';
                handleSuccessScan(result.getText(), fmtName);
                return;
              }
            } catch (err) {
              if (!(err instanceof NotFoundException)) {
                // ignore not found â€” normal
              }
            }

            // FPS
            fpsCount++;
            const now = Date.now();
            if (now - fpsTimer >= 1000) {
              setScanFps(fpsCount);
              fpsCount = 0;
              fpsTimer = now;
            }
          }

          if (!scanLockedRef.current && mountedRef.current) {
            intervalRef.current = setTimeout(decodeFrame, 80);
          }
        };

        intervalRef.current = setTimeout(decodeFrame, 200);
        console.log('[MobileScanner] ZXing decode loop started âœ…');
      } catch (e) {
        console.error('[MobileScanner] ZXing failed:', e);
        setError('âŒ Barcode scanner load à¶šà¶»à¶±à·Šà¶± à¶¶à·à¶»à·’ à·€à·”à¶«à·. Manual à¶šà·Šâ€à¶»à¶¸à¶º use à¶šà¶»à¶±à·Šà¶±.');
        setStatus('');
      }
    },
    [handleSuccessScan]
  );

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // START CAMERA
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('âŒ à¶¸à·™à¶¸ browser à¶‘à¶š camera support à¶±à·œà¶šà¶»à¶ºà·’');
      setStatus('');
      return;
    }

    setStarting(true);
    setError('');
    setStatus('Camera à¶†à¶»à¶¸à·Šà¶· à·€à·™à¶¸à·’à¶±à·Š...');
    setDetectedCode('');
    setDetectedFormat('');
    setUseZxing(false);
    scanLockedRef.current = false;
    lastScanRef.current = { code: '', time: 0 };
    mountedRef.current = true;

    // â”€â”€â”€ Camera config attempts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const cameraConfigs = [
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      },
      {
        audio: false,
        video: {
          facingMode: 'environment',
          width: { ideal: 960 },
          height: { ideal: 540 },
        },
      },
      {
        audio: false,
        video: { facingMode: 'environment' },
      },
      {
        audio: false,
        video: true,
      },
    ];

    let stream = null;
    for (const config of cameraConfigs) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(config);
        if (stream) {
          console.log('[MobileScanner] Camera opened âœ…:', JSON.stringify(config.video));
          break;
        }
      } catch (e) {
        console.warn('[MobileScanner] Camera config failed:', e.message);
      }
    }

    if (!stream) {
      setError('âŒ Camera open à¶šà¶»à¶±à·Šà¶± à¶¶à·à¶»à·’ à·€à·”à¶«à·. Permission check à¶šà¶»à¶±à·Šà¶±.');
      setStatus('');
      setStarting(false);
      return;
    }

    streamRef.current = stream;

    // â”€â”€â”€ Attach stream to video â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const videoEl = videoRef.current;
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('autoplay', 'true');
    videoEl.muted = true;

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video timeout')), 8000);
        videoEl.onloadedmetadata = async () => {
          clearTimeout(timeout);
          try {
            await videoEl.play();
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        videoEl.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Video error'));
        };
      });

      console.log(
        '[MobileScanner] Video playing:',
        videoEl.videoWidth,
        'x',
        videoEl.videoHeight
      );
    } catch (e) {
      console.error('[MobileScanner] Video play failed:', e);
      setError('âŒ Camera video play à·€à·”à¶«à·š à¶±à·à·„à·. à¶±à·à·€à¶­ try à¶šà¶»à¶±à·Šà¶±.');
      setStatus('');
      setStarting(false);
      return;
    }

    // â”€â”€â”€ Optimize camera track â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      if (track) {
        const caps = track.getCapabilities?.() || {};

        // autofocus
        if (caps.focusMode?.includes?.('continuous')) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
            console.log('[MobileScanner] Autofocus enabled âœ…');
          } catch {}
        }

        setTorchAvailable(!!caps.torch);
      }
    } catch {}

    setStarting(false);
    setStatus('ðŸ“· Barcode à¶‘à¶š box à¶‘à¶š à¶¸à·à¶¯à¶§ à¶œà¶±à·Šà¶±...');

    // wait 500ms for video to stabilize
    await new Promise((r) => setTimeout(r, 500));

    if (!mountedRef.current) return;

    // â”€â”€â”€ Choose scan method â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Method 1: Native BarcodeDetector (Android Chrome â€” fastest)
    const nativeStarted = startNativeBarcodeDetector(videoEl);

    if (!nativeStarted) {
      // Method 2: ZXing (iOS Safari, Firefox)
      await startZxingDecoder(videoEl);
    }
  }, [startNativeBarcodeDetector, startZxingDecoder]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TORCH TOGGLE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const newState = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch (e) {
      console.warn('Torch failed:', e);
    }
  }, [torchOn]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MANUAL SUBMIT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const handleManualSubmit = useCallback(() => {
    const code = manualCode.trim();
    if (!code) return;
    onScan?.(code, { rawCode: code, format: null, formatName: 'MANUAL' });
    stopScanner();
    onClose?.();
  }, [manualCode, onClose, onScan, stopScanner]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RETRY
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const handleRetry = useCallback(() => {
    setError('');
    setStatus('Camera à¶†à¶»à¶¸à·Šà¶· à·€à·™à¶¸à·’à¶±à·Š...');
    startCamera();
  }, [startCamera]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EFFECTS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    mountedRef.current = true;
    const timer = setTimeout(() => {
      if (mountedRef.current) startCamera();
    }, 150);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, startCamera, stopScanner]);

  if (!isOpen) return null;

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <style>{`
        @keyframes scanLine {
          0%   { top: 18%; opacity: 0.5; }
          50%  { top: 72%; opacity: 1; }
          100% { top: 18%; opacity: 0.5; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Hidden canvas for ZXing decode */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* â”€â”€ FULL SCREEN VIDEO â”€â”€ */}
      {!error && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* â”€â”€ ERROR STATE â”€â”€ */}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111',
            padding: 24,
            gap: 16,
          }}
        >
          <div style={{ fontSize: 48 }}>ðŸ“·</div>
          <div
            style={{
              color: '#f87171',
              fontWeight: 'bold',
              fontSize: 15,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
          <button
            onClick={handleRetry}
            style={{
              padding: '12px 28px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontWeight: 'bold',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            ðŸ”„ à¶±à·à·€à¶­ à¶‹à¶­à·Šà·ƒà·à·„ à¶šà¶»à¶±à·Šà¶±
          </button>
        </div>
      )}

      {/* â”€â”€ SCAN OVERLAY â”€â”€ */}
      {!error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          {/* Darkened outer area */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
            }}
          />

          {/* Scan box â€” clear area */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '82%',
              maxWidth: 340,
              height: 145,
              border: '3px solid #22c55e',
              borderRadius: 14,
              boxShadow:
                '0 0 0 9999px rgba(0,0,0,0.45), 0 0 20px rgba(34,197,94,0.3)',
              background: 'transparent',
            }}
          />

          {/* Corner accents */}
          {[
            { top: 'calc(50% - 73px)', left: 'calc(9%)',  borderRight: 'none', borderBottom: 'none', borderTopLeftRadius: 10 },
            { top: 'calc(50% - 73px)', right: 'calc(9%)', borderLeft: 'none',  borderBottom: 'none', borderTopRightRadius: 10 },
            { bottom: 'calc(50% - 73px)', left: 'calc(9%)',  borderRight: 'none', borderTop: 'none',    borderBottomLeftRadius: 10 },
            { bottom: 'calc(50% - 73px)', right: 'calc(9%)', borderLeft: 'none',  borderTop: 'none',    borderBottomRightRadius: 10 },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 26,
                height: 26,
                border: '4px solid #4ade80',
                ...s,
              }}
            />
          ))}

          {/* Animated scan line */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '76%',
              maxWidth: 310,
              height: 2.5,
              background:
                'linear-gradient(90deg, transparent, #22c55e 20%, #4ade80 50%, #22c55e 80%, transparent)',
              boxShadow: '0 0 12px #22c55e, 0 0 24px rgba(34,197,94,0.5)',
              animation: 'scanLine 1.8s ease-in-out infinite',
            }}
          />

          {/* Box label */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(50% + 80px)',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              fontSize: 12,
              fontWeight: 700,
              background: 'rgba(0,0,0,0.65)',
              padding: '5px 14px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
            }}
          >
            {detectedCode
              ? `âœ… ${detectedFormat || 'BARCODE'}`
              : 'Barcode à¶¸à·™à¶­à¶±à¶§ à¶œà¶±à·Šà¶±'}
          </div>
        </div>
      )}

      {/* â”€â”€ HEADER â”€â”€ */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '14px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{ color: 'white', fontWeight: 'bold', fontSize: 17 }}
          >
            ðŸ“· Scanner
          </span>

          {/* Engine badge */}
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 999,
              background: useZxing
                ? 'rgba(139,92,246,0.3)'
                : 'rgba(34,197,94,0.3)',
              color: useZxing ? '#c4b5fd' : '#4ade80',
              border: `1px solid ${useZxing ? 'rgba(139,92,246,0.5)' : 'rgba(34,197,94,0.5)'}`,
            }}
          >
            {useZxing ? 'âš¡ ZXing' : 'ðŸš€ Native'}
          </span>

          {/* FPS badge */}
          {scanFps > 0 && !detectedCode && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
                background: 'rgba(59,130,246,0.25)',
                color: '#93c5fd',
                border: '1px solid rgba(59,130,246,0.4)',
              }}
            >
              {scanFps} fps
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              style={{
                background: torchOn
                  ? 'rgba(245,158,11,0.9)'
                  : 'rgba(51,65,85,0.85)',
                color: 'white',
                border: 'none',
                padding: '9px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 13,
                backdropFilter: 'blur(4px)',
              }}
            >
              {torchOn ? 'ðŸ”¦ ON' : 'ðŸ”¦ OFF'}
            </button>
          )}

          <button
            onClick={() => { stopScanner(); onClose?.(); }}
            style={{
              background: 'rgba(239,68,68,0.85)',
              color: 'white',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 13,
              backdropFilter: 'blur(4px)',
            }}
          >
            âœ• Close
          </button>
        </div>
      </div>

      {/* â”€â”€ BOTTOM SECTION â”€â”€ */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background:
            'linear-gradient(to top, rgba(0,0,0,0.92) 80%, transparent)',
          padding: '24px 16px 32px',
          zIndex: 10,
        }}
      >
        {/* Starting spinner */}
        {starting && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              marginBottom: 16,
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                border: '2.5px solid rgba(255,255,255,.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }}
            />
            Camera à¶†à¶»à¶¸à·Šà¶· à·€à·™à¶¸à·’à¶±à·Š...
          </div>
        )}

        {/* Status */}
        {!starting && status && (
          <div
            style={{
              textAlign: 'center',
              color: detectedCode ? '#4ade80' : '#e5e7eb',
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 12,
              animation: detectedCode ? 'fadeIn 0.3s ease' : 'none',
            }}
          >
            {status}
          </div>
        )}

        {/* Tips */}
        {!starting && !detectedCode && (
          <div
            style={{
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: 11,
              marginBottom: 14,
              lineHeight: 1.6,
            }}
          >
            ðŸ“ à·…à¶Ÿà¶§ / à¶ˆà¶­à¶§ à¶œà·™à¶±à·’à¶ºà¶±à·Šà¶± &nbsp;â€¢&nbsp;
            ðŸ’¡ à·„à·œà¶³ à¶†à¶½à·à¶šà¶ºà¶šà·Š &nbsp;â€¢&nbsp;
            ðŸ“µ Steady à¶­à¶¶à¶±à·Šà¶±
          </div>
        )}

        {/* Supported formats */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 3,
            marginBottom: 14,
          }}
        >
          {[
            'EAN-13', 'EAN-8', 'UPC-A', 'UPC-E',
            'CODE-128', 'CODE-39', 'QR', 'ITF',
            'DataMatrix', 'PDF417',
          ].map((fmt) => (
            <span
              key={fmt}
              style={{
                fontSize: 8,
                padding: '2px 5px',
                borderRadius: 3,
                background: 'rgba(34,197,94,0.12)',
                color: '#86efac',
                fontWeight: 600,
              }}
            >
              {fmt}
            </span>
          ))}
        </div>

        {/* Manual input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Barcode manually à¶‡à¶­à·”à·…à·” à¶šà¶»à¶±à·Šà¶±..."
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1.5px solid #334155',
              fontSize: 15,
              outline: 'none',
              background: 'rgba(30,41,59,0.9)',
              color: 'white',
              backdropFilter: 'blur(4px)',
            }}
          />
          <button
            onClick={handleManualSubmit}
            style={{
              padding: '12px 18px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            âœ… OK
          </button>
        </div>
      </div>
    </div>
  );
}
