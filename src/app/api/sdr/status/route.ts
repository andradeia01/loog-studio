import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/status
 *
 * Retorna o estado atual do canal WhatsApp conectado ao agente Tavinho no Zaia Endless.
 *
 * Hoje: STUB. Retorna sempre "aguardando canal" porque o canal Waha ainda não foi
 * criado no Zaia. Quando criar e tiver ZAIA_API_KEY + ZAIA_WORKSPACE_ID no env,
 * esta rota faz um GET no Zaia pra pegar status real + QR code.
 */
export async function GET() {
  const apiKey = process.env.ZAIA_API_KEY;
  const workspaceId = process.env.ZAIA_WORKSPACE_ID;

  // Sem credenciais: devolve estado "não configurado" sem crashar.
  if (!apiKey || !workspaceId) {
    return NextResponse.json({
      connected: false,
      phoneNumber: null,
      channelName: null,
      qrCode: null,
      stats: { totalLeads: 0, cotacoesHoje: 0, aguardandoResposta: 0, fechamentos: 0 },
    });
  }

  // TODO: quando canal Waha estiver criado, trocar por GET real na API do Zaia.
  // Estrutura prevista:
  //   GET https://api.zaia.app/v1/workspaces/{workspaceId}/channels?type=waha
  //   Headers: Authorization: Bearer <apiKey>
  //   Response: { channels: [{ id, name, phoneNumber, status, qrCode }] }

  return NextResponse.json({
    connected: false,
    phoneNumber: null,
    channelName: null,
    qrCode: null,
    stats: { totalLeads: 0, cotacoesHoje: 0, aguardandoResposta: 0, fechamentos: 0 },
  });
}
