/**
 * Catálogo central de erros do fluxo de cotação.
 *
 * TODO caminho que falha (PlacaFIPE, SIVIS/Hub, auth, rede, rate limit) devolve
 * um objeto no formato { source, code, title, message, nextAction } — assim
 * a UI mostra EXATAMENTE qual sistema reclamou e sugere o que o consultor
 * pode fazer sem precisar chutar ou chamar o admin.
 *
 * Convenção:
 *   source     = quem errou (placafipe | sivis | auth | network | studio)
 *   code       = slug técnico (log/analytics)
 *   title      = frase curta (badge/toast — 2-6 palavras)
 *   message    = explicação pro consultor (1-2 linhas)
 *   nextAction = o que a UI deve oferecer (retry | manual | relogin | wait | contact_admin)
 *   httpStatus = status HTTP a retornar
 *   retryable  = se vale tentar de novo igual sem mudar nada
 */

export type ErrorSource = "placafipe" | "sivis" | "auth" | "network" | "studio";
export type NextAction = "retry" | "manual" | "relogin" | "wait" | "contact_admin" | "fix_input";

export interface CotacaoError {
  source: ErrorSource;
  code: string;
  title: string;
  message: string;
  nextAction: NextAction;
  httpStatus: number;
  retryable: boolean;
  /** O que o upstream disse originalmente — vai pros Function Logs, não pro consultor. */
  upstreamMessage?: string;
  /** Qualquer dado extra pra analytics (ex: fipe_code tentado, placa). */
  context?: Record<string, unknown>;
}

/** Pergunta HTTP + body que o route handler devolve. */
export function toApiResponse(err: CotacaoError) {
  return {
    body: {
      error: err.code,
      source: err.source,
      title: err.title,
      message: err.message,
      nextAction: err.nextAction,
      retryable: err.retryable,
    },
    status: err.httpStatus,
  };
}

// ─── FACTORIES ─────────────────────────────────────────────────────────────

export function errPlacaInvalida(placa: string): CotacaoError {
  return {
    source: "studio",
    code: "placa_formato_invalido",
    title: "Placa inválida",
    message: `A placa "${placa}" não está no formato brasileiro (ABC1234 ou ABC1D23).`,
    nextAction: "fix_input",
    httpStatus: 400,
    retryable: false,
    context: { placa },
  };
}

export function errPlacafipeTokenAusente(): CotacaoError {
  return {
    source: "placafipe",
    code: "placafipe_sem_token",
    title: "PlacaFIPE não configurada",
    message: "O token do serviço de consulta de placas não está configurado. Avisa o admin.",
    nextAction: "contact_admin",
    httpStatus: 500,
    retryable: false,
  };
}

export function errPlacafipeTokenInvalido(upstreamMsg?: string): CotacaoError {
  return {
    source: "placafipe",
    code: "placafipe_token_invalido",
    title: "Token PlacaFIPE expirado",
    message: "O token do PlacaFIPE expirou ou foi revogado. O admin precisa renovar em placafipe.com.br — enquanto isso, nenhuma placa consegue ser consultada. Use cotação manual (marca + modelo + ano).",
    nextAction: "manual",
    httpStatus: 401,
    retryable: false,
    upstreamMessage: upstreamMsg,
  };
}

export function errPlacafipeSemCredito(upstreamMsg?: string): CotacaoError {
  return {
    source: "placafipe",
    code: "placafipe_sem_credito",
    title: "PlacaFIPE sem crédito",
    message: "A conta do PlacaFIPE ficou sem saldo/créditos. O admin precisa recarregar. Enquanto isso, use cotação manual.",
    nextAction: "contact_admin",
    httpStatus: 402,
    retryable: false,
    upstreamMessage: upstreamMsg,
  };
}

export function errPlacafipeNaoEncontrou(placa: string, upstreamMsg?: string): CotacaoError {
  return {
    source: "placafipe",
    code: "placafipe_placa_nao_encontrada",
    title: "PlacaFIPE: placa não existe",
    message: `A base da PlacaFIPE não reconhece a placa ${placa}. Confere se digitou certo — se tiver certeza, usa cotação manual (marca + modelo + ano).`,
    nextAction: "manual",
    httpStatus: 404,
    retryable: false,
    upstreamMessage: upstreamMsg,
    context: { placa },
  };
}

