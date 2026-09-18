import { NextRequest, NextResponse } from "next/server";
import { deleteTemplate, getTemplate, saveTemplate } from "@/lib/templates";
import { TemplateSchema } from "@/lib/types";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const template = await getTemplate(slug);
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const parsed = TemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "config inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.slug !== slug) {
    return NextResponse.json({ error: "slug divergente" }, { status: 400 });
  }
  const saved = await saveTemplate(parsed.data);
  return NextResponse.json({ template: saved });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { slug } = await params;
  await deleteTemplate(slug);
  return NextResponse.json({ ok: true });
}
