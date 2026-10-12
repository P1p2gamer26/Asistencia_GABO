"""Escenas de Excel de escritorio para el tutorial de coordinación (las graba con el cursor real de Windows).
Uso: uv run --isolated --with pywinauto --with pyautogui --with pyperclip --with pillow python -I scripts/videos/excel-coordinacion.py [escena ...]
Escenas: hoja_est guardar hoja_hor acud (por defecto todas, en ese orden).
Salida: <tutorial>/externo/<id>.mp4 (lo usa montar.py en vez del navegador) y <tutorial>/excel/*.csv (los guarda Excel;
la grabación del navegador los sube). Toma el mouse y el teclado: no tocar el PC mientras corre.
Mover el mouse a una esquina de la pantalla aborta (failsafe de pyautogui).
"""
import ctypes, importlib.util, subprocess, sys, time
from pathlib import Path

ctypes.windll.shcore.SetProcessDpiAwareness(2)  # coordenadas en píxeles reales, iguales a las de gdigrab
import comtypes.client, pyautogui, pyperclip
from pywinauto import Desktop
from PIL import ImageGrab

AQUI = Path(__file__).parent
spec = importlib.util.spec_from_file_location("tut", AQUI / "tutorial-coordinacion-datos.py")
tut = importlib.util.module_from_spec(spec); spec.loader.exec_module(tut)
OUT = tut.EXCEL.parent; EXT = OUT / "externo"; EXT.mkdir(exist_ok=True); tut.EXCEL.mkdir(exist_ok=True)
FFMPEG = r"C:\Users\Julian\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe"
DUR = {"hoja_est": 23.5, "guardar": 20.0, "hoja_hor": 23.7, "acud": 11.3}  # narración (vo/<id>.mp3), en segundos
XL_CSV_UTF8 = 62
pyautogui.FAILSAFE = True; pyautogui.PAUSE = 0.05

xl = comtypes.client.CreateObject("Excel.Application"); xl.Visible = True
ventana = lambda: Desktop(backend="uia").window(handle=xl.Hwnd)  # la de esta instancia, aunque haya otro Excel abierto

def foto(nombre): ImageGrab.grab().save(EXT / f"_{nombre}.png")

def mover(x, y, d=0.6): pyautogui.moveTo(x, y, duration=d, tween=pyautogui.easeInOutQuad)

