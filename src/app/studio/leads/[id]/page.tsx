import { LeadDetail } from "@/components/studio/leads/LeadDetail";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function LeadPage({ params }: Props) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-4xl p-5 pb-20">
      <LeadDetail leadId={id} />
    </main>
  );
}
