"""Convierte los archivos oficiales del colegio en los CSV que ya sabe leer el sistema.

    python tools/generar-datos-oficiales.py

Lee de docs/datos-oficiales/ y escribe alli mismo estudiantes.csv y horario.csv, con
las cabeceras exactas del panel de carga (/admin -> Carga de datos). Los CSV llevan
datos personales de menores: estan en .gitignore, no se versionan.

No toca la base: la carga se hace subiendo los CSV por el panel, que usa ImportService
(upsert, una transaccion por linea).
"""
import collections
import csv
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
import pdfplumber

RAIZ = Path(__file__).resolve().parent.parent / "docs" / "datos-oficiales"
PLANO = RAIZ / "estudiantes-plano-2026-08-24.xlsx"
PDF_CURSOS = RAIZ / "horario-cursos-2026-2.pdf"

# ---------------------------------------------------------------- estudiantes


def nombre_curso(grado, grupo):
    """GRADO_COD/GRUPO del plano -> el `grade` que usa el sistema.

    Los grados 1..11 usan el GRUPO tal cual ('601', '1001'): es el mismo codigo que
    traen los PDF de horario. Preescolar viene con signo negativo en el plano y no se
    le puede quitar el signo sin mas ('-101' de jardin chocaria con el '101' de
    primero), asi que lleva prefijo de letra.
    """
    grado, grupo = str(grado).strip(), str(grupo).strip()
    if grado == "0":                       # transicion: GRUPO es 1, 2, 3
        return "T0" + grupo
    if grado == "-1":                      # jardin: -101, -102, -103
        return "J" + grupo[-2:]
    if grado == "-2":                      # prejardin: -201
        return "PJ" + grupo[-2:]
    return grupo                           # 1..11 y aceleracion (99xx, PB01, SA301)


def estudiantes():
    hoja = openpyxl.load_workbook(PLANO, read_only=True).active
    filas = hoja.iter_rows(values_only=True)
    col = {n: i for i, n in enumerate(next(filas))}

    def campo(fila, nombre):
        v = fila[col[nombre]]
        return "" if v is None else str(v).strip()

    salida, cursos, vistos = [], collections.Counter(), set()
    for n, fila in enumerate(filas, start=2):
        doc = campo(fila, "DOC")
        if not doc:
            continue
        if doc in vistos:
            sys.exit("Fila %d: documento repetido %s" % (n, doc))
        vistos.add(doc)
        curso = nombre_curso(campo(fila, "GRADO_COD"), campo(fila, "GRUPO"))
        campos = [doc, campo(fila, "NOMBRE1"), campo(fila, "NOMBRE2"),
                  campo(fila, "APELLIDO1"), campo(fila, "APELLIDO2"), curso]
        # El importador parte por comas a secas: una coma dentro de un nombre correria
        # las columnas en silencio. Mejor parar aqui.
        if any("," in c for c in campos):
            sys.exit("Fila %d: hay una coma dentro de un campo: %s" % (n, campos))
        if not campos[1] or not campos[3]:
            sys.exit("Fila %d: falta nombre o apellido: %s" % (n, campos))
        salida.append(campos)
        cursos[curso] += 1
    return salida, cursos


# ------------------------------------------------------------------- horario
# El PDF trae una pagina por curso: 5 renglones (Dia 1..5) x 8 columnas (los bloques
# 1..7 mas el DESCANSO). Las materias y los docentes se resuelven contra una lista
# cerrada, sin tildes como en la semilla: el PDF corta las palabras que no caben en la
# celda ("INFORM" + "ATICA", "CIENCIAS POLITICAS Y E") y hay que volver a pegarlas. Si
# algo no calza, el script para: mejor eso que meterle a la base una materia inventada.

MATERIAS = [
    "ARTES", "BIOLOGIA", "CALCULO", "CIENCIAS POLITICAS Y ECONOMICAS",
    "EDU. FISICA", "ESPANOL", "ETICA", "FILOSOFIA", "FISICA", "INFORMATICA",
    "INGLES", "LECTURA CRITICA", "MATEMATICAS", "PROFUNDIZACION", "QUIMICA",
    "RELIGION", "SOCIALES", "TECNOLOGIA", "TRIGONOMETRIA",
]