def clic_en(rect, d=0.6, espera=0.6):
    mover((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2, d); pyautogui.click(); time.sleep(espera)

def elemento(raiz, nombre, tipo=None, timeout=8):
    """Primer descendiente visible cuyo nombre empieza por `nombre` (los de Office traen sufijos como atajos)."""
    fin = time.time() + timeout
    while time.time() < fin:
        for e in raiz.descendants(control_type=tipo) if tipo else raiz.descendants():
            try:
                if e.window_text().startswith(nombre) and e.is_visible(): return e
            except Exception: pass
        time.sleep(0.3)
    foto("error"); raise RuntimeError(f"no aparece {tipo or ''} '{nombre}' (ver externo/_error.png)")

def celda(ref):
    """Centro de una celda en píxeles de pantalla. PointsToScreenPixels solo da el origen de la cuadrícula: el resto
    va en puntos y hay que escalarlo por DPI y zoom (sin eso, a 130 % el clic en A2 caía en la fila 1)."""
    r = xl.ActiveSheet.Range(ref); w = xl.ActiveWindow
    k = ctypes.windll.user32.GetDpiForWindow(xl.Hwnd) / 72 * w.Zoom / 100
    x = w.PointsToScreenPixelsX(0) + round((r.Left + r.Width / 2) * k)
    y = w.PointsToScreenPixelsY(0) + round((r.Top + r.Height / 2) * k)
    bajo = w.RangeFromPoint(x, y)
    bajo = comtypes.client.dynamic.Dispatch(bajo).Address(False, False) if bajo else None
    if bajo != ref: raise RuntimeError(f"{ref} calculada en ({x},{y}) cae en {bajo}")
    return x, y

def libro_nuevo(anchos):
    wb = xl.Workbooks.Add(); xl.WindowState = -4137  # maximizado
    for col, ancho in zip("ABCDEFGH", anchos): xl.ActiveSheet.Columns(col).ColumnWidth = ancho
    xl.ActiveWindow.Zoom = 130; xl.ActiveSheet.Range("A1").Select()
    ventana().set_focus(); mover(960, 600, 0.2); time.sleep(1.0)
    return wb

class Grabacion:
    """gdigrab de la pantalla completa; al cerrar difumina lo personal, recorta la barra de tareas a 16:9 y deja externo/<id>.mp4."""
    def __init__(self, nombre): self.nombre, self.crudo, self.borrosos = nombre, EXT / f"_{nombre}.mkv", []
    def __enter__(self):
        self.p = subprocess.Popen([FFMPEG, "-v", "error", "-y", "-f", "gdigrab", "-framerate", "30", "-draw_mouse", "1", "-i", "desktop",
                                   "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", str(self.crudo)], stdin=subprocess.PIPE)
        self.lanzado = time.time(); time.sleep(1.2); self.t0 = time.time(); return self
    def ahora(self): return time.time() - self.lanzado - 1.0  # tiempo en el video final (se le quita el primer segundo)
    def difuminar(self, desde, hasta, *rects):
        """rects = (x0, y0, x1, y1) en píxeles de pantalla. Ventana holgada: el arranque de gdigrab no es exacto."""
        self.borrosos += [(max(0.0, desde - 0.5), hasta + 0.4, r) for r in rects]
    def rellenar(self):  # la escena dura al menos lo que su narración
        time.sleep(max(0.0, DUR[self.nombre] + 0.4 - (time.time() - self.t0)))
    def notificaciones(self, rect=(1420, 680, 1920, 1032), mira=(1420, 700, 1880, 940), fps=10):
        """Las notificaciones de Windows (WhatsApp...) salen abajo a la derecha, sobre la hoja blanca: donde esa esquina
        se oscurece se difumina `rect`. `mira` es solo cuadrícula (sin pestañas, barra de estado ni scroll, que son
        oscuras con el tema oscuro). En la pantalla Archivo (oscura) también salta, y ahí ya va difuminado."""
        x0, y0, x1, y1 = mira
        crudo = subprocess.run([FFMPEG, "-v", "error", "-i", str(self.crudo), "-vf", f"fps={fps},crop={x1 - x0}:{y1 - y0}:{x0}:{y0},scale=40:30,format=gray",
                                "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
        oscuros = [i / fps - 1.0 for i in range(len(crudo) // 1200) if sum(crudo[i * 1200:(i + 1) * 1200]) / 1200 < 200]
        tramos = []
        for t in oscuros:
            if tramos and t - tramos[-1][1] <= 0.3: tramos[-1][1] = t
            else: tramos.append([t, t])
        self.borrosos += [(max(0.0, a - 0.4), b + 0.5, rect) for a, b in tramos]
        if oscuros: print(f"   {self.nombre}: esquina difuminada en {len(oscuros)} cuadros")
    def __exit__(self, tipo, *_):
        self.p.communicate(b"q", timeout=30)
        if tipo: return False
        self.notificaciones()
        fc, prev = "", "[0:v]"
        for i, (t0, t1, (x0, y0, x1, y1)) in enumerate(self.borrosos):
            fc += (f"{prev}split[a{i}][b{i}];[b{i}]crop={x1 - x0}:{y1 - y0}:{x0}:{y0},boxblur=24:3[c{i}];"
                   f"[a{i}][c{i}]overlay={x0}:{y0}:enable='between(t,{t0:.2f},{t1:.2f})'[v{i}];"); prev = f"[v{i}]"
        # 1834x1032 = 16:9 sin la barra de tareas (48 px abajo); centrado horizontal.
        fc += f"{prev}crop=1834:1032:43:0,scale=1920:1080,fps=30[out]"
        subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "1.0", "-i", str(self.crudo), "-filter_complex", fc, "-map", "[out]",
                        "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(EXT / f"{self.nombre}.mp4")], check=True)
        self.crudo.unlink(); print(self.nombre, "ok")

def escribir_titulos(titulos):
    mover(*celda("A1")); pyautogui.click(); time.sleep(0.3)
    for t in titulos: pyautogui.write(t, interval=0.045); pyautogui.press("tab"); time.sleep(0.15)
    pyautogui.press("enter")

def pegar_filas(filas):
    pyperclip.copy("\r\n".join("\t".join(f) for f in filas))
    mover(*celda("A2")); pyautogui.click(); time.sleep(0.3); pyautogui.hotkey("ctrl", "v"); time.sleep(0.8)
    pyautogui.press("esc")

def recorrer(refs, s=1.2):
    for ref in refs: mover(*celda(ref)); time.sleep(s)

def guardar_csv_com(wb, nombre):
    """Igual que Archivo > Guardar como > CSV UTF-8 (Local=True usa el separador de lista de Windows, como la interfaz)."""
    xl.DisplayAlerts = False; wb.SaveAs(str(tut.EXCEL / f"{nombre}.csv"), XL_CSV_UTF8, Local=True); xl.DisplayAlerts = True

# ---------------------------------------------------------------- escenas
def hoja_est():
    global libro_est
    libro_est = libro_nuevo([13, 15, 16, 16, 17, 8, 8])
    with Grabacion("hoja_est") as g:
        time.sleep(1.5)
        escribir_titulos(tut.ESTUDIANTES[0])
        pegar_filas(tut.ESTUDIANTES[1:])
        recorrer(["F2", "F5"], 1.6); recorrer(["G2", "G6"], 1.8); recorrer(["C3", "C6"], 1.2)
        g.rellenar()

def guardar():
    """Archivo > Guardar como > Examinar > Tipo: CSV UTF-8 > Guardar, todo con el mouse."""
    previa = xl.DefaultFilePath; xl.DefaultFilePath = str(tut.EXCEL)  # el diálogo abre en la carpeta del tutorial
    destino = tut.EXCEL / "estudiantes.csv"; destino.unlink(missing_ok=True)
    try:
        with Grabacion("guardar") as g:
            time.sleep(1.0)
            v = ventana()
            archivo = v.child_window(auto_id="FileTabButton").rectangle()
            t_menu = g.ahora() + 0.6  # la pantalla Archivo (con recientes) aparece al terminar el movimiento
            clic_en(archivo, espera=1.4)
            guardar_como = v.child_window(title="Guardar como", control_type="ListItem").rectangle()
            # Inicio de la pantalla Archivo: nombres de archivos recientes abajo a la izquierda.
            g.difuminar(t_menu, g.ahora() + 0.6, (240, 800, 600, 1010))
            clic_en(guardar_como, espera=1.4)
            clic_en(v.child_window(title="Examinar", control_type="Button").rectangle(), espera=0.2)
            dlg = v.child_window(title="Guardar como", control_type="Window"); dlg.wait("visible", timeout=10); time.sleep(0.8)
            t_dlg = g.ahora(); d = dlg.rectangle()
            # Pantalla Archivo > Guardar como: cuenta de OneDrive, recientes y lista de archivos del usuario.
            g.difuminar(t_menu, t_dlg, (240, 130, 600, 800), (600, 130, 1900, 1010))
            clic_en(dlg.child_window(title="Nombre de archivo:", control_type="Edit").rectangle(), espera=0.3)
            pyautogui.hotkey("ctrl", "a"); pyautogui.write("estudiantes", interval=0.07); time.sleep(0.6)
            clic_en(dlg.child_window(title="Tipo:", control_type="ComboBox").rectangle(), espera=1.0)
            opcion = elemento(dlg, "CSV UTF-8", "ListItem")
            time.sleep(0.4); clic_en(opcion.rectangle(), espera=1.0)
            clic_en(dlg.child_window(title="Guardar", control_type="Button").rectangle(), espera=2.0)
            t_fin = g.ahora()
            # Con el diálogo abierto: lo que se ve de la pantalla Archivo a su derecha y el panel de carpetas del diálogo.
            g.difuminar(t_dlg, t_fin, (max(d.right, 600), 130, 1900, 1010), (600, max(d.bottom, 130), max(d.right, 601), 1010),
                        (d.left + 8, d.top + 135, d.left + 200, d.top + 390))
            mover(900, 300, 1.0)  # hacia la barra amarilla de "posible pérdida de datos", si aparece
            g.rellenar()
    finally:
        xl.DefaultFilePath = previa
    if not destino.exists(): raise RuntimeError(f"Excel no guardó {destino}")
    libro_est.Close(False)

def hoja_hor():
    wb = libro_nuevo([7, 6, 8, 12, 10, 14, 26, 13])
    with Grabacion("hoja_hor") as g:
        time.sleep(1.2)
        escribir_titulos(tut.HORARIO[0])
        pegar_filas(tut.HORARIO[1:])
        recorrer(["B2", "C3", "D2", "E2", "G2", "H5"], 1.4)
        g.rellenar()
    guardar_csv_com(wb, "horario"); wb.Close(False)

def acud():
    wb = libro_nuevo([22, 20, 30, 12])
    with Grabacion("acud") as g:
        time.sleep(0.8)
        escribir_titulos(tut.ACUDIENTES[0])
        pegar_filas(tut.ACUDIENTES[1:])
        recorrer(["C2", "D3"], 1.2)
        g.rellenar()
    guardar_csv_com(wb, "acudientes"); wb.Close(False)

if __name__ == "__main__":
    pedidas = sys.argv[1:] or ["hoja_est", "guardar", "hoja_hor", "acud"]
    try:
        for e in pedidas: globals()[e]()
    finally:  # la instancia es nuestra (CreateObject): se cierra sin guardar lo que quede abierto
        for i in range(xl.Workbooks.Count, 0, -1): xl.Workbooks(i).Close(False)
        xl.Quit()
    for f in sorted(tut.EXCEL.glob("*.csv")): print(f.name, "|", f.read_text(encoding="utf-8-sig").splitlines()[:2])
