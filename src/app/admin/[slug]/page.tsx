import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/templates";
import { TemplateEditor } from "@/components/admin/TemplateEditor";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = await getTemplate(slug);
  if (!template) notFound();
  return <TemplateEditor mode="edit" initial={template} />;
}
