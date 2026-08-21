type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13'];

/** Escanea hasta encontrar un codigo. Devuelve el texto crudo del carnet. */
export async function scanOnce(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  if (window.BarcodeDetector) return scanNativo(video, signal);
  const { BrowserMultiFormatReader } = await import('@zxing/browser');   // solo si hace falta
  const reader = new BrowserMultiFormatReader();
  const result = await reader.decodeOnceFromVideoElement(video);
  return result.getText();
}

async function scanNativo(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const detector = new window.BarcodeDetector!({ formats: FORMATOS });
  while (!signal.aborted) {
    const [hit] = await detector.detect(video);
    if (hit) return hit.rawValue;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Escaneo cancelado');
}

export async function abrirCamara(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}
