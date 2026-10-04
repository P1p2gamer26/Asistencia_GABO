import bootstrap from '../../../contracts/fixtures/bootstrap.json';
import summary from '../../../contracts/fixtures/summary.json';
import dashboard from '../../../contracts/fixtures/dashboard.json';

const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = () => fechaLocal(new Date());

function makeMyDay() {
  const fecha = hoy();
  return {
    lectivo: true,
    fecha,
    motivo: null,
    bloques: [
      { id: 1, blockNo: 1, grade: '601', subject: 'Matemáticas', room: 'A-101', startTime: '07:00', endTime: '07:50', marcados: 0, estudiantes: 32 },
      { id: 2, blockNo: 2, grade: '601', subject: 'Español', room: 'A-101', startTime: '07:50', endTime: '08:40', marcados: 18, estudiantes: 32 },
      { id: 3, blockNo: 3, grade: '602', subject: 'Ciencias', room: 'B-203', startTime: '08:40', endTime: '09:30', marcados: 32, estudiantes: 32 },
      { id: 4, blockNo: 4, grade: '701', subject: 'Inglés', room: 'C-305', startTime: '09:30', endTime: '10:20', marcados: 25, estudiantes: 32 },
    ],
  };
}

function makePendingRecent() {
  const fecha = hoy();
  return {
    grupos: [
      { fecha, grade: '601', listas: 2 },
      { fecha, grade: '701', listas: 1 },
    ],
    totalGrupos: 2,
  };
}

function makeResumenHoy() {
  const fecha = hoy();
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const mesPorDia: { classDate: string; late: number; absent: number; evasion: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(year, month, i + 1);
    const iso = fechaLocal(d);
    // Solo dias laborables (lunes a viernes)
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      mesPorDia.push({
        classDate: iso,
        late: Math.floor(Math.random() * 5),
        absent: Math.floor(Math.random() * 8),
        evasion: Math.floor(Math.random() * 3),
      });
    }
  }
  // Rellenar si faltan dias para llegar a 10
  while (mesPorDia.length < 10) {
    const d = new Date(year, month, mesPorDia.length + 1);
    const iso = fechaLocal(d);
    mesPorDia.push({
      classDate: iso,
      late: Math.floor(Math.random() * 5),
      absent: Math.floor(Math.random() * 8),
      evasion: Math.floor(Math.random() * 3),
    });
  }
  return {
    lectivo: true,
    fecha,
    bloquesEsperados: 4,
    bloquesMarcados: 3,
    presentes: 280,
    tarde: 15,
    ausentes: 8,
    evasiones: 3,
    ingresos: 5,
    mesAsistencia: 92.5,
    mesDiasLectivos: 18,
    mesPresentes: 5040,
    mesTarde: 270,
    mesAusentes: 144,
    mesEvasiones: 54,
    mesPorCurso: [
      { grade: '601', present: 540, late: 30, absent: 12, evasion: 6, attendanceRate: 93.2, sinRegistros: false },
      { grade: '602', present: 520, late: 25, absent: 10, evasion: 4, attendanceRate: 94.1, sinRegistros: false },
      { grade: '701', present: 480, late: 20, absent: 15, evasion: 5, attendanceRate: 91.8, sinRegistros: false },
    ],
    mesPorDia,
  };
}

function makeNovedades() {
  const fecha = hoy();
  return {
    evasiones: [
      { studentId: 101, fullName: 'Carlos Mendoza', grade: '601', classDate: fecha, subject: 'Matemáticas', comment: 'Salió sin permiso a las 08:15' },
      { studentId: 102, fullName: 'Laura Gómez', grade: '602', classDate: fecha, subject: 'Ciencias', comment: 'No regresó del recreo' },
      { studentId: 103, fullName: 'Pedro Ruiz', grade: '701', classDate: fecha, subject: null, comment: 'Ausente en 2 bloques consecutivos' },
    ],
    ausencias: [
      { studentId: 201, fullName: 'Ana Torres', grade: '601', classDate: fecha, subject: 'Español', comment: 'Enfermedad justificada' },
      { studentId: 202, fullName: 'Miguel Vargas', grade: '701', classDate: fecha, subject: 'Inglés', comment: 'Cita médica' },
    ],
    sinRegistros: false,
  };
}

