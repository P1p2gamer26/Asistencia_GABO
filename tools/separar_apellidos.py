"""Propone la separacion de full_name en apellidos y nombres (DRY-RUN: no toca la base).

Uso: python tools/separar_apellidos.py entrada.(csv|xlsx) salida.csv
La entrada necesita las columnas Nombre y Correo (o full_name y email). La salida trae la
propuesta y una columna 'confianza' ('revisar' = ambiguo, mirarlo a mano) para que alguien
la revise antes de cargarla. Los nombres vienen como "Nombres Apellidos".
"""
import csv
import sys

PARTICULAS = {'de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa', 'da', 'di', 'van', 'von'}


def palabras(nombre):
    """Parte en palabras y pega las particulas a la palabra siguiente ('de la Cruz')."""
    out, pend = [], []
    for w in nombre.split():
        if w.lower() in PARTICULAS:
            pend.append(w)
        else:
            out.append(' '.join(pend + [w]))
            pend = []
    if pend:                      # termina en particula: se deja pegada a la ultima
        if out:
            out[-1] = out[-1] + ' ' + ' '.join(pend)
        else:
            out = [' '.join(pend)]
    return out


def partir(nombre):
    """-> (primer_apellido, segundo_apellido, nombres, confianza)."""
    w = palabras(nombre or '')
    n = len(w)
    if n == 0:
        return '', '', '', 'revisar'
    if n == 1:
        return '', '', w[0], 'revisar'            # sin apellido: queda para full_name
    if n == 2:
        return w[1], '', w[0], 'alta'
    if n == 3:                                    # "Marcela Paola Vera" o "Ana Perez Ruiz"
        return w[2], '', ' '.join(w[:2]), 'revisar'
    if n == 4:
        return w[2], w[3], ' '.join(w[:2]), 'alta'
    return w[2], ' '.join(w[3:]), ' '.join(w[:2]), 'revisar'


def leer(ruta):
    if ruta.lower().endswith('.xlsx'):
        import openpyxl
        filas = list(openpyxl.load_workbook(ruta, read_only=True, data_only=True).active.iter_rows(values_only=True))
        cab = [str(c or '').strip().lower() for c in filas[0]]
        return [dict(zip(cab, f)) for f in filas[1:]]
    with open(ruta, encoding='utf-8-sig', newline='') as f:
        return [{k.strip().lower(): v for k, v in r.items()} for r in csv.DictReader(f)]


def main(entrada, salida):
    with open(salida, 'w', encoding='utf-8-sig', newline='') as o:
        w = csv.writer(o)
        w.writerow(['email', 'full_name', 'last_name', 'second_surname', 'first_names', 'confianza'])
        for r in leer(entrada):
            nombre = str(r.get('nombre') or r.get('full_name') or '').strip()
            correo = str(r.get('correo') or r.get('email') or '').strip()
            if nombre or correo:
                w.writerow([correo, nombre, *partir(nombre)])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
