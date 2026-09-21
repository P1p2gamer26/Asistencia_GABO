import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Escudo from '../components/Escudo';
import BotonInstalar from '../components/BotonInstalar';

// Reel de 61 s con siete tomas del colegio (dron, patio, panoramica) unidas con fundidos.
// Se arma con ffmpeg desde los videos originales; ver docs/portada-reel.md.

const NOVEDADES = [
  { foto: '/fotos/colegio-2.jpg', tipo: 'Docentes', fecha: '15 de septiembre de 2026',
    titulo: 'Toma de asistencia sin internet: la lista se guarda en el celular y sube sola',
    texto: 'La aplicación instalada funciona sin señal dentro del colegio. Lo que se marque en clase queda guardado y se sincroniza cuando vuelva la conexión.' },
  { foto: '/fotos/colegio-3.jpg', tipo: 'Coordinación', fecha: '10 de septiembre de 2026',
    titulo: 'Coordinación ya ve el panorama del día por curso y por bloque',
    texto: 'Ausentes, tardanzas y cursos sin lista tomada en una sola pantalla, con reportes en Excel listos para enviar.' },
  { foto: '/fotos/colegio-1.jpg', tipo: 'Familias', fecha: '2 de septiembre de 2026',
    titulo: 'Las familias reciben el aviso de inasistencia el mismo día',
    texto: 'Cada acudiente puede entrar con su correo y ver el historial de asistencia de los estudiantes a su cargo.' },
];

const AGENDA = [
  { dia: '21', mes: 'Sep', titulo: 'Cierre de asistencia del segundo periodo' },
  { dia: '25', mes: 'Sep', titulo: 'Reunión de acudientes: entrega de reportes' },
  { dia: '30', mes: 'Sep', titulo: 'Jornada pedagógica: no hay clases' },
  { dia: '5', mes: 'Oct', titulo: 'Inicio del tercer periodo académico' },
];

const VIDEOS = [
  { src: '/videos/promo.mp4', titulo: 'Conozca el colegio', duracion: '0:55',
    texto: 'Tomas aéreas y del patio del Colegio Gabriel García Márquez.' },
  { src: '/videos/tutorial-docentes.mp4', titulo: 'Tutorial para docentes', duracion: '2:44',
    texto: 'Cómo tomar la lista de clase desde el celular, con o sin internet.' },
  { src: '/videos/tutorial-coordinacion.mp4', titulo: 'Tutorial para coordinación', duracion: '3:10',
    texto: 'Panorama del día, ingreso al colegio, consultas y reportes.' },
  { src: '/videos/tutorial-padres.mp4', titulo: 'Tutorial para familias', duracion: '1:30',
    texto: 'Cómo entrar como acudiente y consultar la asistencia de sus hijos.' },
];

const MANUAL = [
  { rol: 'Primeros pasos (todos)', pasos: [
    'Abra el enlace del sistema en el navegador del celular o del computador.',
    'Toque "Instalar aplicación" para tenerla como una app más del teléfono: así funciona sin señal.',
    'Entre con su correo institucional y la contraseña que le entregó el colegio.',
    'La primera vez el sistema le pedirá cambiar la contraseña temporal por una propia.',
  ] },
  { rol: 'Docentes: tomar la lista de clase', pasos: [
    'Al entrar verá los bloques que tiene hoy y cuáles ya tienen lista tomada.',
    'Toque el bloque de la clase actual. Aparecen los estudiantes del curso.',
    'Junto a cada nombre marque P (presente), T (tarde), F (falta) o E (evasión). Todos empiezan en presente.',
    'Toque "Guardar". Si no hay internet, la lista queda guardada en el celular y sube sola cuando vuelva la señal.',
    'Puede corregir una lista del mismo día volviendo a abrir el bloque.',
  ] },
  { rol: 'Portería y coordinación: ingreso al colegio', pasos: [
    'Abra "Ingreso al colegio" en el menú.',
    'Apunte la cámara al código del carné del estudiante; aléjelo hasta que el código entre completo.',
    'Confirme que el nombre y la foto correspondan al estudiante.',
    'El registro queda con la hora exacta y se puede consultar después por curso o por fecha.',
  ] },
  { rol: 'Coordinación: panorama y reportes', pasos: [
    'El inicio muestra cómo va el día: cursos con lista tomada, ausentes y tardanzas.',
    'En "Tablero" vea la asistencia por curso, bloque y periodo, con gráficas.',
    'En "Consultas" busque un estudiante o un curso en un rango de fechas.',
    'Descargue el reporte en Excel con el botón "Descargar" para enviarlo o imprimirlo.',
  ] },
  { rol: 'Administración: estudiantes, calendario y horario', pasos: [
    'En "Administración" importe la lista de estudiantes desde el archivo plano de la secretaría; los retirados quedan inactivos.',
    'Cree las cuentas de docentes y acudientes; cada uno recibe una contraseña temporal.',
    'En "Calendario" marque días lectivos, festivos y jornadas pedagógicas. Los bloques van del día 1 al 5 del ciclo.',
    'En "Horario" cargue los bloques por salón o por docente.',
  ] },
  { rol: 'Familias: consultar la asistencia', pasos: [
    'Entre con el correo que registró en el colegio.',
    'Verá la asistencia de cada estudiante a su cargo, día por día y por materia.',
    'Cuando se registre una falta, recibirá un aviso por correo el mismo día.',
  ] },
];

