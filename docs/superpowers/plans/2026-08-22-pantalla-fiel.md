# La Pantalla Debe Reflejar lo que Está Guardado — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pantalla de toma de asistencia muestre lo que realmente está registrado, y que enviar no destruya información que ya existe.

**Architecture:** Hoy el único recuerdo de la pantalla es la cola local, que se vacía al sincronizar. A partir de ahí la pantalla miente y el envío destruye. Se corrige haciendo que el estado del componente —marcas y motivos— sea la fuente de verdad, alimentado al abrir un bloque desde lo ya guardado en el servidor, con la cola local como respaldo cuando no hay conexión.

**Tech Stack:** React 18, TypeScript, Vitest.

**Spec:** Verificación del 22 de agosto de 2026, registrada en la sección 6.k de `docs/INFORME-FINAL.md`.

## Los dos defectos, medidos

Se recorrió el escenario exacto de un docente con el curso real de 40 estudiantes:
marcar una llegada tarde, escribir el motivo y enviar.

**1. El motivo se pierde.** Tras escribir "El bus se demoro" y pulsar Enviar, en la base
de datos queda `comment: NULL`. La secuencia es: la sincronización automática envía el
registro con su motivo y vacía la cola; al pulsar Enviar, la pantalla vuelve a construir
los 40 registros, no encuentra nada en la cola de donde conservar el motivo, y el
`upsert` del servidor **sobrescribe el motivo bueno con vacío**.

Esto anula un requisito explícito del feedback de los docentes recogido en
`Pruebas.docx`: *"permitir agregar comentarios de porque llego tarde o falto"*.

**2. Reabrir una clase ya registrada la muestra en blanco.** La pantalla nunca llama a
`GET /api/attendance?blockId=&date=`, que existe justo para eso. Solo lee la cola local,
y la cola se vacía al sincronizar. Consecuencia: un docente que revisa una clase de ayer
ve a los 40 estudiantes en "P", sin rastro de las faltas que puso. Y si pulsa Enviar
—cosa razonable, porque la pantalla parece vacía— **sobrescribe las faltas reales con
presentes**.

Los dos son la misma causa: **la cola local no puede ser la única memoria de la
pantalla.** Es un buzón de salida, no un registro.

## Global Constraints

