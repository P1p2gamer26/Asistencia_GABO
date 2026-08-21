import { Navigate, Route, Routes } from 'react-router-dom';
import { getSession } from './api/client';

// Track B rellena estos:
import Login from './pages/Login';
import Home from './pages/Home';
import TomarAsistencia from './pages/TomarAsistencia';
import Ingreso from './pages/Ingreso';
// Track C rellena estos:
import Consultas from './pages/Consultas';
import Dashboard from './pages/Dashboard';
import Padre from './pages/Padre';
import Admin from './pages/Admin';

const PERSONAL = ['DOCENTE', 'COORDINADOR', 'ADMIN'];

function SoloRoles({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return roles.includes(session.role) ? <>{children}</> : <Navigate to="/" replace />;
}

/** El acudiente no ve el menu del docente: su inicio es su propio portal. */
function Inicio() {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return session.role === 'ACUDIENTE' ? <Padre /> : <Home />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Inicio />} />
      {/* El acudiente tiene sesion valida pero no puede ver el curso completo de
          nadie: estas dos rutas son de personal del colegio, no de familias. */}
      <Route path="/asistencia"
             element={<SoloRoles roles={PERSONAL}><TomarAsistencia /></SoloRoles>} />
      <Route path="/ingreso"
             element={<SoloRoles roles={PERSONAL}><Ingreso /></SoloRoles>} />
      <Route path="/consultas"
             element={<SoloRoles roles={PERSONAL}><Consultas /></SoloRoles>} />
      <Route path="/dashboard"
             element={<SoloRoles roles={['COORDINADOR', 'ADMIN']}><Dashboard /></SoloRoles>} />
      <Route path="/admin" element={<SoloRoles roles={['ADMIN']}><Admin /></SoloRoles>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
