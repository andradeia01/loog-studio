import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/leads
 *
 * Retorna as conversas ativas do WhatsApp (via Zaia Endless).
 *
 * Hoje: STUB. Retorna []. Quando canal Waha estiver no ar + credenciais Zaia
 * configuradas, chama a API do Zaia pra listar conversas, extrai lead/stage/tag
 * e devolve pro painel.
 */
export async function GET() {
  const apiKey = process.env.ZAIA_API_KEY;
  const workspaceId = process.env.ZAIA_WORKSPACE_ID;

  if (!apiKey || !workspaceId) {
    return NextResponse.json([]);
  }

  // TODO: integrar com Zaia API quando canal + API key existirem.
  //   GET https://api.zaia.app/v1/workspaces/{workspaceId}/conversations?channelType=waha&limit=50
  //   Mapear p/ { id, name, phone, lastMessage, lastAt, tags, stage }

  return NextResponse.json([]);
}
