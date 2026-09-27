import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const info: Record<string, unknown> = {};
  const cwd = process.cwd();
  const publicDir = path.join(cwd, "public", "fonts");
  const filenames = ["Inter-Regular.woff2", "Inter-SemiBold.woff2", "Inter-Bold.woff2", "Inter-Black.woff2"];

  info.familiesInitial = GlobalFonts.families.map((f) => f.family).slice(0, 30);

  // tenta via registerFromPath (original)
  const pathResults: Record<string, unknown> = {};
  for (const f of filenames) {
    try {
      const r = GlobalFonts.registerFromPath(path.join(publicDir, f), "Inter");
      pathResults[f] = r ? (typeof r === "object" ? "ok-obj" : String(r)) : "null";
    } catch (err) {
      pathResults[f] = "err: " + (err instanceof Error ? err.message : String(err));
    }
  }
  info.pathResults = pathResults;

  // tenta via Buffer + register
  const bufResults: Record<string, unknown> = {};
  for (const f of filenames) {
    try {
      const buf = await fsp.readFile(path.join(publicDir, f));
      const first4 = buf.slice(0, 4).toString("hex");
      const r = GlobalFonts.register(buf, "Inter");
      bufResults[f] = { first4, r: r ? "ok" : "null", size: buf.length };
    } catch (err) {
      bufResults[f] = "err: " + (err instanceof Error ? err.message : String(err));
    }
  }
  info.bufResults = bufResults;

  info.familiesFinal = GlobalFonts.families.map((f) => f.family).slice(0, 20);
  info.hasInter = GlobalFonts.has("Inter");

  // tenta render
  try {
    const canvas = createCanvas(600, 100);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#001034";
    ctx.fillRect(0, 0, 600, 100);
    ctx.font = "700 40px Inter";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("TESTE ção", 20, 60);
    const buf = await canvas.encode("png");
    info.pngSize = buf.length;
    info.textWidth = ctx.measureText("TESTE ção").width;
  } catch (err) {
    info.renderErr = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(info, { status: 200 });
}
