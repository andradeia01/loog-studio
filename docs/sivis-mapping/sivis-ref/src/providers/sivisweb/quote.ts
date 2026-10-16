import { DomainError } from '../../lib/errors.js';
import type {
  QuickQuoteInput,
  QuickQuotePlan,
  QuickQuoteResult,
  QuoteProvider,
} from '../quote/types.js';
import { applyLoogCoveragePolicy, type Cobertura, type CoberturaItem } from './coverage-policy.js';
import { generatePdfAccessToken, storeQuoteRecord } from './quote-store.js';
import type { SivisWebSessionManager } from './session.js';

interface Produto {
  id: string;
  nome: string;
  descricao?: string;
  mensagem?: string;
  valor_mensal?: string;
  taxa_adesao?: string;
  piso_franquia?: string;
  recomendado?: boolean;
  acessorios?: AcessorioItem[];
  servicos?: AcessorioItem[];
}
interface AcessorioItem {
  id: string;
  nome: string;
  valor: string;
  descricao?: string;
  cobertura?: string;
  padrao?: number | boolean;
  so_padrao?: number | boolean;
}
interface SalvarLeadResponse {
  id: string | number;
}
interface BuscarServicosResponse {
  produtos: Produto[];
}
interface BuscarCoberturasResponse {
  coberturas: Cobertura[];
}
function toBrlValue(cents: number): string {
  const reais = cents / 100;
  return `R$ ${reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseBrlToCents(input: string | undefined | null): number {
  if (!input) return 0;
  const digits = input.replace(/[^\d,]/g, '').replace(',', '.');
  if (!digits) return 0;
  const n = Number(digits);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function normalizePhone(input: string): string {
  const only = input.replace(/\D/g, '');
  if (only.length === 11) {
    return `(${only.slice(0, 2)}) ${only.slice(2, 7)}-${only.slice(7)}`;
  }
  if (only.length === 13 && only.startsWith('55')) {
    const rest = only.slice(2);
    return `(${rest.slice(0, 2)}) ${rest.slice(2, 7)}-${rest.slice(7)}`;
  }
  return input;
}

function pickDefaultAccessories(list: AcessorioItem[] | undefined): AcessorioItem[] {
  if (!list) return [];
  return list.filter((a) => a.padrao === 1 || a.padrao === true);
}

export interface SivisWebQuoteOptions {
  consultorId?: string;
  hubBaseUrl?: string;
}

export class SivisWebQuoteProvider implements QuoteProvider {
  readonly name = 'sivisweb';
  constructor(
    private readonly sessions: SivisWebSessionManager,
    private readonly storeId: string,
    private readonly opts: SivisWebQuoteOptions = {},
  ) {}

  private buildPrintUrl(
    quoteId: string,
    input: QuickQuoteInput,
    selectedIds: string[],
  ): string {
    const base = `https://portal.sivisweb.com.br/loja/${this.storeId}/api/dashboard/pendencia`;
    const v = input.vehicle;
    const p = new URLSearchParams({
      functionPage: 'imprimirRapida',
      id: this.opts.consultorId ?? '10',
      acessorios: selectedIds.join(','),
      placa: v.plate,
      marca: v.brand.replace(/ /g, '_'),
      modelo: v.model.replace(/ /g, '_'),
      ano_modelo: String(v.modelYear),
      codigo_fipe: v.fipeCode,
      mes_referencia: v.fipeMonth,
      valor: toBrlValue(v.fipeValueCents),
      id_convenio: '',
    });
    return `${base}?${p.toString()}`;
  }

  async createQuickQuote(input: QuickQuoteInput): Promise<QuickQuoteResult> {
    const http = await this.sessions.getConsultorSession();
    const base = `/loja/${this.storeId}`;
    const v = input.vehicle;
    const valorBrl = toBrlValue(v.fipeValueCents);
    const valorNumeric = Math.round(v.fipeValueCents / 100);

    // 1. Save the lead
    const salvar = await http.request<SalvarLeadResponse>(`${base}/api/portal/crm`, {
      method: 'POST',
      ajax: true,
      form: buildLeadForm({
        leadId: '',
        input,
        valorBrl,
      }),
    });
    const leadId = String(salvar.body?.id ?? '');
    if (!leadId) {
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message: 'Sivisweb salvarLead did not return an id.',
        retryable: true,
      });
    }

    // 2. List available products
    const servicos = await http.request<BuscarServicosResponse>(`${base}/api/portal/produto`, {
      method: 'POST',
      ajax: true,
      form: {
        functionPage: 'buscarServicos',
        tipo_veiculo: v.vehicleType ?? 1,
        valor: valorNumeric,
        marca: v.brandCode ?? '',
        ano_modelo: v.modelYear,
      },
    });
    const produtos = servicos.body?.produtos ?? [];
    if (produtos.length === 0) {
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message: 'Sivisweb buscarServicos returned no products for this vehicle.',
        retryable: false,
      });
    }
    const chosen =
      (input.productId !== undefined && produtos.find((p) => String(p.id) === String(input.productId))) ||
      produtos.find((p) => p.recomendado) ||
      produtos[0]!;

    // 3. Fetch coverages for the chosen product
    const coberturas = await http.request<BuscarCoberturasResponse>(
      `${base}/api/portal/produto`,
      {
        method: 'POST',
        ajax: true,
        form: {
          functionPage: 'buscarCoberturas',
          tipo_veiculo: v.vehicleType ?? 1,
          produto_id: chosen.id,
          valor: valorNumeric,
        },
      },
    );

    const policy = applyLoogCoveragePolicy(coberturas.body?.coberturas ?? []);
    const defaultCoverages = policy.selected;
    const defaultAccessories = pickDefaultAccessories(chosen.acessorios);

    const baseMonthly = parseBrlToCents(chosen.valor_mensal);
    const coveragesMonthly = defaultCoverages.reduce(
      (acc, it) => acc + parseBrlToCents(it.valor),
      0,
    );
    const accessoriesMonthly = defaultAccessories.reduce(
      (acc, it) => acc + parseBrlToCents(it.valor),
      0,
    );
    const monthly = baseMonthly + coveragesMonthly + accessoriesMonthly;
    const joinFeeCents = parseBrlToCents(chosen.taxa_adesao);

    // 4. Update the lead with the chosen plan
    const planForm: Record<string, string | number> = {
      ...buildLeadForm({ leadId, input, valorBrl }),
      'plano[nome]': chosen.nome,
      'plano[produto_id]': chosen.id,
      'plano[valor_mensal]': chosen.valor_mensal ?? '',
      'plano[taxa_adesao]': chosen.taxa_adesao ?? '',
      'plano[valor_total]': toBrlValue(monthly),
    };
    defaultCoverages.forEach((it, i) => {
      planForm[`plano[coberturas][${i}][id]`] = it.id;
      planForm[`plano[coberturas][${i}][nome]`] = it.nome;
      planForm[`plano[coberturas][${i}][valor]`] = it.valor;
    });
    defaultAccessories.forEach((it, i) => {
      planForm[`plano[acessorios][${i}][id]`] = it.id;
      planForm[`plano[acessorios][${i}][nome]`] = it.nome;
      planForm[`plano[acessorios][${i}][valor]`] = it.valor;
    });
    await http.request(`${base}/api/portal/crm`, {
      method: 'POST',
      ajax: true,
      form: planForm,
    });

    // 5. Build the WhatsApp message using LOOG Studio formatted template.
    // (Previously fetched the Sivisweb-side template via getModeloWhats; replaced
    // by a local template because the LOOG Studio version is the canonical one.)
    const includedIds = new Set(defaultAccessories.map((a) => a.id));
    const additionalOnly = defaultCoverages.filter((c) => !includedIds.has(c.id));
    const investmentInitialCents = monthly + joinFeeCents;
    const whatsappMessage = renderLoogWhatsAppMessage({
      customerName: input.customer.name,
      plate: v.plate,
      brand: v.brand,
      model: v.model,
      modelYear: v.modelYear,
      fipeValueFormatted: valorBrl,
      investmentInitialFormatted: toBrlValue(investmentInitialCents),
      totalMonthlyFormatted: toBrlValue(monthly),
      protectionItems: defaultAccessories.map((a) => ({ nome: a.nome })),
      additionalItems: additionalOnly.map((c) => ({ nome: c.nome })),
    });

    const plan: QuickQuotePlan = {
      productId: chosen.id,
      name: chosen.nome,
      monthlyValueCents: monthly,
      monthlyValueFormatted: toBrlValue(monthly),
      joinFeeValueCents: joinFeeCents,
      joinFeeFormatted: chosen.taxa_adesao ?? '',
      defaultServices: defaultAccessories.map((a) => ({
        id: a.id,
        name: a.nome,
        valueFormatted: a.valor,
      })),
      defaultCoverages: defaultCoverages.map((c) => ({
        id: c.id,
        name: c.nome,
        valueFormatted: c.valor,
      })),
    };

    const selectedCoverageIds = [
      ...defaultAccessories.map((a) => a.id),
      ...defaultCoverages.map((c) => c.id),
    ];
    // dedupe while preserving order
    const uniqueIds: string[] = [];
    const seen = new Set<string>();
    for (const id of selectedCoverageIds) {
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }
    const printUrl = this.buildPrintUrl(leadId, input, uniqueIds);
    const pdfAccessToken = generatePdfAccessToken();
    storeQuoteRecord(leadId, {
      quoteId: leadId,
      sivisWebPrintUrl: printUrl,
      pdfAccessToken,
      createdAt: Date.now(),
    });
    const pdfUrl = this.opts.hubBaseUrl
      ? `${this.opts.hubBaseUrl.replace(/\/$/, '')}/v1/quote/${leadId}/pdf?t=${pdfAccessToken}`
      : undefined;

    return {
      quoteId: leadId,
      provider: 'sivisweb',
      plan,
      ...(whatsappMessage ? { whatsappMessage } : {}),
      portalUrl: `https://portal.sivisweb.com.br/loja/${this.storeId}/cliente/${leadId}`,
      printUrl,
      ...(pdfUrl ? { pdfUrl } : {}),
    };
  }
}

