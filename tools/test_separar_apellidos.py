"""python tools/test_separar_apellidos.py  (sin dependencias)"""
from separar_apellidos import partir

CASOS = {
    'Alejandro Ruge': ('Ruge', '', 'Alejandro', 'alta'),                       # dos palabras
    'Madonna': ('', '', 'Madonna', 'revisar'),                                 # una sola
    'Marcela Paola Vera': ('Vera', '', 'Marcela Paola', 'revisar'),            # tres: ambiguo
    'Leidy Johanna Linares Rueda': ('Linares', 'Rueda', 'Leidy Johanna', 'alta'),  # compuesto
    'Maria de la Cruz': ('de la Cruz', '', 'Maria', 'alta'),                   # particulas
    'Juan Carlos de los Rios Perez': ('de los Rios', 'Perez', 'Juan Carlos', 'alta'),
    '  Ana   Gomez ': ('Gomez', '', 'Ana', 'alta'),                            # espacios
    '': ('', '', '', 'revisar'),
}

if __name__ == '__main__':
    for nombre, esperado in CASOS.items():
        assert partir(nombre) == esperado, (nombre, partir(nombre), esperado)
    print('OK', len(CASOS), 'casos')
