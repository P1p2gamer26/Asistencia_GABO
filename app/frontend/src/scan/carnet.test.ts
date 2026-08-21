import { describe, it, expect } from 'vitest';
import { parseCarnet } from './carnet';

describe('parseCarnet', () => {
  it('saca documento, nombre y curso del carnet real', () => {
    expect(parseCarnet('Álvaro Mathias Orozco Lara 1013696566 Primero - 103')).toEqual({
      documentId: '1013696566',
      nombre: 'Álvaro Mathias Orozco Lara',
      curso: 'Primero - 103',
    });
  });

  it('acepta un QR que solo trae el numero', () => {
    expect(parseCarnet('1013696566')).toEqual({
      documentId: '1013696566',
      nombre: '',
      curso: '',
    });
  });

  it('normaliza espacios y saltos de linea del carnet', () => {
    expect(parseCarnet('  Ana\n Lopez \t1002003004\n 601 ')).toEqual({
      documentId: '1002003004',
      nombre: 'Ana Lopez',
      curso: '601',
    });
  });

  it('toma el primer numero largo cuando el curso tambien tiene digitos', () => {
    expect(parseCarnet('Orozco Lara 1013696566 Primero - 103')!.documentId)
      .toBe('1013696566');
  });

  it('ignora numeros cortos que no son documento', () => {
    expect(parseCarnet('Juan Perez 601')).toBeNull();
  });

  it('devuelve null con texto vacio o sin numeros', () => {
    expect(parseCarnet('')).toBeNull();
    expect(parseCarnet('carnet ilegible')).toBeNull();
  });
});
