/**
 * Fábrica de Reels — tipos compartilhados entre detecção, render e UI.
 *
 * Todo o processamento roda no navegador (WebCodecs via mediabunny):
 * nenhum vídeo sobe pro servidor.
 */

/** Faixa vertical mantida, em fração da altura (0..1). */
export interface CropBand {
  top: number;
  bottom: number;
}

export type OutputMode = "crop" | "reels";
export type Background = "black" | "white" | "blur" | "color";

export interface RenderSettings {
  mode: OutputMode;
  background: Background;
  backgroundColor: string;
  title: string;
  titleColor: string;
  /** Overlay PNG (moldura/marca) desenhado por cima de tudo, esticado no quadro. */
  overlay: ImageBitmap | null;
  mirror: boolean;
  /** Acelera 2% (vídeo + áudio). */
  speedUp: boolean;
  stripMetadata: boolean;
  quality: "high" | "medium";
}

export const DEFAULT_SETTINGS: RenderSettings = {
  mode: "reels",
  background: "blur",
  backgroundColor: "#0040F0",
  title: "",
  titleColor: "#FFFFFF",
  overlay: null,
  mirror: false,
  speedUp: false,
  stripMetadata: true,
  quality: "high",
};

export const REELS_W = 1080;
export const REELS_H = 1920;
export const SPEED_FACTOR = 1.02;
export const MAX_FILES = 50;
