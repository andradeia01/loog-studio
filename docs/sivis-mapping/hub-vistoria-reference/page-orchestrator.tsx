"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveToken, type InspectionContext } from "@/lib/mock-tokens";
import { useInspectionStore } from "@/lib/inspection-store";
import { Welcome } from "./_steps/welcome";
import { VideoRecord } from "./_steps/video-record";
import { VideoReview } from "./_steps/video-review";
import { ExtraCapture } from "./_steps/extra-capture";
import { Processing } from "./_steps/processing";
import { Success } from "./_steps/success";
import { ErrorState } from "./_steps/error-state";

interface Props {
  params: Promise<{ token: string }>;
}

export default function InspectionFlow({ params }: Props) {
  const { token } = use(params);
  const router = useRouter();
  const step = useInspectionStore((s) => s.step);
  const reset = useInspectionStore((s) => s.reset);
  const [ctx, setCtx] = useState<InspectionContext | null>(null);

  useEffect(() => {
    const resolved = resolveToken(token);
    if (!resolved) {
      router.replace("/");
      return;
    }
    setCtx(resolved);
    return () => reset();
  }, [token, router, reset]);

  if (!ctx) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-chromeMid">Carregando…</div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col">
      {step === "welcome" && <Welcome ctx={ctx} />}
      {step === "video_record" && <VideoRecord ctx={ctx} />}
      {step === "video_review" && <VideoReview ctx={ctx} />}
      {step === "extra_capture" && <ExtraCapture ctx={ctx} />}
      {step === "processing" && <Processing ctx={ctx} />}
      {step === "success" && <Success ctx={ctx} />}
      {step === "error" && <ErrorState ctx={ctx} />}
    </main>
  );
}
