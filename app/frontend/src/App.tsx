import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getSession } from './api/client';

// Track B rellena estos:
import Login from './pages/Login';
import TomarAsistencia from './pages/TomarAsistencia';
import RegistroClase from './pages/RegistroClase';
import Ingreso from './pages/Ingreso';
// Track C rellena estos:
import Consultas from './pages/Consultas';
import Dashboard from './pages/Dashboard';
import Padre from './pages/Padre';
import Admin from './pages/Admin';
import CambiarClave from './pages/CambiarClave';
import Calendario from './pages/Calendario';
import Horario from './pages/Horario';
import InicioAdmin from './pages/InicioAdmin';
import InicioDocente from './pages/InicioDocente';
import Portal from './pages/Portal';
import Layout from './components/Layout';

const PERSONAL = ['DOCENTE', 'COORDINADOR', 'ADMIN'];

/** Con la contrasena temporal no se puede hacer nada mas que cambiarla. */
function useDesvioPorClave(session: ReturnType<typeof getSession>) {
  const location = useLocation();
  return session?.mustChangePassword && location.pathname !== '/cambiar-clave';
}

function SoloRoles({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (useDesvioPorClave(session)) return <Navigate to="/cambiar-clave" replace />;
  return roles.includes(session.role)
    ? <Layout>{children}</Layout>
    : <Navigate to="/" replace />;
}

/** El acudiente no ve el menu del docente: su inicio es su propio portal. */
function Inicio() {
  const session = getSession();
  if (!session) return <Portal />;
  if (useDesvioPorClave(session)) return <Navigate to="/cambiar-clave" replace />;
  if (session.role === 'ACUDIENTE') return <Layout><Padre /></Layout>;
  // Coordinacion y administracion entran preguntando "como va hoy"; el docente entra
  // a tomar la lista, asi que su inicio sigue siendo el de siempre.
  if (session.role === 'ADMIN' || session.role === 'COORDINADOR') return <Layout><InicioAdmin /></Layout>;
  // El docente llega preguntando donde tiene clase hoy y que ya marco.
  if (session.role === 'DOCENTE') return <Layout><InicioDocente /></Layout>;
  return <Navigate to="/login" replace />;
}

function Protegida({ children, armazon = true }: { children: React.ReactNode; armazon?: boolean }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (useDesvioPorClave(session)) return <Navigate to="/cambiar-clave" replace />;
  return armazon ? <Layout>{children}</Layout> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Inicio />} />
      <Route path="/cambiar-clave" element={<Protegida armazon={false}><CambiarClave /></Protegida>} />
      {/* El acudiente tiene sesion valida pero no puede ver el curso completo de
          nadie: estas dos rutas son de personal del colegio, no de familias. */}
      <Route path="/asistencia"
             element={<SoloRoles roles={PERSONAL}><TomarAsistencia /></SoloRoles>} />
      <Route path="/asistencia/:blockId/:fecha"
             element={<SoloRoles roles={PERSONAL}><RegistroClase /></SoloRoles>} />
      <Route path="/ingreso"
             element={<SoloRoles roles={PERSONAL}><Ingreso /></SoloRoles>} />
      <Route path="/consultas"
             element={<SoloRoles roles={PERSONAL}><Consultas /></SoloRoles>} />
      <Route path="/dashboard"
             element={<SoloRoles roles={['COORDINADOR', 'ADMIN']}><Dashboard /></SoloRoles>} />
      <Route path="/admin" element={<SoloRoles roles={['ADMIN']}><Admin /></SoloRoles>} />
      {/* Calendario publico en solo lectura: sin sesion se ve sin el menu lateral. */}
      <Route path="/calendario" element={getSession() ? <Protegida><Calendario /></Protegida> : <Calendario />} />
      <Route path="/horario" element={<Protegida><Horario /></Protegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
