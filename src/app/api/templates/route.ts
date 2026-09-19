import { NextRequest, NextResponse } from "next/server";
import { listTemplates, saveTemplate } from "@/lib/templates";
import { Template, TemplateSchema } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = TemplateSchema.omit({ createdAt: true, updatedAt: true });

export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({ templates: templates.filter((t) => t.active !== false) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[POST /api/templates] validação falhou", parsed.error.flatten());
    return NextResponse.json(
      { error: "config inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const template: Template = parsed.data;
  try {
    const saved = await saveTemplate(template);
    return NextResponse.json({ template: saved }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/templates] saveTemplate falhou", msg);
    return NextResponse.json({ error: "save_failed", message: msg }, { status: 500 });
  }
}
