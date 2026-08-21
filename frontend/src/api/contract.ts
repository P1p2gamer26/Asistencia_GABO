export type Role = 'ADMIN' | 'COORDINADOR' | 'DOCENTE' | 'ACUDIENTE';
export type Status = 'P' | 'T' | 'F' | 'E';
export type DayType = 'LECTIVO' | 'FESTIVO' | 'VACACIONES' | 'INSTITUCIONAL' | 'SUSPENDIDO';

export type Session = {
  token: string; refreshToken: string; role: Role; fullName: string; userId: number;
};
export type Block = {
  id: number; grade: string; weekday: number; blockNo: number; subject: string; startTime: string;
};
export type StudentDto = { id: number; documentId: string; fullName: string; grade: string };
export type SchoolDay = { calendarDate: string; dayType: DayType; description?: string };
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

/** Orden de apilado y colores de estado. Validado; ver Task C2. No reordenar. */
export const ESTADOS: { valor: Status; etiqueta: string; color: string }[] = [
  { valor: 'P', etiqueta: 'Presente', color: '#0ca30c' },
  { valor: 'T', etiqueta: 'Tarde',    color: '#fab219' },
  { valor: 'F', etiqueta: 'Falta',    color: '#d03b3b' },
  { valor: 'E', etiqueta: 'Evasion',  color: '#ec835a' },
];
