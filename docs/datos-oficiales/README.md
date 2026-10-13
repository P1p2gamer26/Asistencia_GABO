# Datos oficiales del colegio

Archivos fuente entregados por el colegio. Corte: 17 de septiembre de 2026.

| Archivo | Qué es | ¿Va al repo? |
|---|---|---|
| `horario-cursos-2026-2.pdf` | Horario oficial por curso de secundaria (601 a 1102), segundo semestre | Sí |
| `horario-docentes-secundaria-2026-2.pdf` | Horario de docentes de secundaria (solo consulta) | Sí |
| `HORARIOS CURSOS PRIMARIA 2026 1-5.pdf` | Horario por curso de primaria (101 a 504). Solo trae las especialidades | Sí |
| `HORARIO DOCENTES PRIMERO OFICIAL-1.pdf` | Horario por docente de primero (las clases del director de grupo) | Sí |
| `HORARIO_DOCENTES__SEGUNDO-1.pdf` | Idem, segundo | Sí |
| `DOCENTES FINAL PRIMARIA 3-5 Y ESPECIALIDADES (1)-2.pdf` | Idem, tercero a quinto y especialidades | Sí |
| `Plano 17 09 26.xlsx` | Plano de matrícula: ~1.210 estudiantes | **No**, está en `.gitignore` |
| `PLANTA07092026.xlsx` | Planta docente. Hoja `Hoja1`: 72 docentes del GGM con correo institucional | **No**, está en `.gitignore` |

El plano trae datos personales de menores (documento, fecha de nacimiento, EPS, tipo
de sangre, discapacidad, SRPA, teléfono, correo, barrio). La planta trae la hoja
`07092026` con los documentos de la planta docente de todo el distrito; solo se lee la
hoja `Hoja1`. Ninguno de los dos se versiona ni se sube a ningún servicio externo.
Pedirlos a coordinación cuando haga falta.

## Cómo se importa

`tools/generar-datos-oficiales.py` lee estos archivos y escribe aquí mismo tres
archivos, todos en `.gitignore` porque llevan los datos de menores:

- `estudiantes.csv` y `horario.csv`, con las cabeceras exactas del panel de carga
  (`/admin` → Carga de datos, que usa `ImportService`). Sirven para actualizaciones
  parciales sobre una base que ya tiene datos.
- `reset-produccion.sql`: un solo archivo que deja la base **desde cero** con todo:
  limpieza, la cuenta de coordinación, materias, docentes con su correo real,
  estudiantes y horario.

```bash
python tools/generar-datos-oficiales.py
```

El script imprime avisos (`OJO`) que hay que leer antes de subir nada: ver abajo.

### Reset de producción

1. Correr el script y leer los avisos.
2. Abrir `reset-produccion.sql`, descomentar la línea `SET app.borrar_todo = 'si';`
   (sin eso el archivo se detiene solo) y pegarlo entero en el SQL editor de Supabase.
3. El `SELECT` final tiene que dar los conteos que dice la cabecera del archivo.

Va todo en una transacción: o entra completo o no entra. `tools/limpiar-produccion.sql`
hace solo la limpieza, por si hace falta vaciar sin cargar.

## Estudiantes

Del plano solo se leen `DOC`, `APELLIDO1`, `APELLIDO2`, `NOMBRE1`, `NOMBRE2`,
`GRADO_COD`, `GRUPO` y `ESTADO` (`RETIRADO` → inactivo). Las otras columnas no se leen
ni se escriben en ninguna parte.

El nombre de curso sale de `GRADO_COD`/`GRUPO`: de primero a once se usa el código
oficial tal cual (`601`, `1001`), que es el mismo de los PDF de horario; preescolar
viene con signo negativo en el plano y lleva prefijo de letra (`PJ01` prejardín,
`J01`..`J03` jardín, `T01`..`T03` transición) porque `-101` chocaría con el `101` de
primero. `V64__orden_curso_oficial.sql` los ordena.

## Docentes y correos

Los PDF identifican a los docentes por nombre y el sistema por correo. El correo sale
de la hoja `Hoja1` de la planta: el nombre del PDF (`MARIELA FARFÁN`, `JOAN C WILCHES`)
calza con la fila cuyos apellidos y nombres contienen todas sus palabras. Si calzan
cero o dos filas el script para; se arregla en `EXCEPCIONES` del script.

Tres docentes no tienen correo en la planta (Leidy Linares, Marcela Vera, Yamile
Pachón) y quedan con uno provisional `@ggm.edu.co` hasta que el colegio lo entregue.
Dos correos vienen raros en la planta y se dejan como están: el de Juan P. Guavita
tiene el dominio mal escrito (`educacionbogotal`) y el de Julián Vargas parece ser de
otra persona (`rytorresp@...`). Confirmar con el colegio.

## Horario

**Secundaria** sale del PDF por curso, siete bloques al día. Sin cambios.

**Primaria** tiene seis bloques (descanso después del tercero) y sale de dos fuentes
que el script cruza: el PDF por curso solo trae las especialidades (artes, edu. física,
tecnología, informática, ética, religión, laboratorio) y las clases del director de
grupo están en los PDF por docente. Los PDF son de fechas distintas y en primero y
segundo no siempre dicen lo mismo: el script lista cada choque y se queda con el más
reciente (docentes de primero, 14/02, le gana al de cursos, 9/02; el de segundo, 8/02,
pierde). También avisa de docentes que quedan en dos cursos a la vez y de cursos con
huecos. Todo eso es para cotejar con coordinación, no lo resuelve el script.

**Preescolar** no tiene horario en ningún archivo: quedan solo los estudiantes.

En la celda de profundización de 10º y 11º el PDF lista dos electivas con un docente
cada una. Como el sistema guarda un docente por bloque, queda el primero.
