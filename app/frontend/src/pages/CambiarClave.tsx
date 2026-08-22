import { useState } from 'react';
import { api, getSession, clearSession } from '../api/client';

export default function CambiarClave() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Se comprueba antes de llamar: sin conexion, el aviso llega igual y al instante.
    if (nueva !== repetir) { setError('Las dos contrasenas nuevas no coinciden.'); return; }
    if (nueva.length < 8) { setError('La contrasena nueva debe tener al menos 8 caracteres.'); return; }
    if (nueva === actual) { setError('La contrasena nueva debe ser distinta de la actual.'); return; }

    setEnviando(true);
    try {
      await api.post('/api/auth/change-password',
        { currentPassword: actual, newPassword: nueva });
      setListo(true);
    } catch {
      setError('No se pudo cambiar. Revise que la contrasena actual sea correcta.');
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <main className="card">
        <h1>Contrasena cambiada</h1>
        <p>Vuelva a entrar con su contrasena nueva.</p>
        <button type="button" onClick={() => { clearSession(); location.href = '/login'; }}>
          Entrar de nuevo
        </button>
      </main>
    );
  }

  return (
    <main className="card">
      <h1>Cambie su contrasena</h1>
      <p className="meta">
        {getSession()?.mustChangePassword
          ? 'Su contrasena es la temporal que le asignaron. Cambiela para continuar.'
          : 'Escriba su contrasena actual y la nueva.'}
      </p>
      <form className="login" onSubmit={enviar}>
        <label htmlFor="actual">Contrasena actual</label>
        <input id="actual" type="password" autoComplete="current-password" required
               value={actual} onChange={(e) => setActual(e.target.value)} />
        <label htmlFor="nueva">Nueva contrasena</label>
        <input id="nueva" type="password" autoComplete="new-password" required
               value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <label htmlFor="repetir">Repetir la nueva</label>
        <input id="repetir" type="password" autoComplete="new-password" required
               value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Cambiando...' : 'Cambiar contrasena'}
        </button>
      </form>
    </main>
  );
}
