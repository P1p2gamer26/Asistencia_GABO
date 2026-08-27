"""Genera los iconos de la aplicacion a partir del escudo del colegio.

    python tools/generar-iconos.py

Fuente:  docs/marca/logo-colegio.jpeg  (foto del escudo sobre fondo blanco)
Salida:  app/frontend/public/{icon-192.png, icon-512.png, favicon.ico, escudo.png}

Se deja como script y no como paso del build porque el escudo cambia una vez cada
varios anos: meterlo en cada compilacion seria pagar siempre por algo que casi nunca
pasa. Si el colegio cambia de logo, se reemplaza la foto y se vuelve a ejecutar esto.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[1]
ORIGEN = RAIZ / "docs" / "marca" / "logo-colegio.jpeg"
DESTINO = RAIZ / "app" / "frontend" / "public"

FONDO = (245, 243, 234)      # #f5f3ea, el background_color del manifest
# El limite del proyecto para imagenes del paquete son 30 KB. Esa regla existe para
# lo que viaja en cada carga; el icono de 512 (purpose any) no viaja en cada carga,
# lo precarga el service worker una sola vez en la instalacion. Con ocupacion 0.88
# (igual que icon-192.png, para que el escudo llene el marco y no se vea pequeno
# dentro del icono sin recorte) pesa hasta 48 KB: 8 KB de mas sobre el limite base,
# pagados una vez por instalacion, a cambio de que el icono any deje de verse
# descentrado del marco.
LIMITES = {"icon-192.png": 30 * 1024, "icon-512.png": 48 * 1024,
           "favicon.ico": 30 * 1024, "escudo.png": 120 * 1024,
           "icon-maskable-512.png": 40 * 1024, "apple-touch-icon.png": 30 * 1024}


def escudo() -> Image.Image:
    """El escudo recortado, con el fondo exterior transparente.

    Se quita solo el blanco **conectado al borde**: un umbral global perforaria la
    banda del nombre, el libro y las nubes, que tambien son blancos.
    """
    img = Image.open(ORIGEN).convert("RGB")

    casi_blanco = img.convert("L").point(lambda p: 255 if p >= 232 else 0).convert("L")
    ImageDraw.floodfill(casi_blanco, (0, 0), 128, thresh=0)
    for esquina in ((img.width - 1, 0), (0, img.height - 1),
                    (img.width - 1, img.height - 1)):
        if casi_blanco.getpixel(esquina) == 255:
            ImageDraw.floodfill(casi_blanco, esquina, 128, thresh=0)

    rgba = img.convert("RGBA")
    rgba.putalpha(casi_blanco.point(lambda p: 0 if p == 128 else 255))

    # El original es la foto de una tela bordada: el ruido crea miles de colores que
    # hinchan el PNG sin aportar nada visible. La mediana lo limpia sin comerse bordes.
    rgba = rgba.filter(ImageFilter.MedianFilter(size=5))
    return rgba.crop(rgba.getbbox())


def icono(base: Image.Image, lado: int, ocupacion: float,
          transparente: bool = False) -> Image.Image:
    """Escudo centrado en un lienzo cuadrado, ocupando la fraccion indicada.

    `ocupacion` importa para el icono maskable: Android lo recorta a un circulo del
    80 % del lienzo, asi que a pantalla completa se comeria el texto del borde.
    """
    disponible = int(lado * ocupacion)
    escala = min(disponible / base.width, disponible / base.height)
    reducido = base.resize((int(base.width * escala), int(base.height * escala)),
                           Image.LANCZOS)

    relleno = (0, 0, 0, 0) if transparente else FONDO + (255,)
    lienzo = Image.new("RGBA", (lado, lado), relleno)
    lienzo.paste(reducido, ((lado - reducido.width) // 2,
                            (lado - reducido.height) // 2), reducido)
    return lienzo if transparente else lienzo.convert("RGB")


def guardar(img: Image.Image, ruta: Path, limite: int) -> None:
    """Guarda por debajo del limite, reduciendo la paleta si hace falta.

    Sin difuminado a proposito: el escudo son colores planos, y el dither que aplica
    la cuantizacion por defecto anade un ruido que no se ve y no comprime.
    """
    import io

    def bytes_de(candidata: Image.Image) -> bytes:
        buf = io.BytesIO()
        candidata.save(buf, "PNG", optimize=True)
        return buf.getvalue()

    # Si el color real ya cabe, se deja: cuantizar sin necesidad solo empeora el
    # texto en anillo del escudo a cambio de unos kilobytes que sobran.
    mejor = bytes_de(img)
    if len(mejor) <= limite:
        ruta.write_bytes(mejor)
        return

    # Se prueban todas y se conserva la mas pequena. Quedarse con el ultimo intento
    # puede dejar un fichero mayor que el primero: reducir la paleta no siempre
    # comprime mejor, sobre todo si la imagen ya venia palettizada.
    for colores in (192, 128, 96, 64, 48):
        candidata = bytes_de(img.convert("P", palette=Image.ADAPTIVE, colors=colores,
                                         dither=Image.Dither.NONE))
        if len(candidata) < len(mejor):
            mejor = candidata
        if len(mejor) <= limite:
            break
    ruta.write_bytes(mejor)


if __name__ == "__main__":
    base = escudo()
    print(f"escudo recortado: {base.size}")

    # 192 no se recorta nunca, asi que puede ir mas holgado.
    guardar(icono(base, 192, 0.88), DESTINO / "icon-192.png", LIMITES["icon-192.png"])
    # 512 no se recorta: el maskable vive en su propio fichero, asi que este puede
    # llenar el marco igual que el de 192, con el mismo 0.88 (ver LIMITES arriba
    # sobre por que a 48 KB en vez de 30-40).
    guardar(icono(base, 512, 0.88), DESTINO / "icon-512.png", LIMITES["icon-512.png"])
    # Favicon: nunca se recorta y a 16 px solo se distingue la silueta.
    icono(base, 256, 0.98, transparente=True).save(
        DESTINO / "favicon.ico", "ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    # Escudo para la interfaz: fondo transparente, porque se pinta sobre la tarjeta
    # crema del login y sobre el encabezado. A 288 px se ve nitido a triple densidad
    # en el tamano mayor en que se usa (96 px en el login).
    #
    # El limite es holgado a proposito: este escudo lleva texto en anillo y un cielo
    # con degradado, y al cuantizarlo a paleta el texto se convierte en manchas. Es un
    # solo fichero, lo cachea el service worker en la primera visita y no vuelve a
    # descargarse; ahorrar 80 KB una vez no compensa un escudo ilegible. El fichero
    # pesa porque el original es la foto de un escudo impreso y conserva la trama de
    # semitono; a 288 px en color real cabe en el limite y el texto del anillo se lee.
    guardar(icono(base, 288, 0.98, transparente=True), DESTINO / "escudo.png",
            LIMITES["escudo.png"])

    # Maskable en su propio fichero: Android recorta hasta el 20 % de cada borde, asi
    # que el escudo va al 68 % del lienzo. Compartir fichero con el icono normal
    # obligaba a elegir: o sobrevive al recorte, o llena el marco cuando no lo hay.
    guardar(icono(base, 512, 0.68), DESTINO / "icon-maskable-512.png",
            LIMITES["icon-maskable-512.png"])

    # iOS pide 180 px y NO respeta la transparencia: la rellena de negro. Va con el
    # fondo crema del manifest, no transparente.
    guardar(icono(base, 180, 0.86), DESTINO / "apple-touch-icon.png",
            LIMITES["icon-192.png"])

    for nombre in ("icon-192.png", "icon-512.png", "favicon.ico", "escudo.png",
                   "icon-maskable-512.png", "apple-touch-icon.png"):
        tam = (DESTINO / nombre).stat().st_size
        marca = "OK " if tam <= LIMITES[nombre] else "GRANDE"
        print(f"  {marca} {nombre}: {tam / 1024:.1f} KB")
