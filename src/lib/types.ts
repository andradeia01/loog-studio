import { z } from "zod";

// ============================================================================
// Consultant (dados do consultor)
// ============================================================================

export const ConsultantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(24),
  instagram: z.string().trim().max(60).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  photoDataUrl: z.string().startsWith("data:image/").optional().nullable(),
});
export type Consultant = z.infer<typeof ConsultantSchema>;

// ============================================================================
// Template — configuração de layers
// ============================================================================

export type TextAlign = "left" | "center" | "right";
export type FitMode = "cover" | "contain";

export const TextStyleSchema = z.object({
  fontFamily: z.string().default("Inter"),
  fontSize: z.number().positive().default(42),
  fontWeight: z.number().int().min(100).max(900).default(700),
  letterSpacing: z.number().default(0),
  lineHeight: z.number().positive().default(1.15),
  color: z.string().default("#FFFFFF"),
  align: z.enum(["left", "center", "right"]).default("left"),
  uppercase: z.boolean().default(false),
  minFontSize: z.number().positive().default(18),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

const BaseLayer = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
});

export const BackgroundLayerSchema = BaseLayer.extend({
  type: z.literal("background"),
  src: z.string(), // relative to /public
});
export type BackgroundLayer = z.infer<typeof BackgroundLayerSchema>;

export const ImageLayerSchema = BaseLayer.extend({
  type: z.literal("image"),
  src: z.string(),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type ImageLayer = z.infer<typeof ImageLayerSchema>;

export const ConsultantPhotoLayerSchema = BaseLayer.extend({
  type: z.literal("consultantPhoto"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fit: z.enum(["cover", "contain"]).default("cover"),
  borderRadius: z.number().min(0).default(0),
});
export type ConsultantPhotoLayer = z.infer<typeof ConsultantPhotoLayerSchema>;

export const TextLayerSchema = BaseLayer.extend({
  type: z.literal("text"),
  source: z.enum(["consultantName", "consultantPhone", "consultantInstagram", "consultantCity", "literal"]),
  literal: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive().optional(),
  style: TextStyleSchema.default({}),
});
export type TextLayer = z.infer<typeof TextLayerSchema>;

export const LayerSchema = z.discriminatedUnion("type", [
  BackgroundLayerSchema,
  ImageLayerSchema,
  ConsultantPhotoLayerSchema,
  TextLayerSchema,
]);
export type Layer = z.infer<typeof LayerSchema>;

export const TemplateCategorySchema = z.enum([
  "institucional",
  "vendas",
  "protecao",
  "recrutamento",
  "stories",
  "feed",
]);
export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;

export const TemplateFormatSchema = z.enum(["feed-1x1", "feed-4x5", "story-9x16"]);
export type TemplateFormat = z.infer<typeof TemplateFormatSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  category: TemplateCategorySchema,
  format: TemplateFormatSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  thumbnail: z.string(), // path public
  active: z.boolean().default(true),
  layers: z.array(LayerSchema),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});
export type Template = z.infer<typeof TemplateSchema>;

// ============================================================================
// Generation Request
// ============================================================================

export const GenerateRequestSchema = z.object({
  templateSlug: z.string(),
  consultant: ConsultantSchema,
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// ============================================================================
// Helpers
// ============================================================================

export const FORMAT_LABEL: Record<TemplateFormat, string> = {
  "feed-1x1": "Feed 1:1",
  "feed-4x5": "Feed 4:5",
  "story-9x16": "Story 9:16",
};

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  institucional: "Institucional",
  vendas: "Vendas",
  protecao: "Proteção",
  recrutamento: "Recrutamento",
  stories: "Stories",
  feed: "Feed",
};

export const FORMAT_DIMENSIONS: Record<TemplateFormat, { width: number; height: number }> = {
  "feed-1x1": { width: 1080, height: 1080 },
  "feed-4x5": { width: 1080, height: 1350 },
  "story-9x16": { width: 1080, height: 1920 },
};
