"use client";

import { useInspectionStore } from "@/lib/inspection-store";
import type { InspectionContext } from "@/lib/mock-tokens";
import { Button } from "@/components/ui/button";

export function ErrorState({ ctx }: { ctx: InspectionContext }) {
  const message = useInspectionStore((s) => s.errorMessage);
  const reset = useInspectionStore((s) => s.reset);

  return (
    <section className="flex-1 flex flex-col px-6 py-10 justify-center items-center text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-statusLate/20 border-2 border-statusLate grid place-items-center">
        <span className="text-statusLate text-3xl">!</span>
      </div>
      <div>
        <h1 className="font-display text-xl font-semibold mb-2">
          Algo deu errado
        </h1>
        <p className="text-chromeMid max-w-sm">
          {message ?? "Erro desconhecido."}
        </p>
      </div>
      <p className="text-xs text-chromeMid max-w-sm">
        Em caso de dúvida, chame a LOOG no WhatsApp
      </p>
      <Button onClick={reset}>Tentar de novo</Button>
    </section>
  );
}
