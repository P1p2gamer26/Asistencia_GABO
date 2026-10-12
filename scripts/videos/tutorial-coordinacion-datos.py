"""Video para coordinación: cómo preparar y subir estudiantes, horario y acudientes, y mantener calendario y usuarios.
Orden de grabación (las escenas de hoja de cálculo son Excel de escritorio real, no el navegador):
  1. python scripts/videos/excel-coordinacion.py   → externo/<id>.mp4 (Excel con cursor real) y excel/*.csv (los guarda Excel)
  2. python ~/.claude/skills/video-tutorial/scripts/producir.py scripts/videos/config-coordinacion.json scripts/videos/tutorial-coordinacion-datos.py
     (montar.py usa externo/<id>.mp4 en lugar del tramo del navegador para esas escenas)
Necesita el backend en 8080 (base asistencia_video).
"""
from pathlib import Path

TITULO = "Cargar los datos del colegio"
SUBTITULO = "Estudiantes, horario, acudientes y calendario · guía para coordinación"
BASE = "http://127.0.0.1:8080"
EXCEL = Path("C:/Users/Julian/Downloads/asistencia-tutoriales/coordinacion-datos/excel")  # CSV guardados por Excel en el paso 1
ESTUDIANTES = [
    ["documento", "primer_nombre", "segundo_nombre", "primer_apellido", "segundo_apellido", "curso", "activo"],
    ["1023456789", "Valentina", "Sofia", "Rojas", "Pineda", "601", "si"],
    ["1023456790", "Samuel", "", "Cardenas", "Mora", "601", "si"],
    ["1023456791", "Mariana", "Isabel", "Guerrero", "Lopez", "601", "si"],
    ["1023456792", "Juan", "Esteban", "Torres", "Nino", "602", "si"],
    ["1023456793", "Luciana", "", "Bermudez", "Salas", "602", "no"],
]
HORARIO = [
    ["curso", "dia", "bloque", "hora_inicio", "hora_fin", "materia", "correo_docente", "aula"],
    ["601", "1", "1", "06:30", "07:30", "Matematicas", "docente01@ggm.edu.co", "Salon 12"],
    ["601", "1", "2", "07:30", "08:30", "Espanol", "docente02@ggm.edu.co", "Salon 12"],
    ["601", "1", "3", "08:30", "09:30", "Ciencias", "docente03@ggm.edu.co", "Laboratorio"],
    ["601", "1", "4", "09:45", "10:45", "Ingles", "docente04@ggm.edu.co", ""],
]
ACUDIENTES = [
    ["documento_estudiante", "nombre_acudiente", "correo_acudiente", "parentesco"],
    ["1023456789", "Claudia Pineda", "claudia.pineda@correo.com", "Madre"],
    ["1023456790", "Jorge Cardenas", "jorge.cardenas@correo.com", "Padre"],
]

def excel(h):
    """La escena la pone el clip externo/<id>.mp4 grabado en Excel; aquí solo hace falta su marca de tiempo."""
    h.espera(1.0)

def fijar(h, sel, valor):
    """Campos date/time: tipear no sirve en Chromium, se fija el valor con fill."""
    h.mover(sel); h.page.locator(sel).first.fill(valor); h.espera(0.5)

def pestana(h, titulo):
    h.page.goto(f"{BASE}/admin", wait_until="load"); h.espera(1.2)
    h.clic(f"button[role=tab]:has-text('{titulo}')"); h.espera(0.8)

def subir(h, titulo, archivo):
    pestana(h, "Carga de datos"); h.ver(f"h3:has-text('{titulo}')")
    sel = f"input[aria-label='Archivo CSV de {titulo}']"
    h.resaltar(sel, hold=1.0); h.page.set_input_files(sel, str(archivo)); h.espera(2.0)
    h.resaltar(f"h3:has-text('{titulo}') ~ p.meta", hold=2.0)

def intro(h):
    h.page.goto(f"{BASE}/admin", wait_until="load"); h.espera(1.2)
    for t in ["Usuarios", "Estudiantes", "Calendario", "Horario", "Carga de datos"]:
        h.resaltar(f"button[role=tab]:has-text('{t}')", hold=1.6)

def orden(h):
    pestana(h, "Carga de datos")
    h.resaltar("section > p.meta", hold=3.5)
    for t in ["Estudiantes", "Horario", "Acudientes"]:
        h.resaltar(f"h3:has-text('{t}') + figcaption", hold=2.6)

def subir_estudiantes(h): subir(h, "Estudiantes", EXCEL / "estudiantes.csv")

