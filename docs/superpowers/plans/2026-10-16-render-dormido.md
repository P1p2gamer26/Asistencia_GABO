# Render dormido: que no se duerma y que la app diga qué pasa — Plan de implementación

> **Para quien ejecute:** según `~/.claude/CLAUDE.md`, el implementador es `codexr` (no un subagente Claude). Claude revisa `git diff` + tests después de cada tarea. Los pasos usan checkbox (`- [ ]`).

**Objetivo:** que el servicio de Render no se duerma y que, si aun así está despertando, la app diga "Conectando con el servidor…" en vez de un "Cargando..." mudo.

**Estado medido el 2026-10-16** (historial de `keepalive.yml` en `P1p2gamer26/Asistencia_GABO`):
- El cron `*/5 10-19 * * 1-5` debería dar ~108 corridas por día hábil. Dio **4** el 14 y el 15 de octubre, y **1** hoy hasta las 13:13. GitHub casi no lo dispara, así que Render se duerme igual.
- Cuando la sonda encuentra el servidor dormido, el paso tarda **~3 min 15 s** (14:29, 14:37 y 14:51 UTC de distintos días), no los ~50 s que dicen los comentarios del código.
- Despierto, `/api/health/db` responde en 0,4–0,6 s.
- `TOPE_PETICION_MS = 60_000` (en `client.ts`) corta antes de que el servidor termine de despertar. El primer docente del día ve "Cargando..." un minuto y después "Sin internet", aunque sí tenga internet.

**Arquitectura:**
- (T1) Pinger externo 24/7. Render Free da 750 h/mes y un mes tiene ≤ 744 h, así que un solo servicio puede quedarse despierto todo el mes gratis.
- (T2) Franja en la app mientras el servidor no contesta.

**Stack:** React 18 + Vite + vitest. Render Free + Supabase.

## Restricciones globales

- Sin dependencias nuevas, sin CSS nuevo (se reusa `barra-offline aviso`).
- Textos de la interfaz sin tildes en el código, como el resto (`Cargando...`, `Sin conexion`).
- Umbral de la franja: **8 000 ms**. `TOPE_PETICION_MS` no se toca.
- URL de salud: `https://asistencia-ggm.onrender.com/api/health/db` (pública).

## Puntos a revisar

1. Una petición que llega al tope de 60 s (o recibe 502) mientras el servidor despierta: la franja **sigue visible** y solo se quita cuando el servidor responde algo.
2. Varias peticiones lentas a la vez: una sola franja.
3. Login (no usa `Layout`): también muestra la franja. Es por donde se entra en la mañana.
4. Petición rápida (< 8 s): la franja nunca parpadea.
5. Sin internet de verdad: la franja puede convivir con "Sin internet" de `BarraOffline`; el texto es neutro a propósito para no mentir en ningún caso.

---

### Tarea 1: Pinger externo 24/7 (sin código, la hace el usuario)

- [ ] **Paso 1:** En https://cron-job.org (gratis) → *Create cronjob*: URL `https://asistencia-ggm.onrender.com/api/health/db`, cada **10 minutos**, todos los días, timeout 30 s, aviso por correo si falla.
- [ ] **Paso 2:** Verificar al día siguiente: el historial de cron-job.org da 200 con tiempos < 2 s. Si alguno pasa de 30 s, el servidor se había dormido y hay que bajar el intervalo a 5 min.
- [ ] **Paso 3:** En `.github/workflows/keepalive.yml` quitar el cron `*/5 10-19 * * 1-5` y la lógica de `JORNADA`. Queda el diario como respaldo para Supabase. El comentario pasa a decir que el pinger principal es cron-job.org y por qué (datos de arriba). Corregir "~50 s" → "~3 min" en ese comentario y en el de `TOPE_PETICION_MS`.
- [ ] **Paso 4:** Commit `Keepalive: el ping pasa a cron-job.org (el cron de 5 min de GitHub casi no corria)`.

Límite conocido: con un segundo servicio en la misma cuenta de Render, las 750 h ya no alcanzan para los dos.

### Tarea 2: Franja "Conectando con el servidor"

**Archivos:**
- Modificar: `app/frontend/src/api/client.ts` (dentro de `request`)
- Crear: `app/frontend/src/components/AvisoServidorLento.tsx`
- Modificar: `app/frontend/src/components/Layout.tsx` (junto a `<BarraOffline />`)
- Modificar: `app/frontend/src/pages/Login.tsx` (arriba del formulario)
- Test: `app/frontend/src/api/client.test.ts`, `app/frontend/src/components/AvisoServidorLento.test.tsx`

**Interfaces** (en `client.ts`):
- `export const UMBRAL_LENTO_MS = 8_000;`
- `export function servidorLento(): boolean`
- Evento `window` `'servidor-lento'` cada vez que cambia el valor.
- Regla: pasa a `true` cuando una petición lleva `UMBRAL_LENTO_MS` sin respuesta. Pasa a `false` solo cuando una petición recibe una respuesta HTTP que **no** es 502/503/504. Un timeout, un error de red o un 502 no lo apagan.

`AvisoServidorLento` (default export, sin props): `null` si `!servidorLento()`. Si no, `<div className="barra-offline aviso" role="status">` con el texto exacto:
**"Conectando con el servidor... si es la primera entrada del dia puede tardar hasta 3 minutos. Lo que marque se guarda en este dispositivo."**

- [ ] **Paso 1: tests que fallan** (`vi.useFakeTimers()`, `fetch` mockeado que se resuelve cuando el test quiere):
  - `servidorLento()` es `false` a los 7 999 ms y `true` a los 8 000 ms; vuelve a `false` cuando el fetch responde 200.
  - Petición lenta que termina por tope (60 s) → sigue `true`; la siguiente que responde 200 → `false`.
  - Petición lenta que recibe 502 → sigue `true`.
  - Respuesta 401 o 400 (el servidor contestó) → `false`.
  - Respuesta a los 100 ms → nunca se emitió `'servidor-lento'`.
  - Componente: vacío al inicio; tras el evento con `true` aparece el texto exacto; con `false` desaparece.
- [ ] **Paso 2:** `cd app/frontend && npx vitest run src/api/client.test.ts src/components/AvisoServidorLento.test.tsx` → FALLA.
- [ ] **Paso 3: implementar.** En `request`, junto al `setTimeout` del tope, otro `setTimeout(UMBRAL_LENTO_MS)` que pone la bandera a `true` (limpiado en el `finally` existente). Tras recibir `res`, si no es 502/503/504, bandera a `false`. Emitir el evento solo cuando el valor cambia. El componente escucha con `useEffect`.
- [ ] **Paso 4:** mismos tests → PASAN; `npx vitest run` completo y `npm run build` → sin errores.
- [ ] **Paso 5:** Commit `Aviso: "Conectando con el servidor" mientras Render despierta`.

Fuera de alcance: frontend en Vercel (descartado: obliga a reinstalar la PWA en todos los celulares) y la migración a Oracle/Hetzner, que es la solución de fondo.
