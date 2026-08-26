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
    const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    // TRY_HARDER: mas pasadas por fotograma. Cuesta CPU pero decodifica QR pequenos,
    // borrosos o con poco contraste, que es justo el caso del carnet.
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    zxing = new BrowserMultiFormatReader(hints);
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
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('Escaneo cancelado');
}

export async function abrirCamara(video: HTMLVideoElement): Promise<MediaStream> {
  // Resolucion alta: un QR de carnet ocupa muy pocos pixeles, y con 640x480 (el
  // defecto) casi nunca decodifica. Pedimos hasta 4K trasera; el navegador entrega
  // lo mejor que pueda.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 2560 },
      height: { ideal: 1440 },
    },
  }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));

  const track = stream.getVideoTracks()[0];
  try {
    const caps = track.getCapabilities?.() as
      { focusMode?: string[]; zoom?: { min: number; max: number; step: number } } | undefined;
    const avanzado: MediaTrackConstraintSet[] = [];
    // Enfoque continuo: sin el, el carnet queda borroso justo a la distancia de lectura.
    if (caps?.focusMode?.includes('continuous')) avanzado.push({ focusMode: 'continuous' } as never);
    // Zoom moderado: es lo que mas ayuda con un QR pequeno, porque agranda el codigo
    // antes de decodificar. 2x cuando el equipo lo soporta.
    if (caps?.zoom && caps.zoom.max >= 2) avanzado.push({ zoom: 2 } as never);
    if (avanzado.length) await track.applyConstraints({ advanced: avanzado });
  } catch { /* sin enfoque/zoom: se sigue pudiendo escanear */ }

  video.srcObject = stream;
  await video.play();
  return stream;
}

/** La camara trae linterna (torch). Ayuda mucho con un carnet plastificado o a contraluz. */
export function tieneLinterna(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
  return Boolean(caps?.torch);
}

export async function alternarLinterna(stream: MediaStream, encender: boolean): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  await track.applyConstraints({ advanced: [{ torch: encender } as never] });
}