# Como aparecen en el PDF de cursos, ya sin tildes. Varios salen con un solo nombre
# ("YAMILE", "ANDERSSON"): asi los imprime el horario.
DOCENTES = [
    "ALEJANDRO SANCHEZ", "ALEXANDER BELTRAN", "ANDERSSON", "ANDERSSON TUNJANO",
    "CARMEN GUERRERO", "CAROLINA SALAMANCA", "CELIMA IBARRA", "CESAR ZARATE",
    "CONSTANZA ARREDONDO", "FABIOLA RICO", "FRANCISCO PALACIO", "FREDDY FARFAN",
    "GISELA PINILLA", "GUSTAVO MORENO", "JAIRO MUNOZ", "JOHN NOMESQUI",
    "JUAN C RINCON", "JULIAN VARGAS", "LEIDY LINARES", "LINA GIRALDO",
    "MARCELA PARRA", "MARCELA VERA", "MELQUISEDEC SARMIENTO", "MIGUEL BACCA",
    "MILLER VILLARRAGA", "OSCAR RAMIREZ", "VICTOR ESPITIA", "YAMILE",
    "YAMILE PACHON", "YAZMIN MORENO",
]

# El PDF identifica a los docentes por nombre y el sistema por correo. Los correos
# institucionales todavia no los tiene el colegio: mientras no esten aqui, horario.csv
# sale con el nombre del docente en la columna del correo (o sea, como borrador, no
# como archivo para subir) y el script lo avisa al terminar.
#
# Cuando lleguen: "NOMBRE COMO SALE ARRIBA": "correo@...", y subir horario.csv. El
# ON CONFLICT (grade, weekday, block_no) DO UPDATE de ImportService le cambia el
# docente a cada bloque sin duplicar nada.
CORREOS = {}

BLOQUES = [                                # columna del PDF -> bloque y horas
    (1, "06:30", "07:35"), (2, "07:35", "08:25"), (3, "08:25", "09:15"),
    (4, "09:15", "10:05"), None,           # la quinta columna es el DESCANSO
    (5, "10:35", "11:25"), (6, "11:25", "12:15"), (7, "12:15", "13:30"),
]
COLUMNAS = [90, 175, 262, 348, 434, 521, 607, 693, 779]


def plano(texto):
    """'INGLES' <- 'Ingles' / 'INGLES' con tilde. Los nombres van sin tildes, como en
    la semilla (V3__datos_semilla.sql: 'Matematicas', 'Espanol')."""
    sin = unicodedata.normalize("NFD", texto)
    return re.sub(r"\s+", " ", "".join(c for c in sin if not unicodedata.combining(c))
                  ).strip().upper()


def resolver(texto, candidatos, donde):
    t = plano(texto)
    iguales = [c for c in candidatos if c == t] or [c for c in candidatos
                                                    if c.startswith(t)]
    if len(iguales) != 1:
        sys.exit("%s: no se pudo resolver %r (calzan %s)" % (donde, texto, iguales))
    return iguales[0]


def unir(lineas, candidatos, donde):
    """Une los renglones de una celda. El PDF parte las palabras largas por la mitad
    ('INFORM' + 'ATICA'), asi que se prueba pegado y separado contra la lista."""
    for pegamento in ("", " "):
        texto = pegamento.join(lineas)
        if any(c.startswith(plano(texto)) for c in candidatos):
            return resolver(texto, candidatos, donde)
    return resolver(" ".join(lineas), candidatos, donde)


def bandas(pagina):
    """Los cinco renglones Dia 1..5, por las lineas horizontales de la tabla."""
    ys = sorted({round(r["top"], 1) for r in pagina.rects
                 if r["width"] > 60 and r["height"] < 2})
    return [(ys[i], ys[i + 1]) for i in range(1, len(ys) - 1)]


def separadores(pagina, arriba, abajo):
    """Las verticales presentes en ese renglon. Las que faltan son celdas unidas: una
    clase que ocupa dos bloques seguidos."""
    alto = collections.Counter()
    for r in pagina.rects:
        if (r["width"] < 3 and r["height"] > 3
                and r["top"] >= arriba - 1 and r["bottom"] <= abajo + 1):
            alto[round(r["x0"])] += r["height"]
    presentes = [x for x, h in alto.items() if h > (abajo - arriba) * 0.8 and x >= 80]
    # El borde izquierdo se dibuja en 88; la columna empieza en 90.
    return sorted({90 if x < 95 else x for x in presentes} | {779})


def renglones(palabras):
    grupos = collections.OrderedDict()
    for p in sorted(palabras, key=lambda p: (round(p["top"] / 4), p["x0"])):
        grupos.setdefault(round(p["top"] / 4), []).append(p["text"])
    return [" ".join(v) for v in grupos.values()]


def primer_docente(crudo, donde):
    """La celda de profundizacion de 10 y 11 lista dos electivas con su docente cada
    una, todo en letra pequena. El sistema guarda un docente por bloque: queda el
    primero que aparezca."""
    texto = plano(crudo)
    encontrados = [(texto.index(d), -len(d), d) for d in DOCENTES if d in texto]
    if not encontrados:
        sys.exit("%s: profundizacion sin docente reconocible: %r" % (donde, texto))
    return min(encontrados)[2]