- **El proyecto vive en `app/`.** Frontend: `cd app/frontend && npm test` y `npm run build`.
- **No se toca el backend.** `GET /api/attendance?blockId=&date=` ya existe y devuelve `[{id, studentId, status, comment}]`.
- **Sin conexión, la aplicación debe seguir funcionando igual.** Si no se puede consultar lo guardado, se usa la cola local y se dice que los datos pueden estar incompletos.
- **`waitFor`, nunca `findByRole`,** para contenido que depende de un efecto asíncrono.
- **Sin dependencias nuevas.**
- **El paquete de producción debe seguir por debajo de 200 KB gzip** (hoy 100 KB).
- **Idioma:** identificadores en inglés, texto visible en español. Sin tildes ni letra eñe en nombres de ficheros.
- **Commits:** Conventional Commits en español, terminando con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
app/frontend/src/
├── pages/TomarAsistencia.tsx        (modificar) estado de motivos; cargar lo guardado
└── pages/TomarAsistencia.test.tsx   (modificar) casos nuevos
```

---

## Task 1: Los motivos viven en el estado de la pantalla

**Files:**
- Modify: `app/frontend/src/pages/TomarAsistencia.tsx`
- Test: `app/frontend/src/pages/TomarAsistencia.test.tsx`

**Interfaces:**
- Consumes: `markAttendance(mark)`, sin cambios.
- Produces: nada nuevo.

El campo de motivo es hoy un `input` no controlado que escribe directamente en la cola.
Pasa a estar respaldado por estado, igual que las marcas, y el envío manda ambos. Así lo
que se envía es exactamente lo que el docente ve.

- [ ] **Step 1: Escribir los tests**

Añadir a `TomarAsistencia.test.tsx`, reutilizando el helper `elegirCursoYBloque` que ya
existe:

```tsx
  it('enviar conserva el motivo que el docente escribio', async () => {
    await elegirCursoYBloque();

    const grupo = screen.getByRole('group', { name: /ANA LOPEZ/i });
    await userEvent.click(within(grupo).getByRole('button', { name: 'T' }));

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
    await userEvent.click(within(grupo).getByRole('button', { name: 'T' }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'El bus se demoro');
    await userEvent.tab();

    // Se lo piensa mejor y lo pone como falta
    await userEvent.click(within(grupo).getByRole('button', { name: 'F' }));
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
    await userEvent.click(within(grupo).getByRole('button', { name: 'T' }));
    await userEvent.type(await screen.findByLabelText(/motivo/i), 'El bus se demoro');
    await userEvent.tab();
    await userEvent.click(within(grupo).getByRole('button', { name: 'P' }));

    await userEvent.click(screen.getByRole('button', { name: /enviar asistencia/i }));

    await waitFor(async () => {
      const ana = (await db.outbox.toArray()).find((r) => r.studentId === 10);
      expect(ana?.status).toBe('P');
      // Un motivo de tardanza en alguien que llego a tiempo confunde al acudiente.
      expect(ana?.comment).toBeFalsy();
    });
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/TomarAsistencia.test.tsx`
Expected: FAIL el primero — `comment` llega `undefined` tras enviar.

- [ ] **Step 3: Añadir el estado de motivos**

En `TomarAsistencia.tsx`, junto a `marcas`:

```tsx
  const [motivos, setMotivos] = useState<Record<number, string>>({});
```

Limpiarlo donde ya se limpia `marcas` (al cambiar de bloque o de fecha):

```tsx
    if (!blockId) { setMarcas({}); setMotivos({}); return; }
```

- [ ] **Step 4: Que el campo de motivo sea controlado**

Sustituir el `input` del motivo:

```tsx
                  {(marcas[s.id] === 'T' || marcas[s.id] === 'F') && (
                    <input className="comentario" type="text" maxLength={280}
                           aria-label={`Motivo para ${s.fullName}`}
                           placeholder="Motivo (opcional)"
                           value={motivos[s.id] ?? ''}
                           onChange={(ev) =>
                             setMotivos((prev) => ({ ...prev, [s.id]: ev.target.value }))} />
                  )}
```

La etiqueta accesible pasa a nombrar al estudiante: con 40 filas, cuarenta campos
llamados "Motivo (opcional)" son indistinguibles para quien usa lector de pantalla.

- [ ] **Step 5: Borrar el motivo al volver a presente**

En `marcar()`, tras actualizar `marcas`:

```tsx
      setMarcas((prev) => ({ ...prev, [studentId]: status }));
      if (status === 'P') {
        // Un motivo de tardanza en alguien que llego a tiempo confunde al acudiente.
        setMotivos((prev) => {
          const { [studentId]: _, ...resto } = prev;
          return resto;
        });
      }
```

- [ ] **Step 6: Enviar el motivo junto con el estado**

En `enviar()`, dentro del bucle:

```tsx
        await markAttendance({
          studentId: s.id,
          scheduleBlockId: blockId,
          classDate: fecha,
          status: marcas[s.id] ?? 'P',
          comment: motivos[s.id] ?? '',
        });
```

Se manda cadena vacía y no `undefined` a proposito: `undefined` significa "conserva lo
que hubiera", y aquí la pantalla **es** la verdad. Si el docente borró el motivo, debe
borrarse también en la base.

- [ ] **Step 7: Eliminar `comentar()`**

Ya no se usa: el motivo viaja con el envío. Borrar la función entera para que nadie la
llame por costumbre.

- [ ] **Step 8: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todo.

- [ ] **Step 9: Commit**

```bash
git add app/frontend/src/pages
git commit -m "fix: el motivo de una tardanza se perdia al enviar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Al abrir un bloque se carga lo que ya está registrado

**Files:**
- Modify: `app/frontend/src/pages/TomarAsistencia.tsx`
- Test: `app/frontend/src/pages/TomarAsistencia.test.tsx`

**Interfaces:**
- Consumes: `GET /api/attendance?blockId={Long}&date={YYYY-MM-DD}` -> `[{id, studentId, status, comment}]`, que ya existe y no se usaba.
- Produces: nada nuevo.

**El orden de precedencia importa** y conviene dejarlo escrito: primero se pinta lo que
el servidor tiene guardado, y encima lo que haya en la cola local sin enviar. La cola
son cambios más recientes que todavía no han salido, así que debe ganar.

Sin conexión no se puede consultar el servidor. En ese caso se usa solo la cola y **se
avisa**, porque una pantalla que parece completa y no lo está es justo lo que causó este
problema.

- [ ] **Step 1: Escribir los tests**

```tsx
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
      expect(within(ana).getByRole('button', { name: 'F' })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByDisplayValue('Cita medica')).toBeInTheDocument();
  });

  it('lo que hay sin enviar en el telefono gana sobre lo guardado', async () => {
    // El servidor tiene F; el docente lo corrigio a P y aun no ha salido.
    await db.outbox.put({
      key: '10:1:' + HOY, id: 'local-1', studentId: 10, scheduleBlockId: 1,
      classDate: HOY, status: 'P', recordedAt: new Date().toISOString(),
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/api/attendance?')
        ? new Response(JSON.stringify([{ id: 'a1', studentId: 10, status: 'F', comment: null }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await elegirCursoYBloque();

    await waitFor(() => {
      const ana = screen.getByRole('group', { name: /ANA LOPEZ/i });
      expect(within(ana).getByRole('button', { name: 'P' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('sin conexion avisa de que puede no estar viendo todo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await elegirCursoYBloque();
    await waitFor(() =>
      expect(screen.getByText(/sin conexion no se puede comprobar/i)).toBeInTheDocument());
  });
```

Añadir al principio del fichero, junto a los demás ayudantes:

```tsx
const HOY = new Date().toLocaleDateString('en-CA');
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd app/frontend && npm test src/pages/TomarAsistencia.test.tsx`
Expected: FAIL el primero — la pantalla no consulta nada y muestra todo en "P".

- [ ] **Step 3: Cargar lo guardado al elegir bloque y fecha**

Sustituir el efecto que hoy solo lee la cola local:

```tsx
  const [avisoCarga, setAvisoCarga] = useState('');

  // Al abrir un bloque se pinta lo que realmente hay registrado. La cola local no puede
  // ser la unica memoria: se vacia al sincronizar, y a partir de ahi la pantalla mostraba
  // todo en "P" aunque hubiera faltas guardadas. Enviar entonces las sobrescribia.
  useEffect(() => {
    if (!blockId) { setMarcas({}); setMotivos({}); setAvisoCarga(''); return; }

    let vigente = true;
    (async () => {
      const nuevasMarcas: Record<number, Estado> = {};
      const nuevosMotivos: Record<number, string> = {};

      // 1. Lo que el servidor tiene guardado.
      try {
        const guardados = await api.get<{ studentId: number; status: Estado; comment?: string }[]>(
          `/api/attendance?blockId=${blockId}&date=${fecha}`);
        for (const g of guardados) {
          nuevasMarcas[g.studentId] = g.status;
          if (g.comment) nuevosMotivos[g.studentId] = g.comment;
        }
        if (vigente) setAvisoCarga('');
      } catch {
        if (vigente) {
          setAvisoCarga('Sin conexion no se puede comprobar lo ya registrado: '
                      + 'puede que no vea todo lo que hay guardado.');
        }
      }

      // 2. Encima, lo que aun no ha salido del telefono: es mas reciente.
      const pendientesLocales = await db.outbox.where('classDate').equals(fecha).toArray();
      for (const r of pendientesLocales) {
        if (r.scheduleBlockId !== blockId) continue;
        nuevasMarcas[r.studentId] = r.status;
        if (r.comment) nuevosMotivos[r.studentId] = r.comment;
      }

      if (!vigente) return;
      setMarcas(nuevasMarcas);
      setMotivos(nuevosMotivos);
    })();

    return () => { vigente = false; };
  }, [blockId, fecha]);
```

La bandera `vigente` evita que una consulta lenta pise el estado si el docente cambió de
bloque mientras tanto: con la conexión del colegio eso pasa de verdad.

- [ ] **Step 4: Mostrar el aviso**

Junto al banner de estado:

```tsx
      {avisoCarga && <p className="banner no-lectivo" role="status">{avisoCarga}</p>}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `cd app/frontend && npm test`
Expected: PASS todo.

- [ ] **Step 6: Comprobarlo con datos reales**

Con la base de carga levantada y el frontend compilado servido por Spring Boot (ver
`app/README.md`):

1. Entrar como `docente1@ggm.edu.co`, elegir su curso y un día lectivo.
2. Marcar una tardanza, escribir un motivo, enviar.
3. En la base: `SELECT status, comment FROM attendance WHERE ...` → debe verse el motivo.
4. **Recargar la pantalla y volver a abrir el mismo bloque y fecha** → deben verse la
   tardanza y su motivo, no todo en "P".
5. Pulsar Enviar otra vez sin tocar nada → los datos deben quedar igual, no borrarse.

El paso 5 es el que importa: antes destruía la información.

- [ ] **Step 7: Commit**

```bash
git add app/frontend/src/pages
git commit -m "fix: reabrir una clase registrada la mostraba en blanco y enviar la borraba

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Dejarlo como invariante comprobado

**Files:**
- Modify: `tools/humo.sh`
- Modify: `docs/INFORME-FINAL.md`

- [ ] **Step 1: Añadir el invariante del motivo a `tools/humo.sh`**

Antes del bloque de resultado:

```bash
# --- El motivo de una tardanza sobrevive ---------------------------------------
FECHA_M="2026-03-17"
LOTE_M=$(mktemp)
python -c "
import json, uuid
print(json.dumps({'records': [{'id': str(uuid.uuid4()), 'studentId': 1, 'scheduleBlockId': 1,
  'classDate': '$FECHA_M', 'status': 'T', 'comment': 'El bus se demoro',
  'recordedAt': '${FECHA_M}T12:00:00Z'}]}))" > "$LOTE_M"
curl -s -o /dev/null -X POST "$BASE/api/attendance/sync" -H "$AUTH" \
  -H 'Content-Type: application/json' --data-binary "@$LOTE_M"
rm -f "$LOTE_M"

MOTIVO=$(curl -s "$BASE/api/attendance?blockId=1&date=$FECHA_M" -H "$AUTH")
contiene "el motivo de la tardanza se guarda" 'El bus se demoro' "$MOTIVO"
```

- [ ] **Step 2: Ejecutar la prueba de humo**

Run: levantar la aplicación y `bash tools/humo.sh http://localhost:8080`
Expected: todos los invariantes se mantienen, ahora 23.

- [ ] **Step 3: Escribir la sección 6.k del informe**

Con los dos defectos, cómo se midieron, y la lección: la cola de salida no puede ser la
memoria de la pantalla.

- [ ] **Step 4: Commit**

```bash
git add tools docs
git commit -m "test: invariante de que el motivo de la tardanza se conserva

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Fuera de alcance

1. **Marcar en la pantalla qué estudiantes ya estaban guardados** frente a los recién
   tocados. Suena útil y es ruido: al docente le importa el estado final, no de dónde
   viene.
2. **Resolver conflictos entre dos docentes** que marquen el mismo bloque a la vez. El
   servidor ya decide por `recorded_at`, quedándose con la marca más reciente; una
   pantalla de resolución de conflictos para un caso que casi no ocurre es complejidad
   sin causa.
3. **Guardar el motivo mientras se escribe.** El envío es explícito y el estado vive en
   la pantalla; salvar cada tecla añadiría escrituras sin beneficio.
4. **Historial de cambios de una asistencia.** Sería una tabla nueva y su pantalla:
   merece su propio plan si el colegio lo pide.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Una consulta lenta pisa el estado tras cambiar de bloque | El docente ve datos de otro bloque | La bandera `vigente` descarta la respuesta obsoleta |
| Sin conexión no se ve lo guardado | El docente podría re-marcar y sobrescribir | Se avisa explícitamente, y la cola local sigue teniendo lo suyo |
| Mandar `comment: ''` borra el motivo en el servidor | Un borrado accidental pierde el texto | Es deliberado: la pantalla es la verdad. El motivo solo se muestra en T y F, y volver a P lo borra también en pantalla |
| Una consulta más al abrir cada bloque | Más tráfico | Medido: 14 ms y 3 KB para un bloque de 40 estudiantes |

## Self-review

**Cobertura.** Los dos defectos tienen tarea: el motivo que se perdía (Task 1) y la
pantalla que no reflejaba lo guardado (Task 2). La Task 3 lo convierte en invariante.

**Sin marcadores de posición.** Cada paso trae el código o el comando exacto.

**Consistencia.** `motivos` se declara en la Task 1 Step 3 y se usa en los Steps 4, 5 y
6 y en el efecto de la Task 2. `avisoCarga` se declara y se muestra en la Task 2. El
endpoint consultado devuelve `{id, studentId, status, comment}`, que es exactamente lo
que produce `AttendanceController.ofBlock`.

**La lección, para que no se repita.** Un buzón de salida sirve para saber qué falta por
enviar, **no para saber qué hay**. Cada vez que la pantalla usó la cola como memoria
—las marcas al reabrir, el motivo al enviar— acabó mintiendo en cuanto la cola se vació.
Es el mismo error dos veces, y por eso las dos tareas van juntas.
