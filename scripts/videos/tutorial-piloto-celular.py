"""Video vertical para docentes (prueba piloto): descargar la aplicación, entrar, tomar la lista.
Grabar: python ~/.claude/skills/video-tutorial/scripts/grabar.py scripts/videos/config-celular.json scripts/videos/tutorial-piloto-celular.py
Antes: UPDATE users SET must_change_password=true WHERE email='docente1@ggm.edu.co' (el video cambia la clave a Clase2026*).
"""
TITULO = "Asistencia GGM en el celular"
SUBTITULO = "Prueba piloto · guía rápida para docentes"
MOSTRAR_LOGIN = True
APP = "http://127.0.0.1:8080"

def presentacion(h):
    h.page.goto(APP + "/", wait_until="load"); h.espera(1.0)
    h.resaltar("h1", hold=3.0); h.scroll(500, 2.5); h.espera(1.0); h.scroll(500, 2.5)

def descargar(h):
    h.page.goto(APP + "/login", wait_until="load"); h.espera(0.8)
    # headless no dispara beforeinstallprompt: se simula para que aparezca el botón real de la aplicación
    h.js("window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {prompt: () => Promise.resolve()}))")
    h.resaltar("button:has-text('Instalar en el telefono')", hold=6.0)

def entrar(h):
    h.page.goto(APP + "/login", wait_until="load"); h.espera(0.6)
    h.escribir("#email", "docente1@ggm.edu.co"); h.escribir("#password", "cambiar123"); h.clic("button[type=submit]")
    h.page.wait_for_url("**/cambiar-clave", timeout=15000); h.espera(0.8); h.resaltar("h1", hold=1.5)
    h.escribir("#actual", "cambiar123"); h.escribir("#nueva", "Clase2026*"); h.escribir("#repetir", "Clase2026*")
    h.clic("button[type=submit]"); h.espera(1.2); h.clic("button:has-text('Entrar de nuevo')"); h.espera(1.0)
    h.escribir("#email", "docente1@ggm.edu.co"); h.escribir("#password", "Clase2026*"); h.clic("button[type=submit]")
    h.page.wait_for_url(APP + "/", timeout=15000)
    try: h.page.wait_for_selector(".barra-offline:has-text('todo subido')", timeout=40000)
    except Exception: print("   (la barra no llegó a 'todo subido')")
    h.espera(1.0)

def inicio(h):
    h.resaltar("h1", hold=1.5)
    h.resaltar("ul.dia-bloques li", hold=3.0)
    h.ver("h2:has-text('Listas pendientes')"); h.resaltar("h2:has-text('Listas pendientes')", hold=2.5)
    h.arriba(); h.clic("ul.dia-bloques li a.tomar-lista"); h.espera(1.5)

def lista(h):
    h.resaltar("#grado", hold=1.2); h.resaltar("#bloque", hold=1.2)
    h.resaltar("ul.estudiantes li >> nth=0", hold=2.0)
    h.clic("ul.estudiantes li >> nth=1 >> button:has-text('Tarde')"); h.espera(0.4)
    h.escribir("ul.estudiantes li >> nth=1 >> input.comentario", "Llego 10 minutos tarde")
    h.clic("ul.estudiantes li >> nth=3 >> button:has-text('Falta')"); h.espera(0.6)
    h.ver("button:has-text('Enviar asistencia')"); h.scroll(300, 0.8); h.resaltar("button:has-text('Enviar asistencia')", hold=1.0)
    h.clic("button:has-text('Enviar asistencia')"); h.espera(1.5); h.ver("p.banner"); h.resaltar("p.banner", hold=2.5)

def sin_senal(h):
    h.ctx.set_offline(True); h.espera(1.5); h.resaltar(".barra-offline", hold=4.0)
    h.ctx.set_offline(False); h.espera(2.0); h.resaltar(".barra-offline", hold=2.0)

