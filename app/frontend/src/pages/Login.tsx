import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Escudo from '../components/Escudo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible iniciar sesion');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <header className="marca">
        <Escudo size={128} />
        <div>
          <span className="eyebrow">Planilla de asistencia</span>
          <h1>Asistencia GGM</h1>
          <p className="meta">Colegio Gabriel Garcia Marquez</p>
        </div>
      </header>
      <label htmlFor="email">Correo institucional</label>
      <input id="email" type="email" autoComplete="username" required
             value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Contrasena</label>
      <input id="password" type="password" autoComplete="current-password" required
             value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
    </form>
  );
}
