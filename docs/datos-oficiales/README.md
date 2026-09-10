# Datos oficiales del colegio

Archivos fuente entregados por el colegio. Corte: 24 de agosto de 2026.

| Archivo | Qué es | ¿Va al repo? |
|---|---|---|
| `horario-cursos-2026-2.pdf` | Horario oficial por curso, segundo semestre (22 de julio) | Sí |
| `horario-docentes-secundaria-2026-2.pdf` | Horario oficial de docentes de secundaria | Sí |
| `estudiantes-plano-2026-08-24.xlsx` | Plano de matrícula: ~1.200 estudiantes | **No**, está en `.gitignore` |

El `.xlsx` trae datos personales de menores (documento, fecha de nacimiento, EPS, tipo
de sangre, discapacidad, SRPA, teléfono, correo, barrio). No se versiona y no se sube a
ningún servicio externo. Pedirlo a coordinación cuando haga falta.

## Cómo se importa

`tools/generar-datos-oficiales.py` lee estos archivos y escribe aquí mismo
`estudiantes.csv` y `horario.csv`, con las cabeceras exactas del panel de carga
(`/admin` → Carga de datos, que usa `ImportService`). Los dos CSV llevan los mismos
datos de menores que el `.xlsx`: están en `.gitignore`.

```bash
python tools/generar-datos-oficiales.py
```

Del `.xlsx` solo se leen `DOC`, `APELLIDO1`, `APELLIDO2`, `NOMBRE1`, `NOMBRE2`,
`GRADO_COD` y `GRUPO`. Las otras 47 columnas (fecha de nacimiento, EPS,
discapacidad, SRPA, teléfono, correo, barrio) no se leen ni se escriben en ninguna
parte.

El nombre de curso sale de `GRADO_COD`/`GRUPO`: de primero a once se usa el código
oficial tal cual (`601`, `1001`), que es el mismo de los PDF de horario; preescolar
viene con signo negativo en el plano y lleva prefijo de letra (`PJ01` prejardín,
`J01`..`J03` jardín, `T01`..`T03` transición) porque `-101` chocaría con el `101` de
primero. `V64__orden_curso_oficial.sql` los ordena.

Para poner la base de producción en cero antes de la primera carga:
`tools/limpiar-produccion.sql`, pegado en el SQL editor de Supabase.

## Pendiente: los correos de los docentes

Los estudiantes ya se importan. Falta el horario: los PDF traen a los docentes solo por
nombre, y el sistema los identifica por correo. Mientras el colegio no entregue los 28
correos institucionales (`@educacionbogota.edu.co`), `horario.csv` sale con el nombre
del docente en la columna del correo: es un **borrador, no se sube**.

Cuando lleguen: llenar el diccionario `CORREOS` del script (nombre como sale en el PDF →
correo), volver a generar y subir `horario.csv`. El
`ON CONFLICT (grade, weekday, block_no) DO UPDATE` de `ImportService` le cambia el
docente a cada bloque sin duplicar nada.

Otro detalle a resolver con el colegio: en la celda de profundización de 10º y 11º el
PDF lista dos electivas con un docente cada una. Como el sistema guarda un docente por
bloque, queda el primero.
