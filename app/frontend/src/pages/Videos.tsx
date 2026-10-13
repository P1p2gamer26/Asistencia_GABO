import { getSession } from '../api/client';
import { VIDEOS } from '../lib/videos';

export default function Videos() {
  const rol = getSession()!.role;
  return (
    <main className="card ancha">
      <h1>Videos tutoriales</h1>
      <div className="portal-videos-grid">
        {VIDEOS.filter((v) => v.roles.includes(rol)).map((v) => (
          <figure key={v.src} className="portal-video">
            <video src={v.src} poster={v.src.replace('.mp4', '.jpg')} controls preload="none" playsInline />
            <figcaption>
              <strong>{v.titulo}</strong> <small>{v.duracion}</small>
              <p>{v.texto}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