def corregir(h):
    h.ver("aside.registradas"); h.clic("aside.registradas summary"); h.espera(0.6)
    h.resaltar("aside.registradas li >> nth=0", hold=2.0); h.clic("aside.registradas li >> nth=0 >> a"); h.espera(1.5)
    h.resaltar("h1", hold=1.0); h.ver("ul li button:has-text('Editar')"); h.resaltar("ul li button:has-text('Editar') >> nth=0", hold=2.0)

def cierre(h):
    h.page.goto(APP + "/", wait_until="load"); h.espera(1.0); h.resaltar("h1", hold=2.0)

ESCENAS = [
    {"id": "presentacion", "capitulo": "Hola", "texto":
     "¡Hola! Soy Julián Africano, y desarrollé esta aplicación para el colegio Gabriel García Márquez. La hicimos porque tomar la lista en papel o en Excel toma tiempo y la información llega tarde a coordinación. Con esta aplicación la asistencia se toma desde el celular, en un minuto, y funciona aunque no haya señal en el salón. Esta semana empezamos la prueba piloto, así que les muestro cómo usarla.",
     "run": presentacion},
    {"id": "descargar", "capitulo": "Descargar la aplicación", "texto":
     "Primero, en el navegador del celular abran asistencia guion ggm punto onrender punto com. Toquen el botón Instalar en el teléfono y queda como una aplicación más, con su ícono en la pantalla de inicio. Si no les aparece el botón: en Android, abran el menú de Chrome y elijan Instalar aplicación; en iPhone, toquen Compartir en Safari y luego Añadir a pantalla de inicio.",
     "run": descargar},
    {"id": "entrar", "capitulo": "Iniciar sesión", "sub": "Correo institucional y clave temporal", "texto":
     "Para entrar usen su correo institucional y la clave temporal que les entregó coordinación: cambiar uno dos tres. La primera vez la aplicación les pide crear una clave nueva, de mínimo ocho caracteres. La escriben dos veces, la guardan, y entran de nuevo con la clave nueva. Esa es la que van a usar de ahora en adelante.",
     "run": entrar},
    {"id": "inicio", "capitulo": "Sus clases de hoy", "texto":
     "Al entrar, la aplicación los saluda y les muestra las clases que tienen hoy, con la hora, el curso y la materia. Más abajo aparecen las listas pendientes de días anteriores, por si alguna se les quedó sin tomar. Para empezar, toquen Tomar la lista del curso que tienen ahora.",
     "run": inicio},
    {"id": "lista", "capitulo": "Tomar la lista", "texto":
     "Aquí ya vienen el curso, el bloque y la fecha de hoy, y abajo todos los estudiantes. Todos empiezan como presentes, así que solo tocan a quien no lo esté: Tarde, Falta o Evasión, y si quieren, escriben un motivo. Al final toquen Enviar asistencia. Listo, esa lista ya quedó registrada.",
     "run": lista},
    {"id": "sin_senal", "capitulo": "Sin señal también funciona", "texto":
     "Si en el salón no hay señal, no pasa nada: la barra de abajo les avisa que están sin conexión, ustedes toman la lista igual, y la aplicación la guarda en el celular. Apenas vuelva la señal, la sube sola. No tienen que hacer nada más.",
     "run": sin_senal},
    {"id": "corregir", "capitulo": "Corregir una marca", "texto":
     "Si se equivocaron con alguien, no hay problema. Debajo de la planilla están los últimos llamados de lista; toquen el que quieran revisar y ahí pueden editar la marca de cualquier estudiante. Todo cambio queda con su nombre y su hora.",
     "run": corregir},
    {"id": "cierre", "capitulo": "Gracias", "texto":
     "Eso es todo: instalar, entrar, y tomar la lista en cada clase. Esta es una prueba piloto, así que si algo no les funciona, se les hace confuso o tienen una idea para mejorarla, escríbanme por favor; con eso la vamos ajustando para que sea más fácil para todos. ¡Muchas gracias!",
     "run": cierre},
]
