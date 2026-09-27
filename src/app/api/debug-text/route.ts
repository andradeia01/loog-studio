import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Debug: mostra estado das fontes + testa render. */
export async function GET() {
  const info: Record<string, unknown> = {};
  const cwd = process.cwd();
  const publicDir = path.join(cwd, "public", "fonts");
  const tmpDir = path.join(os.tmpdir(), "loog-fonts");
  const filenames = ["Inter-Regular.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf", "Inter-Black.ttf"];

  info.cwd = cwd;
  info.tmpDir = tmpDir;
  info.publicDirExists = fs.existsSync(publicDir);
  info.fontsInPublic = filenames.map((f) => ({
    name: f,
    exists: fs.existsSync(path.join(publicDir, f)),
    size: fs.existsSync(path.join(publicDir, f)) ? fs.statSync(path.join(publicDir, f)).size : null,
  }));

  info.familiesBefore = GlobalFonts.families.map((f) => f.family);

  // tentar carregar do public
  const registerResults: Record<string, boolean> = {};
  await fsp.mkdir(tmpDir, { recursive: true });

  for (const f of filenames) {
    let resolved: string | null = null;
    const pubPath = path.join(publicDir, f);
    if (fs.existsSync(pubPath)) {
      resolved = pubPath;
    } else {
      const tmpPath = path.join(tmpDir, f);
      if (!fs.existsSync(tmpPath)) {
        try {
          const r = await fetch(`https://loogstudio.netlify.app/fonts/${f}`);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            await fsp.writeFile(tmpPath, buf);
          } else {
            registerResults[f] = false;
            continue;
          }
        } catch (err) {
          registerResults[f] = false;
          info[`fetchErr-${f}`] = err instanceof Error ? err.message : String(err);
          continue;
        }
      }
      resolved = tmpPath;
    }
    try {
      const ok = GlobalFonts.registerFromPath(resolved, "Inter");
      registerResults[f] = ok;
    } catch (err) {
      registerResults[f] = false;
      info[`regErr-${f}`] = err instanceof Error ? err.message : String(err);
    }
  }
  info.registerResults = registerResults;
  info.familiesAfter = GlobalFonts.families.map((f) => f.family);
  info.has = GlobalFonts.has("Inter");

  // tenta renderizar
  try {
    const canvas = createCanvas(800, 100);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0A1A3C";
    ctx.fillRect(0, 0, 800, 100);
    ctx.font = "700 60px Inter";
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("TESTE ção 123", 20, 70);
    const buf = await canvas.encode("png");
    info.renderOk = true;
    info.pngSize = buf.length;
  } catch (err) {
    info.renderOk = false;
    info.renderErr = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(info, { status: 200 });
}
