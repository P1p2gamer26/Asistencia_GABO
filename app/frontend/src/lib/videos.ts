import type { Role } from '../api/contract';

const TODOS: Role[] = ['ADMIN', 'DOCENTE', 'ACUDIENTE'];
const DOCENTES: Role[] = ['ADMIN', 'DOCENTE'];

export const VIDEOS: { src: string; titulo: string; duracion: string; texto: string; roles: Role[] }[] = [
  { src: '/videos/promo.mp4', titulo: 'Conozca el colegio', duracion: '0:55',
    texto: 'Tomas aéreas y del patio del Colegio Gabriel García Márquez.', roles: TODOS },
  { src: '/videos/piloto-docentes.mp4', titulo: 'Prueba piloto: la app en su celular', duracion: '3:23',
    texto: 'Instalar la aplicación, entrar con la clave temporal y tomar la lista, paso a paso.', roles: DOCENTES },
  { src: '/videos/tutorial-docentes.mp4', titulo: 'Tutorial para docentes', duracion: '2:44',
    texto: 'Cómo tomar la lista de clase desde el celular, con o sin internet.', roles: DOCENTES },
  { src: '/videos/tutorial-coordinacion.mp4', titulo: 'Tutorial para coordinación', duracion: '3:10',
    texto: 'Panorama del día, ingreso al colegio, consultas y reportes.', roles: ['ADMIN'] },
  { src: '/videos/tutorial-carga-datos.mp4', titulo: 'Coordinación: cargar los datos', duracion: '4:51',
    texto: 'Cómo preparar en Excel los archivos de estudiantes, horario y acudientes, subirlos y mantener el calendario.', roles: ['ADMIN'] },
  { src: '/videos/tutorial-padres.mp4', titulo: 'Tutorial para familias', duracion: '1:30',
    texto: 'Cómo entrar como acudiente y consultar la asistencia de sus hijos.', roles: TODOS },
];
