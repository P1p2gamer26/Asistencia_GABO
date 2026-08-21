import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

async function iniciar() {
  if (import.meta.env.VITE_MOCK) {
    await import('./api/mock').then((m) => m.instalarMock());
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter><App /></BrowserRouter>
    </StrictMode>,
  );
}

iniciar();