def subir_horario(h):
    # El CSV que guardo Excel mas una fila con el dia 7, con el mismo separador que eligio Excel.
    bueno = (EXCEL / "horario.csv").read_text(encoding="utf-8-sig")
    sep = ";" if ";" in bueno.splitlines()[0] else ","
    malo = EXCEL / "horario-con-error.csv"
    malo.write_text(bueno.rstrip("\r\n") + "\n" + sep.join(["601", "7", "5", "10:45", "11:45", "Sociales", "docente05@ggm.edu.co", "Salon 12"]) + "\n", encoding="utf-8")
    subir(h, "Horario", malo); h.resaltar("h3:has-text('Horario') ~ ul.novedades", hold=4.0)

def subir_acudientes(h): subir(h, "Acudientes", EXCEL / "acudientes.csv")

def estudiantes_panel(h):
    pestana(h, "Estudiantes")
    h.escribir("input[aria-label='Buscar por nombre o documento']", "1023456789"); h.clic("button:has-text('Buscar')"); h.espera(1.2)
    h.ver("ul.registros-lista li"); h.clic("button:has-text('Editar')"); h.espera(0.6); h.ver("ul.registros-lista li")
    h.escribir("input[aria-label^='Curso de']", "602"); h.resaltar("input[type=checkbox]", hold=2.4)
    h.clic("button:has-text('Guardar')"); h.espera(1.5)

def calendario(h):
    pestana(h, "Calendario"); h.clic("button:has-text('Marcar un rango')"); h.espera(0.5)
    fijar(h, "#r-desde", "2026-10-05"); fijar(h, "#r-hasta", "2026-10-09")
    h.elegir("#r-tipo", "VACACIONES"); h.escribir("#r-motivo", "Receso de octubre")
    h.clic("button:has-text('Aplicar al rango')"); h.espera(1.2)
    fijar(h, "#cd", "2026-10-01"); fijar(h, "#ch", "2026-10-16"); h.clic("button:has-text('Ver rango')"); h.espera(1.0)
    h.ver("select[aria-label='Tipo de dia para 2026-10-07']"); h.resaltar("select[aria-label='Tipo de dia para 2026-10-07']", hold=2.5)

def usuarios(h):
    pestana(h, "Usuarios")
    h.escribir("#ne", "docente.nuevo@ggm.edu.co"); h.escribir("#nn", "Andrea Castillo"); h.elegir("#nr", "DOCENTE")
    h.clic("button:has-text('Crear usuario')"); h.espera(1.2)
    h.resaltar("section[aria-label='Siguientes pasos'] p", hold=3.5); h.clic("button:has-text('Asignar horario ahora')"); h.espera(1.0)

def horario_panel(h):
    h.escribir("#hg", "701"); h.escribir("#hd", "3"); h.escribir("#hb", "2"); fijar(h, "#hi", "07:30"); fijar(h, "#hf", "08:30")
    h.elegir("#hm", "Ingles"); h.escribir("#ha", "Salon 8"); h.clic("button:has-text('Crear bloque')"); h.espera(1.2)
    h.ver("input[aria-label='Filtrar por curso']"); h.escribir("input[aria-label='Filtrar por curso']", "701"); h.espera(1.2)

def cierre(h):
    pestana(h, "Carga de datos"); h.resaltar("section > p.meta", hold=3.0)