export function errPlacafipeTimeout(placa: string): CotacaoError {
  return {
    source: "placafipe",
    code: "placafipe_timeout",
    title: "PlacaFIPE lenta demais",
    message: "A consulta da placa não respondeu a tempo (API externa instável). Tenta de novo em alguns segundos — se persistir, usa cotação manual.",
    nextAction: "retry",
    httpStatus: 504,
    retryable: true,
    context: { placa },
  };
}

export function errPlacafipeIndisponivel(placa: string, upstreamMsg?: string): CotacaoError {
  return {
    source: "placafipe",
    code: "placafipe_indisponivel",
    title: "PlacaFIPE fora do ar",
    message: "O serviço de placas está instável. Tenta de novo em ~1 min ou usa cotação manual.",
    nextAction: "manual",
    httpStatus: 502,
    retryable: true,
    upstreamMessage: upstreamMsg,
    context: { placa },
  };
}

export function errPlacafipeFipeSemMatch(placa: string): CotacaoError {
  return {
    source: "placafipe",
    code: "placafipe_sem_fipe",
    title: "FIPE não encontrada",
    message: `A PlacaFIPE achou a placa ${placa} mas não conseguiu o valor na tabela FIPE. Usa cotação manual com o código FIPE correto.`,
    nextAction: "manual",
    httpStatus: 422,
    retryable: false,
    context: { placa },
  };
}

export function errSivisPlacaBloqueada(placa: string, upstreamMsg?: string): CotacaoError {
  return {
    source: "sivis",
    code: "sivis_placa_bloqueada",
    title: "SIVIS bloqueou essa placa",
    message: `O SIVIS recusou a placa ${placa} — pode ser restrição comercial da base LOOG (histórico de sinistros, modelo não permitido). Usa cotação manual se tiver autorização, ou fala com o gestor.`,
    nextAction: "manual",
    httpStatus: 403,
    retryable: false,
    upstreamMessage: upstreamMsg,
    context: { placa },
  };
}

export function errSivisPlacaNaoEncontrada(placa: string, upstreamMsg?: string): CotacaoError {
  return {
    source: "sivis",
    code: "sivis_placa_nao_encontrada",
    title: "SIVIS: placa não cotável",
    message: `O SIVIS não tem essa placa no provedor interno. Confere se digitou certo — se tiver, usa cotação manual (marca + modelo + ano).`,
    nextAction: "manual",
    httpStatus: 404,
    retryable: false,
    upstreamMessage: upstreamMsg,
    context: { placa },
  };
}

export function errSivisSessaoHubExpirada(): CotacaoError {
  return {
    source: "sivis",
    code: "sivis_hub_sessao_expirada",
    title: "Hub LOOG precisa religar",
    message: "A sessão do Hub LOOG com o SIVIS expirou. É automático — tenta de novo em 10s. Se persistir, avisa o admin.",
    nextAction: "retry",
    httpStatus: 401,
    retryable: true,
  };
}

export function errSivisTimeout(placa: string): CotacaoError {
  return {
    source: "sivis",
    code: "sivis_timeout",
    title: "SIVIS lento demais",
    message: "O SIVIS demorou pra responder. Tenta de novo em alguns segundos.",
    nextAction: "retry",
    httpStatus: 504,
    retryable: true,
    context: { placa },
  };
}

export function errSivisForaDoAr(): CotacaoError {
  return {
    source: "sivis",
    code: "sivis_fora_do_ar",
    title: "SIVIS indisponível",
    message: "O SIVIS está fora do ar no momento. Isso é instabilidade do sistema oficial LOOG — nada que a gente possa fazer agora. Tenta em alguns minutos.",
    nextAction: "wait",
    httpStatus: 503,
    retryable: true,
  };
}

