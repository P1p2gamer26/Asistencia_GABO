/**
 * Escudo del colegio.
 *
 * Es el escudo real, generado desde `docs/marca/logo-colegio.jpeg` con
 * `tools/generar-iconos.py`. Antes habia aqui un monograma con las iniciales, dibujado
 * en SVG mientras no existia el archivo del colegio.
 *
 * Se sirve como imagen y no como SVG porque el original es una foto de la tela bordada:
 * vectorizarla daria un resultado peor y mucho mas pesado.
 */
export default function Escudo({ size = 44 }: { size?: number }) {
  return (
    <img
      src="/escudo.png"
      width={size}
      height={size}
      alt="Escudo del Colegio Gabriel Garcia Marquez"
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}
