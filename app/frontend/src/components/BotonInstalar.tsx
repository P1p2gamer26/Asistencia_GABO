import { useEffect, useState } from 'react';

type PromptEvent = Event & { prompt: () => Promise<void> };

export default function BotonInstalar() {
  const [evento, setEvento] = useState<PromptEvent | null>(null);

  useEffect(() => {
    const capturar = (e: Event) => { e.preventDefault(); setEvento(e as PromptEvent); };
    window.addEventListener('beforeinstallprompt', capturar);
    return () => window.removeEventListener('beforeinstallprompt', capturar);
  }, []);

  if (!evento) return null;
  return (
    <button type="button" onClick={() => { void evento.prompt(); setEvento(null); }}>
      Instalar en el telefono
    </button>
  );
}
