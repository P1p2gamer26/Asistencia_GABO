/**
 * Escudo del colegio. El colegio no entrego un archivo del suyo, asi que esto es
 * un monograma con las iniciales, no una reproduccion: cuando llegue el escudo
 * real se reemplaza este archivo por un <img src="/escudo.svg" /> y ya.
 */
export default function Escudo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img"
         aria-label="Colegio Gabriel Garcia Marquez">
      <path d="M32 3 58 11v22c0 15-11 24-26 28C17 57 6 48 6 33V11Z"
            fill="var(--verde)" stroke="var(--verde-oscuro)" strokeWidth="2" />
      <path d="M9 22h46" stroke="var(--ocre)" strokeWidth="3" />
      <text x="32" y="44" textAnchor="middle" fill="#fff" letterSpacing="1"
            fontSize="19" fontWeight="700" fontFamily="var(--ui)">GGM</text>
    </svg>
  );
}
