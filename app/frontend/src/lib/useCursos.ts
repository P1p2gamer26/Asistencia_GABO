import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { db } from '../db/local';
import { ordenCurso } from './ordenCurso';

/**
 * Lista de cursos para los selectores de Consultas y Tablero. Sale de un resumen de
 * un solo dia: es la consulta mas barata que devuelve la lista completa, y evita
 * inventar un endpoint nuevo para esto. Si la peticion falla, usa los cursos de la
 * copia local.
 */
export function useCursos(): string[] {
  const [cursos, setCursos] = useState<string[]>([]);
  useEffect(() => {
    const hoy = new Date().toLocaleDateString('en-CA');
    api.get<{ grade: string }[]>(`/api/reports/summary?from=${hoy}&to=${hoy}`)
       .then((filas) => setCursos([...new Set(filas.map((f) => f.grade))].sort(ordenCurso)))
.catch(async () => {
          try {
            const grados = (await db.students.orderBy('grade').uniqueKeys()) as string[];
            setCursos(grados.sort(ordenCurso));
          } catch {
            setCursos([]);
          }
        });
  }, []);
  return cursos;
}