def titulo(nombre):
    """MATEMATICAS -> Matematicas, como los nombres de materia de la semilla."""
    return " ".join(p[:1] + p[1:].lower() for p in nombre.split())


def horario():
    salida, por_curso = [], collections.Counter()
    with pdfplumber.open(PDF_CURSOS) as pdf:
        for pagina in pdf.pages:
            curso = pagina.extract_text().split("\n")[0].strip()
            for dia, (arriba, abajo) in enumerate(bandas(pagina), start=1):
                xs = separadores(pagina, arriba, abajo)
                anterior = None
                for a, b in zip(xs, xs[1:]):
                    if a >= 434 and b <= 521:
                        continue                        # DESCANSO
                    palabras = pagina.crop(
                        (a + 1, arriba + 1, b - 1, abajo - 1)
                    ).extract_words(extra_attrs=["size"])
                    if not palabras:
                        continue                        # bloque libre
                    firma = tuple(p["text"] for p in palabras)
                    if firma == anterior:
                        continue    # celda ancha que el recorte devuelve dos veces
                    anterior = firma
                    donde = "%s dia %d x=%d" % (curso, dia, a)
                    grandes = [p for p in palabras if p["size"] > 10]
                    if grandes:
                        lineas = renglones(grandes)
                        if lineas[0].strip().upper() == "OPTATIVA":
                            lineas = lineas[1:]         # el rotulo, no la materia
                        materia = unir(lineas, MATERIAS, donde)
                        y0 = min(p["top"] for p in grandes)
                        y1 = max(p["bottom"] for p in grandes)
                        docente = unir(renglones([p for p in palabras
                                                  if p["size"] <= 10 and p["bottom"] <= y0]),
                                       DOCENTES, donde)
                        aula = " ".join(renglones([p for p in palabras
                                                   if p["size"] <= 10 and p["top"] >= y1]))
                    else:
                        materia, aula = "PROFUNDIZACION", ""
                        docente = primer_docente(" ".join(renglones(palabras)), donde)
                    for col in range(COLUMNAS.index(a), COLUMNAS.index(b)):
                        if BLOQUES[col] is None:
                            continue
                        n, ini, fin = BLOQUES[col]
                        salida.append([curso, dia, n, ini, fin, titulo(materia),
                                       CORREOS.get(docente, docente),
                                       plano(aula).replace(",", " ")])
                        por_curso[curso] += 1
    return salida, por_curso


# ------------------------------------------------------------------- salida


def escribir(ruta, cabecera, filas):
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(cabecera)
        w.writerows(filas)
    print("%s: %d lineas" % (ruta.name, len(filas)))


def comprobar(bloques, cursos):
    """Lo que tiene que cumplirse si el PDF se leyo bien. Si algo no cuadra es mejor
    saberlo aqui que despues de subirle a produccion un horario mal armado."""
    ranuras = collections.Counter((b[0], b[1], b[2]) for b in bloques)
    repetidas = [r for r, n in ranuras.items() if n > 1]
    assert not repetidas, "ranuras repetidas (se pisarian al importar): %s" % repetidas[:5]
    por_dia = collections.Counter((b[0], b[1]) for b in bloques)
    assert max(por_dia.values()) <= 7, "algun dia quedo con mas de 7 bloques: %s" % (
        por_dia.most_common(1))
    sin_curso = {b[0] for b in bloques} - set(cursos)
    assert not sin_curso, "hay horario de cursos que no existen en el plano: %s" % sin_curso


def main():
    alumnos, cursos = estudiantes()
    escribir(RAIZ / "estudiantes.csv",
             ["document_id", "first_name", "middle_name", "last_name",
              "second_surname", "grade"], alumnos)
    print("  %d cursos: %s" % (len(cursos),
                               ", ".join("%s=%d" % kv for kv in sorted(cursos.items()))))

    bloques, por_curso = horario()
    comprobar(bloques, cursos)
    escribir(RAIZ / "horario.csv",
             ["grade", "weekday", "block_no", "start_time", "end_time", "subject",
              "teacher_email", "room"], bloques)
    print("  bloques por curso: %s"
          % ", ".join("%s=%d" % kv for kv in por_curso.items()))
    faltan = sorted({b[6] for b in bloques if "@" not in b[6]})
    if faltan:
        print("  OJO: horario.csv es un BORRADOR, no subirlo. Faltan los correos de: %s"
              % ", ".join(faltan))


if __name__ == "__main__":
    main()
