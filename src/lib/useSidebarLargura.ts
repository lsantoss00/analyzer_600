import { useCallback, useEffect, useRef, useState } from 'react';

export const LARGURA_MIN = 200;
export const LARGURA_MAX = 480;
export const LARGURA_PADRAO = 256;
/** Largura recolhida: cabe o ícone e a área de clique, sem rótulo. */
export const LARGURA_RECOLHIDA = 56;

const CHAVE_LARGURA = 'sidebar_largura';
const CHAVE_RECOLHIDA = 'sidebar_recolhida';

function lerLargura(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_LARGURA));
    if (Number.isFinite(v) && v >= LARGURA_MIN && v <= LARGURA_MAX) return v;
  } catch {}
  return LARGURA_PADRAO;
}

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === '1';
  } catch {}
  return false;
}

/**
 * Largura da barra lateral, arrastável e recolhível, lembrada entre sessões.
 *
 * A barra era `w-64` fixa e comia 256px em qualquer resolução — num monitor de
 * 1024px isso é um quarto da tela, justamente onde a tabela do Tabelão precisa
 * de espaço.
 */
export function useSidebarLargura() {
  const [largura, setLargura] = useState(lerLargura);
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const [arrastando, setArrastando] = useState(false);
  const larguraRef = useRef(largura);

  useEffect(() => {
    larguraRef.current = largura;
  }, [largura]);

  const alternarRecolhida = useCallback(() => {
    setRecolhida((v) => {
      const proxima = !v;
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, proxima ? '1' : '0');
      } catch {}
      return proxima;
    });
  }, []);

  const iniciarArrasto = useCallback(
    (e: React.PointerEvent) => {
      // Arrastar com a barra recolhida a expande: é o gesto natural de quem
      // quer o espaço de volta.
      if (recolhida) {
        alternarRecolhida();
        return;
      }
      e.preventDefault();
      setArrastando(true);

      const mover = (ev: PointerEvent) => {
        const nova = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, ev.clientX));
        larguraRef.current = nova;
        setLargura(nova);
      };
      const soltar = () => {
        setArrastando(false);
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        // Persiste só ao soltar, não a cada pixel.
        try {
          localStorage.setItem(CHAVE_LARGURA, String(larguraRef.current));
        } catch {}
      };
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
    },
    [recolhida, alternarRecolhida],
  );

  return {
    largura: recolhida ? LARGURA_RECOLHIDA : largura,
    recolhida,
    arrastando,
    alternarRecolhida,
    iniciarArrasto,
  };
}
