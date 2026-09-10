import { describe, expect, it } from 'vitest';
import { ordenCurso } from './ordenCurso';

/**
 * Los mismos casos que OrdenCursoTest.java. Las dos capas ordenan las mismas listas
 * de cursos (el backend en los reportes, el frontend en los selectores), asi que
 * tienen que dar exactamente el mismo orden.
 */
describe('ordenCurso', () => {
  it('ordena los codigos reales del colegio como los lee una persona', () => {
    const cursos = ['1001', '101', '1102', '601', '9901', 'PJ01', 'T01', 'J02',
                    '201', '902', 'PB01'];

    expect([...cursos].sort(ordenCurso)).toEqual(
      ['PJ01', 'J02', 'T01', '101', '201', '601', '902', '1001', '1102', '9901',
       'PB01'],
    );
  });

  it('sigue ordenando el formato "<grado><paralelo>"', () => {
    expect(['11B', '9A', '0A', '10A', '9B'].sort(ordenCurso))
      .toEqual(['0A', '9A', '9B', '10A', '11B']);
  });

  it('lo que no calza con ningun formato queda al final, sin desaparecer', () => {
    const cursos = ['Transicion', '601', 'PJ01'];

    expect([...cursos].sort(ordenCurso)).toEqual(['PJ01', '601', 'Transicion']);
  });
});
