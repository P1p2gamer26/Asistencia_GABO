export type Role = 'ADMIN' | 'COORDINADOR' | 'DOCENTE' | 'ACUDIENTE';
export type Status = 'P' | 'T' | 'F' | 'E';
export type DayType = 'LECTIVO' | 'FESTIVO' | 'VACACIONES' | 'INSTITUCIONAL' | 'SUSPENDIDO';

export type Session = {
  token: string; refreshToken: string; role: Role; fullName: string; userId: number;
  mustChangePassword: boolean;
};
export type Block = {
  id: number; grade: string; weekday: number; blockNo: number; subject: string; startTime: string;
  room?: string;
};
export type PendingBlock = { blockId: number; grade: string; subject: string; blockNo: number };
export type StudentDto = { id: number; documentId: string; fullName: string; grade: string };
export type SchoolDay = { calendarDate: string; dayType: DayType; description?: string; cycleDay?: number | null };
export type Bootstrap = { blocks: Block[]; students: StudentDto[]; schoolDays: SchoolDay[] };

export type SummaryRow = {
  studentId: number; documentId: string; fullName: string; grade: string;
  present: number; late: number; absent: number; evasion: number; schoolDays: number;
};
export type GradeBreakdown = {
  grade: string; present: number; late: number; absent: number; evasion: number;
};
export type Dashboard = {
  kpi: { attendanceRate: number; absentToday: number; evasionsWeek: number;
         blocksPending: number; schoolDays: number };
  byGrade: GradeBreakdown[];
  trend: { classDate: string; attendanceRate: number }[];
};

export type AdminUser = {
  id: number; email: string; fullName: string; role: Role; active: boolean;
};

export type ScheduleBlockAdmin = {
  id: number; grade: string; weekday: number; blockNo: number;
  subject: string; subjectId: number; startTime: string; endTime: string;
  room?: string; teacherId: number; teacherName: string;
  createdBy?: number; createdByName?: string; createdAt?: string;
  updatedBy?: number; updatedByName?: string; updatedAt?: string;
};
export type ImportResult = { imported: number; errors: string[] };

/** Fila del panel "Ver asistencia registrada": incluye quien la tomo y quien la corrigio.
 * `recordedByName`/`editedByName` vienen ausentes (no null-como-si-fuera-dato) cuando no hay autor. */
export type AttendanceDetalle = {
  id: string; studentId: number; fullName: string; documentId: string;
  status: Status; comment?: string;
  recordedByName?: string; recordedAt: string;
  editedByName?: string; editedAt?: string;
};

/** Orden de apilado y colores de estado. Validado; ver Task C2. No reordenar. */
export const ESTADOS: { valor: Status; etiqueta: string; color: string }[] = [
  { valor: 'P', etiqueta: 'Presente', color: '#14663b' },
  { valor: 'T', etiqueta: 'Tarde',    color: '#d29b16' },
  { valor: 'F', etiqueta: 'Falta',    color: '#c8503c' },
  { valor: 'E', etiqueta: 'Evasion',  color: '#7a5ea8' },
];

/** Una toma de asistencia ya hecha (bloque + fecha), para el panel lateral de /asistencia. */
export type AttendanceSesion = {
  blockId: number; grade: string; blockNo: number; subject?: string;
  classDate: string; total: number; recordedByName?: string; lastRecordedAt: string;
};

/** Un estudiante visto desde administracion: incluye los inactivos y los campos sueltos del nombre. */
export type StudentAdmin = {
  id: number; documentId: string; fullName: string;
  firstName: string; middleName?: string; lastName: string; secondSurname?: string;
  grade: string; active: boolean;
};
