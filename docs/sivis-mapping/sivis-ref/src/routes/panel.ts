import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ConversationStore } from '../sdr/persistence/store.js';
import type { Stage } from '../sdr/types.js';

const PhoneParams = z.object({ phone: z.string().min(6) });

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
}

function stageColor(stage: Stage): string {
  switch (stage) {
    case 'NEW_LEAD':
    case 'GREETING':
      return 'bg-slate-500';
    case 'VEHICLE_CAPTURE':
    case 'VEHICLE_CONFIRMATION':
      return 'bg-blue-500';
    case 'PAIN_DISCOVERY':
    case 'PRE_QUOTE':
      return 'bg-amber-500';
    case 'QUOTE_PRESENTED':
      return 'bg-emerald-500';
    case 'OBJECTION_HANDLING':
      return 'bg-orange-500';
    case 'CLOSING':
      return 'bg-green-600';
    case 'HUMAN_HANDOFF':
      return 'bg-rose-600';
    case 'WON':
      return 'bg-emerald-700';
    case 'LOST':
      return 'bg-slate-700';
    default:
      return 'bg-slate-500';
  }
}

const PANEL_HTML = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>LOOG SDR — Painel</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .msg-lead { background:#1e293b; }
  .msg-sdr  { background:#0f766e; }
  .msg-system { background:#3f3f46; }
  ::-webkit-scrollbar { width:8px; height:8px; }
  ::-webkit-scrollbar-thumb { background:#334155; border-radius:4px; }
  ::-webkit-scrollbar-track { background:#0f172a; }
</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <header class="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
    <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center font-black">L</div>
        <div>
          <h1 class="font-bold text-lg">LOOG SDR — Painel</h1>
          <p id="subtitle" class="text-xs text-slate-400">Carregando…</p>
        </div>
      </div>
      <div id="stats" class="flex gap-2 flex-wrap justify-end"></div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
    <section class="col-span-4 lg:col-span-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">Conversas</h2>
        <span id="totalLeads" class="text-xs text-slate-500"></span>
      </div>
      <div id="leadsList" class="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1"></div>
    </section>

    <section class="col-span-8 lg:col-span-8">
      <div id="detail" class="bg-slate-900 rounded-xl border border-slate-800 p-6 min-h-[400px]">
        <p class="text-slate-500 text-center py-16">Selecione uma conversa à esquerda</p>
      </div>
    </section>
  </main>

<script>
const STAGE_COLOR = {
  NEW_LEAD:'bg-slate-500', GREETING:'bg-slate-500',
  VEHICLE_CAPTURE:'bg-blue-500', VEHICLE_CONFIRMATION:'bg-blue-500',
  PAIN_DISCOVERY:'bg-amber-500', PRE_QUOTE:'bg-amber-500',
  QUOTE_PRESENTED:'bg-emerald-500',
  OBJECTION_HANDLING:'bg-orange-500',
  CLOSING:'bg-green-600',
  HUMAN_HANDOFF:'bg-rose-600',
  WON:'bg-emerald-700', LOST:'bg-slate-700', NURTURE:'bg-slate-600',
};

const STAGE_LABEL = {
  NEW_LEAD:'Novo lead', GREETING:'Saudação',
  VEHICLE_CAPTURE:'Capturando veículo', VEHICLE_CONFIRMATION:'Confirmando veículo',
  PAIN_DISCOVERY:'Descobrindo dor', PRE_QUOTE:'Pré-cotação',
  QUOTE_PRESENTED:'Cotação enviada',
  OBJECTION_HANDLING:'Objeção',
  CLOSING:'Fechando',
  HUMAN_HANDOFF:'Handoff humano',
  WON:'Ganho', LOST:'Perdido', NURTURE:'Nutrição',
};

let selected = null;
let leadsData = [];

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return diff + 's atrás';
  if (diff < 3600) return Math.floor(diff/60) + 'min atrás';
  if (diff < 86400) return Math.floor(diff/3600) + 'h atrás';
  return Math.floor(diff/86400) + 'd atrás';
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function renderStats() {
  const stats = { total: leadsData.length };
  leadsData.forEach(l => { stats[l.stage] = (stats[l.stage] || 0) + 1; });
  const el = document.getElementById('stats');
  el.innerHTML = '';
  const wanted = ['QUOTE_PRESENTED','CLOSING','WON','HUMAN_HANDOFF'];
  wanted.forEach(s => {
    if (!stats[s]) return;
    const badge = document.createElement('div');
    badge.className = 'px-3 py-1 rounded-lg text-xs font-medium ' + (STAGE_COLOR[s] || 'bg-slate-600');
    badge.textContent = STAGE_LABEL[s] + ': ' + stats[s];
    el.appendChild(badge);
  });
  document.getElementById('subtitle').textContent = stats.total + ' leads no total';
}

function renderList() {
  const list = document.getElementById('leadsList');
  list.innerHTML = '';
  if (leadsData.length === 0) {
    list.innerHTML = '<div class="text-slate-600 text-sm text-center py-8">Nenhuma conversa ainda</div>';
    document.getElementById('totalLeads').textContent = '';
    return;
  }
  document.getElementById('totalLeads').textContent = leadsData.length;
  leadsData.forEach(lead => {
    const isSel = selected === lead.phone;
    const div = document.createElement('div');
    div.className = 'p-3 rounded-lg cursor-pointer transition ' +
      (isSel ? 'bg-slate-800 border border-blue-500' : 'bg-slate-900 border border-slate-800 hover:bg-slate-800');
    const stageColor = STAGE_COLOR[lead.stage] || 'bg-slate-600';
    div.innerHTML = ` + '`' + `
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-medium truncate">\${lead.displayName || lead.phone}</div>
          <div class="text-xs text-slate-500 truncate">\${lead.phone}</div>
        </div>
        <span class="\${stageColor} text-[10px] px-2 py-0.5 rounded font-semibold whitespace-nowrap">\${STAGE_LABEL[lead.stage] || lead.stage}</span>
      </div>
      <div class="text-xs text-slate-500 mt-1 flex justify-between">
        <span class="truncate">\${lead.lastMessagePreview || '—'}</span>
        <span class="ml-2 whitespace-nowrap">\${timeAgo(lead.updatedAt)}</span>
      </div>
    ` + '`' + `;
    div.onclick = () => { selected = lead.phone; renderList(); renderDetail(); };
    list.appendChild(div);
  });
}

async function renderDetail() {
  const el = document.getElementById('detail');
  if (!selected) return;
  el.innerHTML = '<div class="text-slate-500">Carregando…</div>';
  try {
    const res = await fetch('/panel/api/leads/' + encodeURIComponent(selected));
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();
    const c = d.conversation;

    const vehicle = c.vehicle || {};
    const customer = c.customer || {};
    const quote = c.quote;

    const stageColor = STAGE_COLOR[c.stage] || 'bg-slate-600';
    const stageLabel = STAGE_LABEL[c.stage] || c.stage;

    let html = ` + '`' + `
      <div class="border-b border-slate-800 pb-4 mb-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold">\${c.displayName || c.phone}</h2>
            <p class="text-sm text-slate-500">\${c.phone} · \${c.leadId}</p>
          </div>
          <span class="\${stageColor} px-3 py-1 rounded font-semibold text-sm">\${stageLabel}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div class="bg-slate-950 rounded-lg p-3 border border-slate-800">
          <div class="text-xs text-slate-500 uppercase mb-1">Veículo</div>
          \${vehicle.brand ? '<div>' + (vehicle.brand || '') + ' ' + (vehicle.model || '') + ' ' + (vehicle.modelYear || '') + '</div>' : '<div class="text-slate-600">—</div>'}
          \${vehicle.fipeValueCents ? '<div class="text-xs text-slate-400 mt-1">FIPE R$ ' + (vehicle.fipeValueCents/100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</div>' : ''}
          \${vehicle.confirmed ? '<div class="text-emerald-400 text-xs mt-1">✓ confirmado</div>' : ''}
        </div>
        <div class="bg-slate-950 rounded-lg p-3 border border-slate-800">
          <div class="text-xs text-slate-500 uppercase mb-1">Cliente</div>
          <div>\${customer.name || '<span class=\\"text-slate-600\\">sem nome</span>'}</div>
          <div class="text-xs text-slate-400">\${customer.phone || ''}</div>
        </div>
      </div>

      \${quote ? '<div class="bg-emerald-950 border border-emerald-800 rounded-lg p-3 mb-6"><div class="text-xs text-emerald-400 uppercase mb-1">Cotação #' + quote.quoteId + '</div><div class="text-lg font-bold">' + (quote.planName || '') + '</div>' + (quote.monthlyValueFormatted ? '<div class="text-sm">Mensal: ' + quote.monthlyValueFormatted + '</div>' : '') + (quote.joinFeeFormatted ? '<div class="text-sm">Adesão: ' + quote.joinFeeFormatted + '</div>' : '') + (quote.portalUrl ? '<a href="' + quote.portalUrl + '" target="_blank" class="text-emerald-400 text-xs underline">Abrir no Sivisweb ↗</a>' : '') + '</div>' : ''}

      <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Conversa</h3>
      <div class="space-y-2 max-h-[400px] overflow-y-auto pr-2">
    ` + '`' + `;

    (c.history || []).forEach(m => {
      const align = m.from === 'sdr' ? 'items-end' : 'items-start';
      const bubble = m.from === 'sdr' ? 'msg-sdr text-white' : m.from === 'lead' ? 'msg-lead text-slate-100' : 'msg-system text-slate-300 text-xs italic';
      html += ` + '`' + `
        <div class="flex flex-col \${align}">
          <div class="\${bubble} px-3 py-2 rounded-lg max-w-[80%] break-words whitespace-pre-wrap">\${(m.text || '').replace(/</g,'&lt;')}</div>
          <div class="text-[10px] text-slate-500 mt-0.5">\${formatTime(m.ts)} · \${m.from}</div>
        </div>
      ` + '`' + `;
    });

    if ((c.history || []).length === 0) {
      html += '<div class="text-slate-600 text-sm text-center py-8">Sem mensagens ainda</div>';
    }

    html += '</div>';

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="text-rose-400">Erro carregando conversa: ' + e.message + '</div>';
  }
}

async function refresh() {
  try {
    const res = await fetch('/panel/api/leads');
    if (!res.ok) throw new Error('http ' + res.status);
    leadsData = await res.json();
    renderStats();
    renderList();
    if (selected) renderDetail();
  } catch (e) {
    document.getElementById('subtitle').textContent = 'Erro: ' + e.message;
  }
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
`;

const panelRoutes: FastifyPluginAsync = async (app) => {
  const store = new ConversationStore();

  // HTML page — no auth required (localhost / tunnel-local UI)
  app.get('/panel', async (_req, reply) => {
    reply.type('text/html; charset=utf-8').send(PANEL_HTML);
  });

  // JSON list of leads
  app.get('/panel/api/leads', async () => {
    const summaries = await store.list();
    const results = await Promise.all(
      summaries.map(async (s) => {
        const c = await store.get(s.phone);
        if (!c) return null;
        const lastMsg = c.history[c.history.length - 1];
        return {
          phone: maskPhone(c.phone),
          rawPhone: c.phone,
          displayName: c.displayName,
          stage: c.stage,
          leadId: c.leadId,
          updatedAt: c.updatedAt,
          createdAt: c.createdAt,
          hasQuote: !!c.quote,
          vehicleConfirmed: c.vehicle?.confirmed ?? false,
          lastMessagePreview: lastMsg ? `${lastMsg.from === 'sdr' ? '→ ' : ''}${lastMsg.text.slice(0, 60)}` : '',
        };
      }),
    );
    return results.filter(Boolean).sort((a, b) => (b!.updatedAt || '').localeCompare(a!.updatedAt || ''));
  });

  // JSON detail of one conversation
  app.get('/panel/api/leads/:phone', async (req) => {
    const { phone } = PhoneParams.parse(req.params);
    const conv = await store.get(phone);
    if (!conv) return { conversation: null };
    // Redact CPF/RG in output
    const safe = {
      ...conv,
      customer: {
        ...conv.customer,
        cpf: conv.customer.cpf ? '***.***.***-**' : undefined,
      },
    };
    return { conversation: safe, stageColor: stageColor(conv.stage) };
  });
};

export default panelRoutes;