/** Revela cada bloque con la clase `visible` cuando entra en pantalla, una sola vez. */
function useRevelar() {
  useEffect(() => {
    const nodos = document.querySelectorAll('.portal [data-revelar]');
    // jsdom no tiene IntersectionObserver: en tests se muestra todo de una.
    if (!('IntersectionObserver' in window)) { nodos.forEach((n) => n.classList.add('visible')); return; }
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    }, { threshold: 0.15 });
    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

/** Portada publica: lo que ve quien llega sin sesion, antes de entrar. */
export default function Portal() {
  const fondo = useRef<HTMLVideoElement>(null);
  useRevelar();

  // React no escribe el atributo `muted` en el DOM y Chrome solo permite autoplay
  // silenciado: se fuerza a mano y se pide play (falla sin ruido si el navegador no deja).
  useEffect(() => {
    const v = fondo.current;
    if (!v) return;
    v.muted = true;
    const arrancar = () => { try { void v.play()?.catch(() => {}); } catch { /* jsdom */ } };
    arrancar();
    // Chrome pausa videos en pestanas de fondo: al volver, se retoma.
    document.addEventListener('visibilitychange', arrancar);
    return () => document.removeEventListener('visibilitychange', arrancar);
  }, []);

  return (
    <div className="portal">
      <header className="portal-nav">
        <Link to="/" className="portal-nav-marca">
          <Escudo size={56} />
          <span><small>Colegio</small>Gabriel García Márquez</span>
        </Link>
        <nav className="portal-nav-menu" aria-label="Secciones">
          <a href="#novedades">Novedades</a>
          <a href="#videos">Videos</a>
          <a href="#manual">Manual de uso</a>
          <a href="#agenda">Agenda</a>
          <Link to="/calendario">Calendario</Link>
        </nav>
        <Link to="/login" className="portal-nav-cta">Ingresar al sistema</Link>
      </header>

      <section className="portal-hero">
        <video ref={fondo} className="portal-hero-video" src="/videos/portada.mp4" poster="/videos/dron-entrada.jpg"
               autoPlay muted loop playsInline aria-hidden="true" />
        <div className="portal-hero-texto">
          <h1>Sistema de asistencia escolar</h1>
          <p>Lista de clase, ingreso al colegio y avisos a las familias.</p>
        </div>
        <Link to="/login" className="portal-hero-cta">Tomar asistencia hoy <span aria-hidden="true">»</span></Link>
      </section>

      <main className="portal-cuerpo">
        <section id="novedades" className="portal-novedades" data-revelar>
          <h2>Novedades</h2>
          {NOVEDADES.map((n) => (
            <article key={n.titulo} className="portal-noticia">
              <img src={n.foto} alt="" loading="lazy" />
              <div>
                <h3><Link to="/login">{n.titulo}</Link></h3>
                <span className="portal-noticia-meta">{n.tipo} | {n.fecha}</span>
                <p>{n.texto}</p>
              </div>
            </article>
          ))}
        </section>

        <aside id="agenda" className="portal-agenda" data-revelar>
          <h2>Agenda</h2>
          {AGENDA.map((a) => (
            <div key={a.titulo} className="portal-evento">
              <time><strong>{a.dia}</strong>{a.mes}</time>
              <span>{a.titulo}</span>
            </div>
          ))}
          <Link to="/calendario" className="portal-agenda-todo">Ver todo el calendario</Link>
        </aside>
      </main>

      <section id="videos" className="portal-videos" data-revelar>
        <h2>Videos</h2>
        <div className="portal-videos-grid">
          {VIDEOS.map((v) => (
            <figure key={v.src} className="portal-video">
              <video src={v.src} poster={v.src.replace('.mp4', '.jpg')} controls preload="none" playsInline />
              <figcaption>
                <strong>{v.titulo}</strong> <small>{v.duracion}</small>
                <p>{v.texto}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="manual" className="portal-manual" data-revelar>
        <h2>Manual de uso</h2>
        <p className="portal-manual-intro">Paso a paso por cada tipo de usuario. Abra la sección que le corresponde.</p>
        {MANUAL.map((m, i) => (
          <details key={m.rol} open={i === 0}>
            <summary>{m.rol}</summary>
            <ol>{m.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
          </details>
        ))}
      </section>

      <footer className="portal-pie">
        <div>
          <strong>Colegio Gabriel García Márquez</strong>
          <span>Institución Educativa Distrital · Sistema de asistencia</span>
        </div>
        <BotonInstalar />
      </footer>
    </div>
  );
}
