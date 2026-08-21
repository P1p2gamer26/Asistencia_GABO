import { describe, expect, it } from 'vitest';
import { segmentosApilados, puntosLinea, dominioY } from './geometria';

describe('geometria de las graficas', () => {
  it('los segmentos apilados cubren exactamente el ancho disponible', () => {
    const segs = segmentosApilados({ present: 30, late: 10, absent: 8, evasion: 2 }, 200);
    expect(segs).toHaveLength(4);
    expect(segs[0].x).toBe(0);
    const ultimo = segs[3];
    expect(ultimo.x + ultimo.ancho).toBeCloseTo(200, 5);
  });

  it('mantiene el orden P, T, F, E', () => {
    const segs = segmentosApilados({ present: 1, late: 1, absent: 1, evasion: 1 }, 100);
    expect(segs.map((s) => s.estado)).toEqual(['P', 'T', 'F', 'E']);
  });

  it('un curso sin registros no dibuja nada en vez de dividir por cero', () => {
    const segs = segmentosApilados({ present: 0, late: 0, absent: 0, evasion: 0 }, 200);
    expect(segs).toEqual([]);
  });

  it('la linea escala los puntos dentro del lienzo', () => {
    const pts = puntosLinea([
      { classDate: '2026-07-06', attendanceRate: 90 },
      { classDate: '2026-07-07', attendanceRate: 100 },
      { classDate: '2026-07-08', attendanceRate: 80 },
    ], 300, 100);

    expect(pts[0].x).toBe(0);
    expect(pts[2].x).toBeCloseTo(300, 5);
    // 100 % es el punto mas alto => y minimo; 80 % el mas bajo => y maximo
    expect(pts[1].y).toBeLessThan(pts[0].y);
    expect(pts[2].y).toBe(100);
    pts.forEach((p) => { expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(100); });
  });

  it('un solo dia no revienta la escala', () => {
    const pts = puntosLinea([{ classDate: '2026-07-06', attendanceRate: 95 }], 300, 100);
    expect(pts).toHaveLength(1);
    expect(Number.isFinite(pts[0].x)).toBe(true);
    expect(Number.isFinite(pts[0].y)).toBe(true);
  });

  it('con un solo dia el dominio no queda plano', () => {
    const d = dominioY([{ attendanceRate: 50 }]);
    expect(d.max).toBeGreaterThan(d.min);
    expect(d.min).toBeLessThanOrEqual(50);
    expect(d.max).toBeGreaterThanOrEqual(50);
  });

  it('con todos los valores iguales tampoco queda plano', () => {
    const d = dominioY([{ attendanceRate: 92 }, { attendanceRate: 92 }]);
    expect(d.max).toBeGreaterThan(d.min);
  });

  it('nunca se sale de 0 a 100', () => {
    expect(dominioY([{ attendanceRate: 100 }]).max).toBeLessThanOrEqual(100);
    expect(dominioY([{ attendanceRate: 0 }]).min).toBeGreaterThanOrEqual(0);
  });

  it('con rango real lo respeta tal cual', () => {
    const d = dominioY([{ attendanceRate: 88 }, { attendanceRate: 96 }]);
    expect(d.min).toBe(88);
    expect(d.max).toBe(96);
  });

  it('una serie vacia sigue devolviendo 0 a 100', () => {
    expect(dominioY([])).toEqual({ min: 0, max: 100 });
  });
});