export function errHubOffline(): CotacaoError {
  return {
    source: "network",
    code: "hub_offline",
    title: "Hub LOOG offline",
    message: "O servidor interno do Hub LOOG não respondeu. Nenhuma cotação consegue chegar no SIVIS agora. Tenta em alguns minutos ou avisa o admin.",
    nextAction: "wait",
    httpStatus: 503,
    retryable: true,
  };
}

export function errSessaoExpirada(): CotacaoError {
  return {
    source: "auth",
    code: "sessao_expirada",
    title: "Sessão expirada",
    message: "Seu login do Studio expirou. Clica em \"Entrar de novo\" — a cotação é refeita automaticamente.",
    nextAction: "relogin",
    httpStatus: 401,
    retryable: false,
  };
}

export function errNaoAprovado(): CotacaoError {
  return {
    source: "auth",
    code: "nao_aprovado",
    title: "Sem permissão",
    message: "Seu cadastro ainda não foi aprovado pelo admin. Fala com a diretoria LOOG.",
    nextAction: "contact_admin",
    httpStatus: 403,
    retryable: false,
  };
}

export function errRateLimitStudio(secs: number): CotacaoError {
  return {
    source: "studio",
    code: "rate_limit_studio",
    title: "Muitas consultas",
    message: `Você bateu o limite de consultas em pouco tempo. Aguarda ${secs}s e tenta de novo. (Se precisar de mais, pede pro admin aumentar.)`,
    nextAction: "wait",
    httpStatus: 429,
    retryable: true,
    context: { secs },
  };
}

export function errTelefoneInvalido(): CotacaoError {
  return {
    source: "studio",
    code: "telefone_invalido",
    title: "Telefone inválido",
    message: "Telefone precisa ter DDD + número (10 ou 11 dígitos). Ex: 24987654321.",
    nextAction: "fix_input",
    httpStatus: 400,
    retryable: false,
  };
}

export function errBodyInvalido(details: unknown): CotacaoError {
  return {
    source: "studio",
    code: "body_invalido",
    title: "Dados incompletos",
    message: "Faltam campos obrigatórios (nome, telefone, placa) ou algum tem formato errado.",
    nextAction: "fix_input",
    httpStatus: 400,
    context: { details } as Record<string, unknown>,
    retryable: false,
  };
}

export function errDesconhecido(raw: unknown): CotacaoError {
  const msg = raw instanceof Error ? raw.message : String(raw);
  return {
    source: "studio",
    code: "desconhecido",
    title: "Falha inesperada",
    message: "Algo saiu errado por aqui. Tenta de novo — se persistir, me (admin) avisa com o horário.",
    nextAction: "retry",
    httpStatus: 500,
    retryable: true,
    upstreamMessage: msg,
  };
}

/**
 * Classifica um HubError (ou Error genérico de rede) em um CotacaoError do catálogo.
 * Mantém a lógica de mapeamento num só lugar — route handlers só chamam isso.
 */
export function classifyHubError(err: { status?: number; code?: string; message?: string }, placa: string): CotacaoError {
  const status = err.status ?? 0;
  switch (status) {
    case 401: return errSivisSessaoHubExpirada();
    case 403: return errSivisPlacaBloqueada(placa, err.message);
    case 404: return errSivisPlacaNaoEncontrada(placa, err.message);
    case 408:
    case 504: return errSivisTimeout(placa);
    case 429: return errRateLimitStudio(30);
    case 502:
    case 503: return errSivisForaDoAr();
    default:
      return {
        source: "sivis",
        code: err.code ?? "sivis_erro_desconhecido",
        title: `SIVIS respondeu ${status}`,
        message: `Erro ${status} do sistema oficial LOOG. ${err.message ?? "Tenta de novo em alguns segundos."}`,
        nextAction: status >= 500 ? "retry" : "manual",
        httpStatus: status >= 400 && status < 500 ? status : 502,
        retryable: status >= 500,
        upstreamMessage: err.message,
      };
  }
}

/** Detecta se uma Error de rede casa com os padrões "upstream caiu". */
export function isNetworkError(msg: string): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|certificate|SSL|TLS|socket hang up/i.test(msg);
}
