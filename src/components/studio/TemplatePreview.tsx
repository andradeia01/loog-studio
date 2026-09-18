"use client";

import { useMemo } from "react";
import { Consultant, Layer, Template, TextLayer } from "@/lib/types";
import { formatInstagram, formatPhoneBR } from "@/lib/utils";

interface Props {
  template: Template;
  consultant: Consultant;
}

/**
 * Preview client-side em HTML/CSS reproduzindo aproximadamente a composição.
 * Não chama a API — muda em tempo real conforme o consultor edita.
 * A geração fiel em pixels acontece no server via Sharp.
 */
export function TemplatePreview({ template, consultant }: Props) {
  const scale = useMemo(() => {
    // renderiza no máximo 480px de largura (~cabe no viewport mobile)
    const max = 480;
    return Math.min(1, max / template.width);
  }, [template.width]);

  const displayW = template.width * scale;
  const displayH = template.height * scale;

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-xl border border-loog-border bg-black"
      style={{ width: displayW, height: displayH }}
    >
      {template.layers.map((layer) => (
        <LayerView key={layer.id} layer={layer} scale={scale} consultant={consultant} />
      ))}
    </div>
  );
}

function LayerView({
  layer,
  scale,
  consultant,
}: {
  layer: Layer;
  scale: number;
  consultant: Consultant;
}) {
  if (layer.enabled === false) return null;

  if (layer.type === "background") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={layer.src}
        alt=""
        className="absolute inset-0 h-full w-full select-none object-cover"
        draggable={false}
      />
    );
  }

  if (layer.type === "image") {
    const style: React.CSSProperties = {
      position: "absolute",
      left: layer.x * scale,
      top: layer.y * scale,
      width: layer.width ? layer.width * scale : "auto",
      height: layer.height ? layer.height * scale : "auto",
      pointerEvents: "none",
    };
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={layer.src} alt="" style={style} draggable={false} />
    );
  }

  if (layer.type === "consultantPhoto") {
    if (!consultant.photoDataUrl) {
      return (
        <div
          className="absolute flex items-center justify-center bg-white/5 text-[10px] uppercase tracking-wider text-loog-muted"
          style={{
            left: layer.x * scale,
            top: layer.y * scale,
            width: layer.width * scale,
            height: layer.height * scale,
            borderRadius: layer.borderRadius * scale,
          }}
        >
          sua foto
        </div>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={consultant.photoDataUrl}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: layer.x * scale,
          top: layer.y * scale,
          width: layer.width * scale,
          height: layer.height * scale,
          objectFit: layer.fit === "contain" ? "contain" : "cover",
          borderRadius: layer.borderRadius * scale,
        }}
      />
    );
  }

  if (layer.type === "text") {
    return <TextLayerView layer={layer} scale={scale} consultant={consultant} />;
  }
  return null;
}

function TextLayerView({
  layer,
  scale,
  consultant,
}: {
  layer: TextLayer;
  scale: number;
  consultant: Consultant;
}) {
  const raw = resolveText(layer, consultant);
  if (!raw) return null;
  const text = layer.style.uppercase ? raw.toLocaleUpperCase("pt-BR") : raw;

  const style: React.CSSProperties = {
    position: "absolute",
    left: layer.x * scale,
    top: layer.y * scale,
    width: layer.width * scale,
    maxWidth: layer.width * scale,
    color: layer.style.color,
    fontFamily: `${layer.style.fontFamily}, Inter, sans-serif`,
    fontWeight: layer.style.fontWeight,
    fontSize: layer.style.fontSize * scale,
    lineHeight: layer.style.lineHeight,
    letterSpacing: layer.style.letterSpacing * scale,
    textAlign: layer.style.align,
    overflow: "hidden",
    wordBreak: "break-word",
    pointerEvents: "none",
  };
  return <div style={style}>{text}</div>;
}

function resolveText(layer: TextLayer, c: Consultant): string | null {
  switch (layer.source) {
    case "consultantName":
      return c.name?.trim() || "Seu nome";
    case "consultantPhone":
      return c.phone?.trim() ? formatPhoneBR(c.phone) : "(24) 99999-9999";
    case "consultantInstagram":
      return formatInstagram(c.instagram) || "@seuhandle";
    case "consultantCity":
      return c.city?.trim() || "Sua cidade";
    case "literal":
      return layer.literal ?? "";
    default:
      return null;
  }
}
