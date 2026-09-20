import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Sin esto, el DOM de un test se queda montado y el siguiente encuentra dos veces
// el mismo boton. Es la causa numero uno de tests de React que se rompen entre si.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// jsdom no implementa reproduccion de medios; el portal llama play() al montar.
Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() });
