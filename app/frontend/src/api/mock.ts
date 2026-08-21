import bootstrap from '../../../contracts/fixtures/bootstrap.json';
import summary from '../../../contracts/fixtures/summary.json';
import dashboard from '../../../contracts/fixtures/dashboard.json';

const RUTAS: [RegExp, unknown][] = [
  [/\/api\/auth\/(login|refresh)$/, {
    token: 'mock', refreshToken: 'mock', role: 'DOCENTE',
    fullName: 'Francisco Palacios', userId: 3,
  }],
  [/\/api\/sync\/bootstrap$/, bootstrap],
  [/\/api\/schedule\/mine$/, bootstrap.blocks],
  [/\/api\/reports\/summary/, summary],
  [/\/api\/reports\/dashboard/, dashboard],
  [/\/api\/attendance\/sync$/, { accepted: 99, rejected: [] }],
  [/\/api\/entry\/sync$/, { accepted: 1, rejected: [], names: {} }],
  [/\/api\/attendance/, []],
  [/\/api\/reports\/pending-today$/, []],
  [/\/api\/guardian\/children$/, []],
];

/** Intercepta fetch y responde con los fixtures del contrato. Solo con VITE_MOCK=1. */
export function instalarMock() {
  const real = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const match = RUTAS.find(([patron]) => patron.test(url));
    if (!match) return real(input, init);
    console.info('[mock]', url);
    await new Promise((r) => setTimeout(r, 120));   // latencia de mentira, util para ver spinners
    return new Response(JSON.stringify(match[1]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
}
