type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts: { formats: string[] }): Detector;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13'];

// El lector ZXing es pesado y solo se necesita en navegadores sin BarcodeDetector
// (Safari de iPhone, sobre todo). Se crea una sola vez y se reutiliza.
let zxing: import('@zxing/browser').BrowserMultiFormatReader | null = null;
async function lectorZxing() {
  if (!zxing) {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    zxing = new BrowserMultiFormatReader();
  }
  return zxing;
}

// null = aun no se sabe; true/false = si el detector nativo sirve para estos formatos.
let nativoSirve: boolean | null = null;
async function detectorNativo(): Promise<Detector | null> {
  if (nativoSirve === false || !window.BarcodeDetector) return null;
  try {
    const soportados = (await window.BarcodeDetector.getSupportedFormats?.()) ?? FORMATOS;
    const usables = FORMATOS.filter((f) => soportados.includes(f));
    if (usables.length === 0) { nativoSirve = false; return null; }
    nativoSirve = true;
    return new window.BarcodeDetector({ formats: usables });
  } catch {
    nativoSirve = false;                 // el navegador lo anuncia pero falla al crearlo
    return null;
  }
}

/** Escanea hasta encontrar un codigo. Devuelve el texto crudo del carnet. */
export async function scanOnce(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const nativo = await detectorNativo();
  if (nativo) {
    try {
      return await scanNativo(nativo, video, signal);
    } catch (e) {
      if (signal.aborted) throw e;
      nativoSirve = false;               // fallo en caliente: de aqui en mas, ZXing
    }
  }
  const reader = await lectorZxing();
  const result = await reader.decodeOnceFromVideoElement(video);
  return result.getText();
}

async function scanNativo(detector: Detector, video: HTMLVideoElement,
                          signal: AbortSignal): Promise<string> {
  while (!signal.aborted) {
    // Detectar sobre un video sin fotograma listo devuelve vacio para siempre.
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const [hit] = await detector.detect(video);
      if (hit?.rawValue) return hit.rawValue;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Escaneo cancelado');
}

export async function abrirCamara(video: HTMLVideoElement): Promise<MediaStream> {
  // Resolucion alta: un QR de carnet a un palmo de distancia ocupa pocos pixeles, y
  // con 640x480 (el defecto) casi nunca decodifica. Pedimos 1080p y camara trasera;
  // si el equipo no puede, el navegador entrega lo que tenga.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));

  // Enfoque continuo cuando el dispositivo lo permite: sin el, el carnet queda borroso
  // justo a la distancia a la que se lee. Es opcional; si no existe, no pasa nada.
  const track = stream.getVideoTracks()[0];
  try {
    const caps = track.getCapabilities?.() as { focusMode?: string[] } | undefined;
    if (caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as never] });
    }
  } catch { /* enfoque manual, se sigue pudiendo escanear */ }

  video.srcObject = stream;
  await video.play();
  return stream;
}