function makeSchoolDays() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const days: { calendarDate: string; dayType: 'LECTIVO' | 'FESTIVO' | 'VACACIONES' | 'INSTITUCIONAL' | 'SUSPENDIDO'; description?: string; cycleDay?: number | null; cycleDayFixed?: number | null }[] = [];
  let cycleDay = 1;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      const iso = fechaLocal(d);
      days.push({ calendarDate: iso, dayType: 'LECTIVO', cycleDay: cycleDay, cycleDayFixed: cycleDay });
      cycleDay = cycleDay === 6 ? 1 : cycleDay + 1;
    }
  }
  const festivoDate = new Date(year, month, 12);
  if (festivoDate >= firstDay && festivoDate <= lastDay) {
    const iso = fechaLocal(festivoDate);
    const idx = days.findIndex(x => x.calendarDate === iso);
    if (idx >= 0) {
      days[idx] = { calendarDate: iso, dayType: 'FESTIVO', description: 'Día de la Raza', cycleDay: null, cycleDayFixed: null };
    }
  }
  return days;
}

function makeAdminUsers() {
  return [
    { id: 1, email: 'admin@colegio.edu.co', fullName: 'María Rodríguez', role: 'ADMIN', active: true },
    { id: 2, email: 'docente1@colegio.edu.co', fullName: 'Juan Pérez', role: 'DOCENTE', active: true },
    { id: 3, email: 'docente2@colegio.edu.co', fullName: 'Carmen López', role: 'DOCENTE', active: true },
    { id: 4, email: 'docente3@colegio.edu.co', fullName: 'Roberto Silva', role: 'DOCENTE', active: true },
    { id: 5, email: 'acudiente1@colegio.edu.co', fullName: 'Patricia González', role: 'ACUDIENTE', active: true },
    { id: 6, email: 'acudiente2@colegio.edu.co', fullName: 'Andrés Martínez', role: 'ACUDIENTE', active: true },
  ];
}

const RUTAS: [RegExp, (() => unknown) | unknown][] = [
  [/\/api\/auth\/(login|refresh)$/, {
    token: 'mock', refreshToken: 'mock', role: 'DOCENTE',
    fullName: 'Francisco Palacios', userId: 3,
  }],
  [/\/api\/sync\/bootstrap$/, () => ({
    blocks: [1, 2, 3, 4, 5, 6].flatMap((dia) => [
      { id: dia * 10 + 1, grade: '601', weekday: dia, blockNo: 1, subject: 'Matematicas', startTime: '06:30', room: 'A-101' },
      { id: dia * 10 + 2, grade: '701', weekday: dia, blockNo: 3, subject: 'Ingles', startTime: '08:10', room: 'C-305' },
    ]),
    students: [...bootstrap.students, ...['MARIANA CASTRO RUIZ', 'SANTIAGO DIAZ MORENO', 'VALENTINA GOMEZ PARRA',
      'SAMUEL HERRERA LOPEZ', 'ISABELLA JIMENEZ ROJAS', 'MATIAS LOZANO VEGA', 'SOFIA MARTINEZ CRUZ',
      'TOMAS NIETO SALAZAR', 'GABRIELA ORTIZ PENA', 'EMILIANO QUINTERO SOSA']
      .map((fullName, i) => ({ id: 3 + i, documentId: String(1010101012 + i), fullName, grade: i < 7 ? '601' : '701' }))],
    schoolDays: makeSchoolDays(),
  })],
  [/\/api\/schedule\/mine$/, bootstrap.blocks],
  [/\/api\/reports\/summary/, summary],
  [/\/api\/reports\/dashboard/, dashboard],
  [/\/api\/schedule\/my-day$/, makeMyDay],
  [/\/api\/reports\/pending-recent$/, makePendingRecent],
  [/\/api\/reports\/today$/, makeResumenHoy],
  [/\/api\/reports\/novedades(\?|$)/, makeNovedades],
  [/\/api\/calendar\/school-days(\?|$)/, makeSchoolDays],
  [/\/api\/admin\/users(\?|$)/, makeAdminUsers],
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
    const data = typeof match[1] === 'function' ? match[1]() : match[1];
    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
}
