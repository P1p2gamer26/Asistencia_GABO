import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PanelHorario from './PanelHorario';

const BLOQUES = [
  { id: 1, grade: '601', weekday: 1, blockNo: 1, subject: 'Ciencias', subjectId: 2,
    startTime: '07:00', endTime: '07:50', room: 'A1', teacherId: 5, teacherName: 'Ana Ruiz',
    createdBy: 2, createdByName: 'Coordinacion GGM', createdAt: '2026-01-05T10:00:00Z' },
  { id: 2, grade: '602', weekday: 2, blockNo: 1, subject: 'Matematicas', subjectId: 3,
    startTime: '08:00', endTime: '08:50', teacherId: 6, teacherName: 'Luis Soto' },
];
const MATERIAS = [{ id: 2, name: 'Ciencias' }, { id: 3, name: 'Matematicas' }];
const DOCENTES = [
  { id: 5, email: 'a@ggm.edu.co', fullName: 'Ana Ruiz', role: 'DOCENTE', active: true },
  { id: 6, email: 'l@ggm.edu.co', fullName: 'Luis Soto', role: 'DOCENTE', active: true },
];

function respuesta(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos),
    { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(overrides: (url: string, init?: RequestInit) => Response | undefined) {
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const propia = overrides(u, init);
    if (propia) return propia;
    if (u.includes('/api/admin/schedule/subjects')) return respuesta(MATERIAS);
    if (u.includes('/api/admin/users')) return respuesta(DOCENTES);
    if (u.includes('/api/admin/schedule')) return respuesta(BLOQUES);
    return respuesta({});
  }));
}

describe('PanelHorario', () => {
  beforeEach(() => {
    localStorage.setItem('ggm.session', JSON.stringify({
      token: 't', refreshToken: 'r', role: 'ADMIN', fullName: 'Admin', userId: 1,
    }));
  });

  it('lista los bloques con quien los creo o modifico', async () => {
    mockFetch(() => undefined);
    render(<PanelHorario />);
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Ana Ruiz' })).toBeInTheDocument());
    expect(screen.getByText(/Coordinacion GGM/)).toBeInTheDocument();
  });

  it('un bloque sin autor se muestra como sin registro, no atribuido a nadie', async () => {
    mockFetch(() => undefined);
    render(<PanelHorario />);
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Luis Soto' })).toBeInTheDocument());
    expect(screen.getAllByText('Sin registro').length).toBeGreaterThan(0);
  });

  it('crear un bloque manda un POST', async () => {
    const posts: unknown[] = [];
    mockFetch((u, init) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return respuesta(BLOQUES[0]); }
      return undefined;
    });
    render(<PanelHorario />);
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Ana Ruiz' })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/^curso$/i), '701');
    await userEvent.clear(screen.getByLabelText(/dia/i));
    await userEvent.type(screen.getByLabelText(/dia/i), '3');
    await userEvent.clear(screen.getByLabelText(/^bloque$/i));
    await userEvent.type(screen.getByLabelText(/^bloque$/i), '2');
    const inicio = screen.getByLabelText(/hora inicio/i);
    const fin = screen.getByLabelText(/hora fin/i);
    fireEventTime(inicio, '09:00');
    fireEventTime(fin, '09:50');
    await userEvent.selectOptions(screen.getByLabelText(/materia/i), '2');
    await userEvent.selectOptions(screen.getByLabelText(/^docente$/i), '5');
    await userEvent.click(screen.getByRole('button', { name: /crear bloque/i }));

    await waitFor(() => expect(posts).toHaveLength(1));
  });

  it('un choque de horario muestra el mensaje del backend, no un generico', async () => {
    mockFetch((u, init) => {
      if (init?.method === 'POST') {
        return respuesta({ detail: 'El docente ya tiene clase de Ciencias con el curso 601 en ese mismo bloque horario' }, 409);
      }
      return undefined;
    });
    render(<PanelHorario />);
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Ana Ruiz' })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/^curso$/i), '701');
    fireEventTime(screen.getByLabelText(/hora inicio/i), '09:00');
    fireEventTime(screen.getByLabelText(/hora fin/i), '09:50');
    await userEvent.selectOptions(screen.getByLabelText(/materia/i), '2');
    await userEvent.selectOptions(screen.getByLabelText(/^docente$/i), '5');
    await userEvent.click(screen.getByRole('button', { name: /crear bloque/i }));

    await waitFor(() => expect(screen.getByRole('alert'))
      .toHaveTextContent(/docente ya tiene clase/i));
  });

  it('borrar un bloque con asistencia muestra por que no se pudo, sin destruirlo', async () => {
    mockFetch((u, init) => {
      if (init?.method === 'DELETE') {
        return respuesta({ detail: 'No se puede borrar: tiene 3 registro(s) de asistencia.' }, 409);
      }
      return undefined;
    });
    render(<PanelHorario />);
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Ana Ruiz' })).toBeInTheDocument());

    await userEvent.click(screen.getAllByRole('button', { name: /^borrar$/i })[0]);

    await waitFor(() => expect(screen.getByRole('alert'))
      .toHaveTextContent(/no se puede borrar/i));
    expect(screen.getByRole('cell', { name: 'Ana Ruiz' })).toBeInTheDocument();
  });
});

function fireEventTime(el: HTMLElement, value: string) {
  const input = el as HTMLInputElement;
  input.focus();
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
    .set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