function buildLeadForm(args: {
  leadId: string;
  input: QuickQuoteInput;
  valorBrl: string;
}): Record<string, string | number> {
  const { leadId, input, valorBrl } = args;
  const v = input.vehicle;
  return {
    ...(leadId ? { id: leadId } : {}),
    nome: input.customer.name,
    celular: normalizePhone(input.customer.phone),
    procedencia: input.customer.sourceId ?? 29,
    'veiculo[valor]': valorBrl,
    'veiculo[marca]': v.brand,
    'veiculo[modelo]': v.model,
    'veiculo[ano_modelo]': v.modelYear,
    'veiculo[codigo_fipe]': v.fipeCode,
    'veiculo[combustivel]': v.fuel ?? '',
    'veiculo[mes_referencia]': v.fipeMonth,
    'veiculo[sigla_combustivel]': v.fuelInitial ?? '',
    'veiculo[id]': '',
    'veiculo[consulta_fipe]': 0,
    'veiculo[tipo_veiculo]': v.vehicleType ?? 1,
    'veiculo[placa]': v.plate,
    functionPage: 'salvarLead',
  };
}

function renderLoogWhatsAppMessage(ctx: {
  customerName: string;
  plate: string;
  brand: string;
  model: string;
  modelYear: number;
  fipeValueFormatted: string;
  investmentInitialFormatted: string;
  totalMonthlyFormatted: string;
  protectionItems: Array<{ nome: string }>;
  additionalItems: Array<{ nome: string }>;
}): string {
  const vehicleLine = `${ctx.brand} - ${ctx.model}`.replace(/\s{2,}/g, ' ').trim();
  // ASSISTÊNCIA 24H is a fixed LOOG benefit (not returned by Sivisweb as a line item),
  // so we prepend it to whatever the provider returned.
  const protection = [
    '✔ ASSISTÊNCIA 24H EM TODO TERRITÓRIO NACIONAL',
    ...ctx.protectionItems.map((i) => `✔ ${i.nome}`),
  ].join('\n');
  const additionals = ctx.additionalItems.length
    ? ctx.additionalItems.map((i) => `✔ ${i.nome}`).join('\n')
    : '(nenhum adicional contratado)';

  return `*LOOG PROTEÇÃO VEICULAR*

Olá ${ctx.customerName}, tudo bem?

⚠️ Você está prestes a fazer parte da Melhor Associação de Proteção Veicular do Brasil!

🚗 Cotação Veículo Passeio

*DADOS DO VEÍCULO*
Placa: ${ctx.plate}
Veículo: ${vehicleLine}
Ano modelo: ${ctx.modelYear}
Valor FIPE: ${ctx.fipeValueFormatted}

Investimento inicial: *${ctx.investmentInitialFormatted}*
Valor Total do Plano: *${ctx.totalMonthlyFormatted}*

Veja os Benefícios já *inclusos* no seu plano:

*Proteção Contratada*
${protection}

*Adicionais Contratados*
${additionals}

*DIFERENCIAIS DA LOOG*
❌ Sem Análise de Perfil;
❌ Sem Consulta SPC e Serasa;
✅ Pagamento mensal via Boleto e Cartão de Crédito;
✅ Pagamento mensal via PIX;
✅ Proteção *MUITO COMPLETA*

Validade da Proposta: 5 dias.`;
}
