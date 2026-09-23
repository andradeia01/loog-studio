import { NextResponse } from "next/server";
import { renderText } from "@/lib/image/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Endpoint de debug — renderiza um texto de teste em PNG com fundo azul. */
export async function GET() {
  try {
    const r = await renderText(
      "TESTE João da Silva ção 123",
      {
        fontFamily: "Inter",
        fontSize: 60,
        fontWeight: 700,
        letterSpacing: 0,
        lineHeight: 1.2,
        color: "#FFFFFF",
        align: "left",
        uppercase: false,
        minFontSize: 20,
      },
      800,
    );
    if (!r) {
      return NextResponse.json({ error: "renderText retornou null" }, { status: 500 });
    }
    return new NextResponse(new Uint8Array(r.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Text-Width": String(r.width),
        "X-Text-Height": String(r.height),
        "X-Font-Size": String(r.fontSize),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "exception", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
