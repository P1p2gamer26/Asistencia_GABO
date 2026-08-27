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
type ZxReader = import('@zxing/browser').BrowserMultiFormatReader
  & { decodeFromCanvas?: (c: HTMLCanvasElement) => { getText(): string } };
let zxing: ZxReader | null = null;
async function lectorZxing(): Promise<ZxReader> {
  if (!zxing) {
    const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    // TRY_HARDER: mas pasadas por fotograma. Cuesta CPU pero decodifica QR pequenos,
    // borrosos o con poco contraste, que es justo el caso del carnet plastificado.
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    zxing = new BrowserMultiFormatReader(hints) as ZxReader;
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

// Un solo canvas reutilizado para no reservar memoria en cada fotograma.
const lienzo = document.createElement('canvas');
const pincel = lienzo.getContext('2d', { willReadFrequently: true });

/** Dibuja una zona del video en el lienzo, ampliada, y devuelve el lienzo. */
function recortar(video: HTMLVideoElement, frac: number, escala: number): HTMLCanvasElement {
  const vw = video.videoWidth, vh = video.videoHeight;
  const lado = Math.max(1, Math.floor(Math.min(vw, vh) * frac));
  const sx = Math.floor((vw - lado) / 2), sy = Math.floor((vh - lado) / 2);
  lienzo.width = lado * escala; lienzo.height = lado * escala;
  if (pincel) {
    pincel.imageSmoothingEnabled = false;
    pincel.drawImage(video, sx, sy, lado, lado, 0, 0, lienzo.width, lienzo.height);
  }
  return lienzo;
}

async function decodificar(fuente: HTMLCanvasElement, nativo: Detector | null,
                           zx: ZxReader | null): Promise<string | null> {
  if (nativo) {
    const [hit] = await nativo.detect(fuente);
    return hit?.rawValue ?? null;
  }
  if (zx?.decodeFromCanvas) {
    try { return zx.decodeFromCanvas(fuente).getText(); } catch { return null; }
  }
  return null;
}

/** Escanea hasta encontrar un codigo. Devuelve el texto crudo del carnet. */
export async function scanOnce(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const nativo = await detectorNativo();
  const zx = nativo ? null : await lectorZxing();

  // Sin canvas (o un ZXing viejo sin decodeFromCanvas) se cae al modo de siempre:
  // ZXing leyendo el video completo. Menos fino con QR pequenos, pero funciona.
  if (!nativo && !(pincel && zx?.decodeFromCanvas)) {
    const reader = await lectorZxing();
    return (await reader.decodeOnceFromVideoElement(video)).getText();
  }

  while (!signal.aborted) {
    if (video.readyState >= 2 && video.videoWidth > 0) {
      // 1. Recorte central ampliado: el QR pequeno ocupa muchos mas pixeles del area
      //    analizada, que es lo que decide si un codigo diminuto entra. Es la mejora
      //    que mas ayuda con el carnet, donde el QR es una fraccion de la tarjeta.
      const centro = await decodificar(recortar(video, 0.5, 2), nativo, zx);
      if (centro) return centro;
      // 2. Fotograma completo por si el carnet quedo fuera del recuadro.
      const todo = await decodificar(recortar(video, 1, 1), nativo, zx);
      if (todo) return todo;
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
    // Zoom optico/hibrido: agranda el QR conservando calidad, mejor que solo recortar.
    if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
      avanzado.push({ zoom: Math.min(caps.zoom.max, Math.max(caps.zoom.min, 2)) } as never);
    }
    if (avanzado.length) await track.applyConstraints({ advanced: avanzado });
  } catch { /* sin enfoque/zoom: se sigue pudiendo escanear */ }

  video.srcObject = stream;
  await video.play();
  return stream;
}

/** La camara trae linterna (torch). Ayuda con un carnet a contraluz o en penumbra. */
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