ESCENAS = [
    {"id": "intro", "capitulo": "Administración", "texto":
     "Hola. En este video vamos a ver cómo se cargan los datos del colegio en la aplicación de asistencia: estudiantes, horario, acudientes y calendario. Todo se hace desde la pantalla de Administración, que tiene cinco pestañas: Usuarios, Estudiantes, Calendario, Horario y Carga de datos. Empecemos por la carga masiva, que es la que más nos ahorra tiempo.",
     "run": intro},
    {"id": "orden", "capitulo": "Carga de datos", "sub": "El orden importa", "texto":
     "En Carga de datos hay tres archivos, y el orden importa: primero los estudiantes, después el horario y al final los acudientes, porque el horario y los acudientes necesitan que el estudiante ya exista. Debajo de cada título aparece el orden exacto de las columnas. Los archivos se preparan en Excel y se guardan como CSV; ahora les muestro cómo.",
     "run": orden},
    {"id": "hoja_est", "capitulo": "Archivo de estudiantes", "sub": "Una fila por estudiante", "transicion": "cambio", "texto":
     "Abrimos Excel con un libro en blanco. En la primera fila escribimos los títulos: documento, primer nombre, segundo nombre, primer apellido, segundo apellido, curso y activo. Lo que importa es el orden de las columnas. En curso va el código del curso, el mismo de los horarios oficiales: seis cero uno, seis cero dos. Y activo es opcional: sí, si el estudiante está activo, y no, si se retiró. Segundo nombre y segundo apellido pueden ir vacíos.",
     "run": excel},
    {"id": "guardar", "capitulo": "Guardar como CSV", "sub": "Archivo, Guardar como", "texto":
     "Ahora lo guardamos como CSV. Vamos a Archivo, luego Guardar como, y Examinar. Le ponemos un nombre, por ejemplo estudiantes, y en Tipo elegimos CSV UTF-8, delimitado por comas. Guardar. Excel puede avisar que algunas funciones se pierden en este formato: está bien, el CSV solo guarda los datos, que es justo lo que necesita la aplicación.",
     "run": excel},
    {"id": "subir_est", "capitulo": "Subir estudiantes", "transicion": "cambio", "texto":
     "Volvemos a Carga de datos, y en Estudiantes elegimos el archivo que acabamos de guardar. En unos segundos la aplicación dice cuántas filas cargó. Si un estudiante ya existía, se actualiza con los datos nuevos: pueden volver a subir el plano completo cada vez que cambie, sin duplicar a nadie.",
     "run": subir_estudiantes},
    {"id": "hoja_hor", "capitulo": "Archivo de horario", "sub": "Una fila por bloque de clase", "transicion": "cambio", "texto":
     "El horario es una fila por cada bloque de clase. Curso; día, que es el día del ciclo, del uno al cinco; bloque, el número del bloque en el día; hora de inicio y hora de fin; la materia; el correo institucional del docente; y el aula, que es opcional. Si el docente todavía no tiene cuenta, la aplicación se la crea con la contraseña temporal cambiar uno dos tres. Por eso el correo tiene que quedar bien escrito. Se guarda como CSV igual que el anterior.",
     "run": excel},
    {"id": "subir_hor", "capitulo": "Subir horario", "sub": "Qué pasa con una fila mal escrita", "transicion": "cambio", "texto":
     "Subimos el archivo de horario igual que el anterior. Miren este caso: dejé a propósito una fila con el día siete. La aplicación carga las filas buenas y abajo lista las que rechazó, con el número de línea y el motivo. Se corrige esa línea en el Excel y se vuelve a subir el archivo; lo que ya estaba cargado no se duplica.",
     "run": subir_horario},
    {"id": "acud", "capitulo": "Archivo de acudientes", "transicion": "cambio", "texto":
     "Los acudientes van al final: documento del estudiante, nombre del acudiente, su correo, y el parentesco. Con ese correo el acudiente puede entrar al portal de familias y ver la asistencia de sus hijos.",
     "run": excel},
    {"id": "acud_subir", "capitulo": "Subir acudientes", "transicion": "cambio", "texto":
     "Se guarda como CSV, igual que los otros, y se sube en el tercer recuadro, Acudientes.",
     "run": subir_acudientes},
    {"id": "est_panel", "capitulo": "Estudiantes", "sub": "Cambios de uno en uno", "texto":
     "Para un cambio pequeño no hace falta un archivo. En la pestaña Estudiantes buscamos por nombre o documento, pulsamos Editar, y podemos cambiarle el curso o, con la casilla de activo, retirarlo. Guardar, y listo.",
     "run": estudiantes_panel},
    {"id": "calendario", "capitulo": "Calendario", "sub": "Días sin clase", "texto":
     "En Calendario se marcan los días en que no hay clase, para que a los docentes no les aparezcan listas pendientes. Con Marcar un rango elegimos desde y hasta, el tipo, por ejemplo vacaciones, un motivo, y aplicamos. Después, al ver ese rango, cada día muestra su tipo y también se puede cambiar uno solo.",
     "run": calendario},
    {"id": "usuarios", "capitulo": "Usuarios", "sub": "Crear una cuenta", "texto":
     "En Usuarios se crean las cuentas de docentes y coordinación, con correo institucional, nombre y rol. Al crearla, la aplicación muestra la contraseña temporal, cambiar uno dos tres: se la entregan al docente y en su primer ingreso el sistema le pide cambiarla. Desde aquí mismo podemos asignarle horario.",
     "run": usuarios},
    {"id": "horario_panel", "capitulo": "Horario", "sub": "Un bloque a la vez", "texto":
     "Y en Horario se agrega o corrige un bloque suelto: curso, día del ciclo, número de bloque, horas, materia y salón; el docente ya viene seleccionado. Crear bloque. Abajo se puede filtrar por curso o por docente para revisar cómo quedó la planilla.",
     "run": horario_panel},
    {"id": "cierre", "capitulo": "Resumen", "texto":
     "En resumen: estudiantes, horario y acudientes se preparan en Excel, con las columnas en el orden que muestra la pantalla, y se guardan como CSV UTF-8; se suben en ese orden; los errores se listan por línea y se vuelve a subir. Calendario, Usuarios y Horario sirven para los ajustes del día a día. Si algo no carga, envíenme el archivo y lo revisamos. Gracias.",
     "run": cierre},
]
