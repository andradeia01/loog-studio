import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo oficial da LOOG — wordmark + símbolo infinito.
 * Fonte: /public/brand/loog-full.png (extraído de logo-loog-square-1x1.png).
 *
 * O logo tem proporção 745×125 (≈ 5.96:1). Passe `className` controlando
 * apenas a altura ("h-8", "h-10", "h-14") — a largura se ajusta.
 */

const NATURAL_W = 745;
const NATURAL_H = 125;

export function LoogLogo({
  className,
  priority,
  variant = "transparent",
}: {
  className?: string;
  priority?: boolean;
  /**
   * "transparent" (default): recorte transparente — funde no dark theme e em
   *   qualquer superfície com halo/gradiente atrás.
   * "black": PNG oficial com fundo preto sólido — use em contextos onde o
   *   fundo NÃO é preto (bloco colorido, foto de campanha).
   */
  variant?: "transparent" | "black";
}) {
  const src = variant === "black" ? "/brand/loog-full-black.png" : "/brand/loog-full.png";
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src={src}
        width={NATURAL_W}
        height={NATURAL_H}
        alt="LOOG Proteção Veicular"
        priority={priority}
        className="h-full w-auto select-none"
        draggable={false}
      />
    </span>
  );
}

/** Só o símbolo infinito — ideal para avatar, cabeçalho compacto ou favicon inline. */
export function LoogMark({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/brand/loog-mark.png"
        width={200}
        height={125}
        alt="LOOG"
        priority={priority}
        className="h-full w-auto select-none"
        draggable={false}
      />
    </span>
  );
}
