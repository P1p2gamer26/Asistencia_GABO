import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/local';
import { MemoryRouter } from 'react-router-dom';
import TomarAsistencia from './TomarAsistencia';

const HOY = new Date().toLocaleDateString('en-CA');

describe('TomarAsistencia', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.blocks.clear();
    await db.students.clear();
    await db.schoolDays.clear();

    await db.schoolDays.bulkPut([
      { calendarDate: HOY, dayType: 'LECTIVO' },
      { calendarDate: '2026-08-17', dayType: 'LECTIVO' },   // lunes
      { calendarDate: '2026-08-18', dayType: 'LECTIVO' },   // martes
    ]);
    await db.blocks.bulkPut([
      { id: 1, grade: '601', weekday: 1, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 2, grade: '601', weekday: 2, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 3, grade: '601', weekday: 3, blockNo: 4, subject: 'Ciencias', startTime: '09:00' },
      { id: 4, grade: '602', weekday: 1, blockNo: 2, subject: 'Espanol', startTime: '07:20' },
    ]);
    await db.students.bulkPut([
      { id: 10, documentId: '111', fullName: 'ANA LOPEZ', grade: '601' },
      { id: 11, documentId: '222', fullName: 'BETO RUIZ', grade: '601' },
      { id: 12, documentId: '333', fullName: 'CARLA DIAZ', grade: '602' },
    ]);
  });

  it('sin curso elegido no muestra estudiantes', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    expect(await screen.findByText(/elija curso y bloque/i)).toBeInTheDocument();
  });

  it('al elegir curso y bloque muestra solo los estudiantes de ese curso', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    expect(await screen.findByText('ANA LOPEZ')).toBeInTheDocument();
    expect(screen.getByText('BETO RUIZ')).toBeInTheDocument();
    expect(screen.queryByText('CARLA DIAZ')).not.toBeInTheDocument();
  });

  it('los botones de estado muestran la palabra completa y el seleccionado se distingue sin depender del color', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    const grupo = await screen.findByRole('group', { name: /ANA LOPEZ/i });
    const botonPresente = within(grupo).getByRole('button', { name: /presente/i });
    const botonFalta = within(grupo).getByRole('button', { name: /falta/i });
    expect(within(grupo).getByRole('button', { name: /^tarde$/i })).toBeInTheDocument();
    expect(within(grupo).getByRole('button', { name: /^evasion$/i })).toBeInTheDocument();

    // Sin marcar nada, Presente queda seleccionado por defecto: el nombre
    // accesible ya lleva la marca de verificacion, no solo el color de fondo.
    expect(botonPresente).toHaveAccessibleName('✓ Presente');
    expect(botonFalta).toHaveAccessibleName('Falta');

    await userEvent.click(botonFalta);

    await waitFor(() => expect(botonFalta).toHaveAccessibleName('✓ Falta'));
    expect(botonPresente).toHaveAccessibleName('Presente');
  });

  it('marcar una falta la deja en la cola local, sin tocar la red', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), '1');

    const grupo = await screen.findByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /falta/i }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      expect(cola).toHaveLength(1);
      expect(cola[0].studentId).toBe(10);
      expect(cola[0].status).toBe('F');
    });
  });

  it('el curso ofrecido es solo el del horario del docente', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
    const opciones = Array.from(screen.getByLabelText(/curso/i).querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(opciones.sort()).toEqual(['601', '602']);
  });

  it('solo ofrece los bloques del dia de la fecha elegida', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() => {
      const opciones = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.value).filter(Boolean);
      // De los tres bloques de 601, solo el del lunes (id 1)
      expect(opciones).toEqual(['1']);
    });
  });

  it('al cambiar de dia cambian los bloques ofrecidos', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(
      screen.getByLabelText(/curso/i).querySelectorAll('option').length).toBeGreaterThan(1));
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-18');   // martes

    await waitFor(() => {
      const opciones = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.value).filter(Boolean);
      expect(opciones).toEqual(['2']);
    });
  });

  it('nunca ofrece dos opciones con el mismo texto', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() => {
      const textos = Array.from(
        screen.getByLabelText(/bloque/i).querySelectorAll('option'))
        .map((o) => o.textContent ?? '').filter((t) => !t.includes('Seleccione'));
      // Este es el bug que motivo la tarea: cinco opciones "4. Ciencias (09:00)"
      // identicas, y elegir la equivocada guardaba la asistencia en otro dia.
      expect(new Set(textos).size).toBe(textos.length);
    });
  });

  it('la opcion dice tambien el dia', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');

    await waitFor(() =>
      expect(screen.getByLabelText(/bloque/i)).toHaveTextContent(/lunes/i));
  });

  async function elegirCursoYBloque() {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/fecha/i));
    await userEvent.type(screen.getByLabelText(/fecha/i), '2026-08-17');   // lunes
    await userEvent.selectOptions(screen.getByLabelText(/curso/i), '601');
    await waitFor(() => expect(screen.getByLabelText(/bloque/i)).not.toBeDisabled());
    const opciones = Array.from(screen.getByLabelText(/bloque/i).querySelectorAll('option'))
      .map((o) => o.value).filter(Boolean);
    await userEvent.selectOptions(screen.getByLabelText(/bloque/i), opciones[0]);
    await screen.findByText('ANA LOPEZ');
  }

  it('enviar registra a TODOS los estudiantes, no solo a los tocados', async () => {
    await elegirCursoYBloque();

    // Se marca una sola falta; los demas se quedan como estan (presentes por defecto).
    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /falta/i }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      // Este era el defecto: quedaba 1 registro de un curso de 2 estudiantes.
      expect(cola).toHaveLength(2);
    });
    const cola = await db.outbox.toArray();
    expect(cola.find((r) => r.studentId === 10)?.status).toBe('F');
    expect(cola.find((r) => r.studentId === 11)?.status).toBe('P');
  });

  it('un curso que asiste completo tambien se puede enviar', async () => {
    await elegirCursoYBloque();

    // Sin tocar nada: antes el boton estaba deshabilitado y no se podia registrar nada.
    const boton = screen.getByRole('button', { name: /enviar asistencia/i });
    expect(boton).not.toBeDisabled();
    await userEvent.click(boton);

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      expect(cola).toHaveLength(2);
      expect(cola.every((r) => r.status === 'P')).toBe(true);
    });
  });

  it('el boton dice cuantos se van a enviar, no cuantos se tocaron', async () => {
    await elegirCursoYBloque();
    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /falta/i }));

    // Con 2 estudiantes en el curso y 1 tocado, debe anunciar 2.
    expect(screen.getByRole('button', { name: /enviar asistencia \(2\)/i })).toBeInTheDocument();
  });

  it('sin bloque elegido no ofrece enviar', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(/curso/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /enviar asistencia/i })).toBeDisabled();
  });

  it('enviar conserva el motivo que el docente escribio', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /tarde/i }));

    const motivo = await screen.findByLabelText(/motivo/i);
    await userEvent.type(motivo, 'El bus se demoro');
    await userEvent.tab();

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const cola = await db.outbox.toArray();
      const ana = cola.find((r) => r.studentId === 10);
      // El defecto: enviar reconstruia los registros y perdia el motivo.
      expect(ana?.comment).toBe('El bus se demoro');
      expect(ana?.status).toBe('T');
    });
  });

  it('el motivo sobrevive a que el docente corrija el estado', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /tarde/i }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'El bus se demoro');
    await userEvent.tab();

    // Se lo piensa mejor y lo pone como falta
    await userEvent.click(within(grupo).getByRole('button', { name: /falta/i }));
    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const ana = (await db.outbox.toArray()).find((r) => r.studentId === 10);
      expect(ana?.status).toBe('F');
      expect(ana?.comment).toBe('El bus se demoro');
    });
  });

  it('volver a presente borra el motivo, que ya no tiene sentido', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /tarde/i }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'El bus se demoro');
    await userEvent.tab();
    await userEvent.click(within(grupo).getByRole('button', { name: /presente/i }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const ana = (await db.outbox.toArray()).find((r) => r.studentId === 10);
      expect(ana?.status).toBe('P');
      // Un motivo de tardanza en alguien que llego a tiempo confunde al acudiente.
      expect(ana?.comment).toBeFalsy();
    });
  });

  it('al marcar evasion aparece el campo de motivo', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /evasion/i }));

    const motivo = await screen.findByLabelText(/motivo/i);
    await userEvent.type(motivo, 'Se salio con otro companero');
    expect(motivo).toHaveValue('Se salio con otro companero');
  });

  it('el motivo de una evasion llega en el envio', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /evasion/i }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'Se salio con otro companero');
    await userEvent.tab();

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const ana = (await db.outbox.toArray()).find((r) => r.studentId === 10);
      expect(ana?.status).toBe('E');
      expect(ana?.comment).toBe('Se salio con otro companero');
    });
  });

  it('pasar de evasion a presente borra el motivo', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: /evasion/i }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'Se salio con otro companero');
    await userEvent.tab();
    await userEvent.click(within(grupo).getByRole('button', { name: /presente/i }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const ana = (await db.outbox.toArray()).find((r) => r.studentId === 10);
      expect(ana?.status).toBe('P');
      expect(ana?.comment).toBeFalsy();
    });
  });

  it('enviar sin conexion confirma que la lista quedo guardada en el telefono', async () => {
    await elegirCursoYBloque();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    // Este es el aviso que pedian en el colegio: offline no se tocan 40 botones y
    // "esperemos que se haya guardado"; el docente debe saber que el trabajo quedo.
    expect(await screen.findByText(/guardada en el telefono/i)).toBeInTheDocument();
    expect(screen.getByText(/se subira sola cuando haya conexion/i)).toBeInTheDocument();
  });

  it('enviar con conexion confirma que la lista llego al servidor', async () => {
    await elegirCursoYBloque();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/attendance/sync')) {
        const records = (JSON.parse(String(init?.body)) as { records: unknown[] }).records;
        return new Response(JSON.stringify({ accepted: records.length, rejected: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    expect(await screen.findByText(/enviada al servidor/i)).toBeInTheDocument();
  });

  it('al abrir un bloque ya registrado muestra lo que hay guardado', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/attendance?')) {
        return new Response(JSON.stringify([
          { id: 'a1', studentId: 10, status: 'F', comment: 'Cita medica' },
          { id: 'a2', studentId: 11, status: 'T', comment: null },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await elegirCursoYBloque();

    await waitFor(() => {
      const ana = screen.getByRole('group', { name: /ANA LOPEZ/i });
      expect(within(ana).getByRole('button', { name: /falta/i })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByDisplayValue('Cita medica')).toBeInTheDocument();
  });

  it('lo que hay sin enviar en el telefono gana sobre lo guardado', async () => {
    // El servidor tiene F; el docente lo corrigio a P y aun no ha salido.
    const FECHA_B = '2026-08-17';
    await db.outbox.put({
      key: '10:1:' + FECHA_B, id: 'local-1', studentId: 10, scheduleBlockId: 1,
      classDate: FECHA_B, status: 'P', recordedAt: new Date().toISOString(),
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/api/attendance?')
        ? new Response(JSON.stringify([{ id: 'a1', studentId: 10, status: 'F', comment: null }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await elegirCursoYBloque();

    await waitFor(() => {
      const ana = screen.getByRole('group', { name: /ANA LOPEZ/i });
      expect(within(ana).getByRole('button', { name: /presente/i })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('sin conexion avisa de que puede no estar viendo todo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await elegirCursoYBloque();
    await waitFor(() =>
      expect(screen.getByText(/sin conexion no se puede comprobar/i)).toBeInTheDocument());
  });
});

describe('TomarAsistencia: panel de ultimos llamados', () => {
  const SESIONES = [
    { blockId: 7, grade: '6A', blockNo: 3, subject: 'Espanol', classDate: '2026-08-21',
      total: 25, recordedByName: 'Marta Restrepo', lastRecordedAt: '2026-08-21T12:10:00Z' },
    { blockId: 9, grade: '11A', blockNo: 6, subject: 'Sociales', classDate: '2026-08-20',
      total: 24, recordedByName: 'Carmen Velasquez', lastRecordedAt: '2026-08-20T18:30:00Z' },
  ];

  beforeEach(async () => {
    await db.blocks.clear();
    await db.students.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes('/api/attendance/recientes') ? SESIONES : []),
        { status: 200, headers: { 'Content-Type': 'application/json' } })));
  });

  it('lista las ultimas tomas con curso, bloque, materia y quien la registro', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    expect(await screen.findByText(/6A · Bloque 3 · Espanol/)).toBeInTheDocument();
    expect(screen.getByText(/Carmen Velasquez/)).toBeInTheDocument();
  });

  it('cada toma enlaza a su propia URL con el bloque y la fecha', async () => {
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    // Sin blockId y fecha correctos se abriria el curso o el dia equivocado.
    const enlace = (await screen.findByText(/6A · Bloque 3 · Espanol/)).closest('a');
    expect(enlace?.getAttribute('href')).toContain('/asistencia/7/2026-08-21');
    expect(enlace?.getAttribute('href')).toContain('curso=6A');
  });

  it('sin conexion y sin respaldo el panel queda vacio pero la planilla sigue usable', async () => {
    // Se limpia el respaldo de lecturas a proposito: con respaldo el panel SI pinta
    // las ultimas tomas conocidas (esa es la funcion de la cache). Lo que se prueba
    // aqui es el caso peor: sin red y sin nada guardado, la planilla sigue usable.
    await db.meta.clear();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    render(<MemoryRouter><TomarAsistencia /></MemoryRouter>);
    expect(await screen.findByText(/todavia no hay tomas de lista/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/curso/i)).toBeInTheDocument();
  });
});
