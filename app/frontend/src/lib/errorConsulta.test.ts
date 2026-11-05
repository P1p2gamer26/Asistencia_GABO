import { describe, expect, it } from 'vitest';
import { HttpError, OfflineError } from '../api/client';
import { mensajeConsulta } from './errorConsulta';

describe('mensajeConsulta', () => {
  it('sin red dice que revise la conexion', () => {
    expect(mensajeConsulta(new OfflineError())).toMatch(/Sin conexión/);
  });

  it('un 500 del servidor NO se presenta como problema de internet', () => {
    const msg = mensajeConsulta(new HttpError('x', 500));
    expect(msg).toMatch(/servidor/);
    expect(msg).not.toMatch(/conexi/i);
  });

  it('una sesion vencida pide volver a entrar', () => {
    expect(mensajeConsulta(new HttpError('x', 401))).toMatch(/sesión venció/);
  });

  it('cualquier otro error ofrece reintentar', () => {
    expect(mensajeConsulta(new Error('boom'))).toMatch(/Reintentar/);
  });
});
