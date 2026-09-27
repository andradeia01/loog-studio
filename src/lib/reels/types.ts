/**
 * Fábrica de Reels — tipos compartilhados entre detecção, render e UI.
 *
 * Todo o processamento roda no navegador (WebCodecs via mediabunny):
 * nenhum vídeo sobe pro servidor.
 */

/** Faixa vertical com o conteúdo do vídeo original, em fração da altura (0..1). */
export interface CropBand {
  top: number;
  bottom: number;
}

export type Theme = "light" | "dark";
/** Proporção do espaço do vídeo no quadro 9:16. "auto" segue o conteúdo (entre 16:9 e 3:4). */
export type SlotAspect = "auto" | "1:1" | "4:5" | "16:9";

export interface ReelsProfile {
  name: string;
  handle: string;
  /** Foto de perfil já recortada em quadrado (data URL, 320×320). */
  avatar: string | null;
  verified: boolean;
}

export interface RenderSettings {
  profile: ReelsProfile;
  headline: string;
  theme: Theme;
  slot: SlotAspect;
  /** Overlay PNG (moldura/marca) desenhado por cima de tudo, esticado no quadro. */
  overlay: ImageBitmap | null;
  mirror: boolean;
  /** Acelera 2% (vídeo + áudio). */
  speedUp: boolean;
  stripMetadata: boolean;
  quality: "high" | "medium";
}

export const DEFAULT_SETTINGS: RenderSettings = {
  profile: { name: "", handle: "", avatar: null, verified: false },
  headline: "",
  theme: "dark",
  slot: "auto",
  overlay: null,
  mirror: false,
  speedUp: false,
  stripMetadata: true,
  quality: "high",
};

export const THEMES: Record<Theme, { bg: string; text: string; muted: string }> = {
  light: { bg: "#FFFFFF", text: "#0F1419", muted: "#536471" },
  dark: { bg: "#000000", text: "#F5F5F5", muted: "#8A8F98" },
};

export const REELS_W = 1080;
export const REELS_H = 1920;
export const SPEED_FACTOR = 1.02;
export const MAX_FILES = 50;
