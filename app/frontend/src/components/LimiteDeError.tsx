import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { fallo: boolean };

/**
 * Captura los errores de renderizado para que un fallo no deje la pantalla en blanco.
 * Tiene que ser un componente de clase: no hay equivalente con hooks.
 */
export default class LimiteDeError extends Component<Props, State> {
  state: State = { fallo: false };

  static getDerivedStateFromError(): State {
    return { fallo: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fallo de renderizado:', error, info.componentStack);
  }

  render() {
    if (!this.state.fallo) return this.props.children;

    return (
      <main className="card">
        <h1>Algo fallo en la aplicacion</h1>
        <p role="alert">
          <strong>La asistencia que ya marco no se perdio</strong>: esta guardada en el
          telefono y se enviara sola cuando vuelva a abrir la aplicacion.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Recargar la aplicacion
        </button>
      </main>
    );
  }
}
