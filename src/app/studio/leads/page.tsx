import { LeadsList } from "@/components/studio/leads/LeadsList";

export const dynamic = "force-dynamic";

export default function LeadsPage() {
  return (
    <main className="mx-auto max-w-6xl p-5 pb-20">
      <LeadsList />
    </main>
  );
}
