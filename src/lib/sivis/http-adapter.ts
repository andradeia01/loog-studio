/**
 * SivisHttpAdapter — fala com o portal SIVIS como se fosse o consultor.
 *
 * Autenticação: cookie session ASP.NET (gerenciamento manual via header Cookie).
 * Content-Type: application/x-www-form-urlencoded com `functionPage` no body
 *   (padrão do framework PHP-style do SIVIS).
 * Loja: 028 (LOOG).
 *
 * O adapter é STATELESS entre jobs: cada chamada do worker faz login novo,
 * executa a operação e descarta a sessão. Simplifica o modelo (sem cache de
 * sessão a invalidar) e evita vazamento se o processo cair.
 *
 * Mapa de endpoints: docs/sivis-mapping/API-MAP-COMPLETE-2026-10-27.md
 */

const BASE = "https://portal.sivisweb.com.br";
const LOJA = "028";
const API = `${BASE}/loja/${LOJA}/api/`;
const TIMEOUT_MS = 20_000;

export class SivisAuthError extends Error { constructor(msg: string) { super(msg); this.name = "SivisAuthError"; } }
export class SivisApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "SivisApiError";
  }
}

export interface SivisSession {
  /** Cookie header pronto pra reutilizar: "ASP.NET_SessionId=xxx; outro=yyy" */
  cookieHeader: string;
  loja: string;
  consultorId?: string;
  consultorNome?: string;
}

export interface LeadInput {
  nome: string;
  telefone: string;         // só dígitos, sem máscara
  procedencia?: string;     // default "29"
  cpf?: string;
  email?: string;
  veiculo: {
    placa?: string;
    tipo: "carro" | "moto" | "caminhao" | "utilitario" | "eletrico";
    marca: string;
    modelo: string;
    anoModelo: number;
    fipeCode?: string;
    combustivel?: string;
    siglaCombustivel?: string;
    mesReferenciaFipe?: string;
    valorFipeCents?: number;
    consultaFipe?: 0 | 2;   // 0=FIPE 2=Zero km
  };
  plano?: {
    nome: string;
    taxaAdesaoCents: number;
    mensalCents: number;
  };
}

export interface DocumentInput {
  tipo: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  sivisLeadId: string;
}

export class SivisHttpAdapter {

  // ─── AUTH ──────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<SivisSession> {
    // 1. GET /loja/028/login — recebe cookie anônimo (seed da sessão)
    //    Nota: cookie real é PHPSESSID (SIVIS roda sobre PHP, não ASP.NET como
    //    o mapeamento inicial sugeriu — não muda o fluxo, só o nome).
    const seedCookies = await this._seedSession();

    // 2. POST login — _postLogin não sobe exception em 4xx, pq o próprio SIVIS
    //    devolve {"erro":{"password":false}} com HTTP 422 quando a credencial é
    //    inválida. Precisamos ler o body pra traduzir pro usuário.
    const loginRes = await this._postLogin(seedCookies, { email, password });
    const loginBody = (await loginRes.text()).trim();

    if (loginRes.status === 422 || loginRes.status === 401) {
      // SIVIS devolve algo tipo {"erro":{"password":false}} ou {"erro":{"email":false}}
      let msg = "credencial inválida";
      try {
        const parsed = JSON.parse(loginBody) as { erro?: Record<string, unknown> };
        const erro = parsed?.erro;
        if (erro && typeof erro === "object") {
          if ("password" in erro) msg = "senha SIVIS incorreta";
          else if ("email" in erro) msg = "e-mail não cadastrado no SIVIS";
          else msg = `SIVIS recusou: ${Object.keys(erro).join(", ")}`;
        }
      } catch { /* body não é JSON */ }
      throw new SivisAuthError(msg);
    }
    if (!loginRes.ok) {
      throw new SivisApiError(loginRes.status, `SIVIS login HTTP ${loginRes.status}: ${loginBody.slice(0, 120)}`);
    }
    if (loginBody !== "true") {
      throw new SivisAuthError(`SIVIS retornou "${loginBody.slice(0, 100)}" ao invés de "true"`);
    }
    // O cookie pode ter sido atualizado após login (ASP.NET pode promover)
    const afterLoginCookies = this._mergeSetCookie(seedCookies, loginRes.headers);

    // 3. criarSessaoConsultor (pattern confirmado pelo HAR)
    const sessaoRes = await this._post(afterLoginCookies, "dashboard/funcionario", {
      rapido: "0",
      functionPage: "criarSessaoConsultor",
    });
    const finalCookies = this._mergeSetCookie(afterLoginCookies, sessaoRes.headers);

    // 4. GET dashboard → pega consultorId
    let consultorId: string | undefined;
    let consultorNome: string | undefined;
    try {
      const dashRes = await this._get(finalCookies, "dashboard/dashboard", { functionPage: "GetDashboard" });
      const dash = (await dashRes.json()) as { usuario?: { id?: string; razao_social?: string } };
      consultorId = dash.usuario?.id;
      consultorNome = dash.usuario?.razao_social;
    } catch { /* nao é critico */ }

    return { cookieHeader: finalCookies, loja: LOJA, consultorId, consultorNome };
  }

  async testarLogin(email: string, password: string): Promise<{ ok: true; consultorId?: string; consultorNome?: string } | { ok: false; error: string }> {
    try {
      const session = await this.login(email, password);
      return { ok: true, consultorId: session.consultorId, consultorNome: session.consultorNome };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ─── LEAD ──────────────────────────────────────────────────────────

  async createLead(s: SivisSession, lead: LeadInput): Promise<{ sivisLeadId: string }> {
    const body: Record<string, string> = {
      functionPage: "salvarLead",
      nome: lead.nome,
      celular: this._stripPhone(lead.telefone),
      procedencia: lead.procedencia ?? "29",
      "veiculo[valor]": lead.veiculo.valorFipeCents != null ? this._brl(lead.veiculo.valorFipeCents) : "",
      "veiculo[marca]": lead.veiculo.marca,
      "veiculo[modelo]": lead.veiculo.modelo,
      "veiculo[ano_modelo]": String(lead.veiculo.anoModelo),
      "veiculo[codigo_fipe]": lead.veiculo.fipeCode ?? "",
      "veiculo[combustivel]": lead.veiculo.combustivel ?? "",
      "veiculo[sigla_combustivel]": lead.veiculo.siglaCombustivel ?? "",
      "veiculo[mes_referencia]": lead.veiculo.mesReferenciaFipe ?? "",
      "veiculo[consulta_fipe]": String(lead.veiculo.consultaFipe ?? 0),
      "veiculo[tipo_veiculo]": this._mapTipoVeiculo(lead.veiculo.tipo),
      "veiculo[placa]": lead.veiculo.placa ?? "",
      "veiculo[id]": "",
    };
    if (lead.plano) {
      body["plano[nome]"] = lead.plano.nome;
      body["plano[taxa_adesao]"] = String(lead.plano.taxaAdesaoCents / 100);
      body["plano[valor_mensal]"] = this._brlPlain(lead.plano.mensalCents);
    }
    const res = await this._post(s.cookieHeader, "portal/crm", body);
    const parsed = await this._parseJson(res);
    const id = (parsed as { id?: string }).id;
    if (!id) throw new SivisApiError(res.status, "SIVIS nao retornou ID do lead", parsed);
    return { sivisLeadId: String(id) };
  }

  async uploadDocument(s: SivisSession, doc: DocumentInput): Promise<{ docId?: string; raw: unknown }> {
    // Endpoint multipart — functionPage vai no FormData, bytes do arquivo em 'file'
    const form = new FormData();
    form.append("functionPage", "saveUpload");
    form.append("id_usuario", doc.sivisLeadId);  // confirmar no primeiro upload real
    form.append("tipo", doc.tipo);
    form.append("file", new Blob([doc.bytes as BlobPart], { type: doc.mimeType }), doc.filename);

    const res = await fetch(`${API}dashboard/pendencia`, {
      method: "POST",
      headers: {
        "Cookie": s.cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE,
        "Referer": `${BASE}/loja/${LOJA}/pendencias`,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "User-Agent": "LoogStudio/1.0",
      },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new SivisApiError(res.status, await res.text().catch(() => "upload falhou"));
    const parsed = await this._parseJson(res);
    return { docId: (parsed as { id?: string })?.id, raw: parsed };
  }

  async finalizarAdesao(s: SivisSession, data: { id_plano: string }): Promise<void> {
    await this._post(s.cookieHeader, "dashboard/pendencia", { functionPage: "finalizarAdesao", id_plano: data.id_plano });
  }

  async cancelarAdesao(s: SivisSession, data: { id_plano: string }): Promise<void> {
    await this._post(s.cookieHeader, "dashboard/pendencia", { functionPage: "cancelarAdesao", id_plano: data.id_plano });
  }

  async listPendencias(s: SivisSession, filtros: Record<string, string>): Promise<unknown> {
    const res = await this._get(s.cookieHeader, "dashboard/pendencia", { functionPage: "getListaPendencias", ...filtros });
    return this._parseJson(res);
  }

  // ─── INTERNALS ────────────────────────────────────────────────────

  private async _seedSession(): Promise<string> {
    const res = await fetch(`${BASE}/loja/${LOJA}/login`, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "LoogStudio/1.0",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return this._extractSetCookies(res.headers);
  }

  /** Extrai TODOS os Set-Cookie da response em um header Cookie montado (name=value; ...) */
  private _extractSetCookies(headers: Headers): string {
    // Node fetch: headers.getSetCookie() devolve array; fallback pra getAll
    const anyH = headers as unknown as { getSetCookie?: () => string[] };
    const cookies = typeof anyH.getSetCookie === "function" ? anyH.getSetCookie() : [];
    const pairs = cookies.map((c) => c.split(";")[0].trim()).filter(Boolean);
    return pairs.join("; ");
  }

  /** Merge: pega cookies novos do Set-Cookie e sobrescreve os existentes com mesmo nome. */
  private _mergeSetCookie(current: string, headers: Headers): string {
    const newCookies = this._extractSetCookies(headers);
    if (!newCookies) return current;

    const map = new Map<string, string>();
    for (const p of current.split(";").map((s) => s.trim()).filter(Boolean)) {
      const [k, ...v] = p.split("=");
      map.set(k, v.join("="));
    }
    for (const p of newCookies.split(";").map((s) => s.trim()).filter(Boolean)) {
      const [k, ...v] = p.split("=");
      map.set(k, v.join("="));
    }
    return Array.from(map, ([k, v]) => `${k}=${v}`).join("; ");
  }

  private async _post(cookieHeader: string, path: string, body: Record<string, string>): Promise<Response> {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: this._headers(cookieHeader, "application/x-www-form-urlencoded; charset=UTF-8"),
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new SivisApiError(res.status, `SIVIS ${path} → ${res.status}`, await res.text().catch(() => null));
    }
    return res;
  }

  /** POST específico pro login: NÃO sobe exception em 4xx porque o SIVIS devolve
   *  422 com body {"erro":{"password":false}} pra credencial inválida, e
   *  precisamos ler o body pra traduzir a mensagem pro usuário. */
  private async _postLogin(cookieHeader: string, creds: { email: string; password: string }): Promise<Response> {
    return fetch(`${API}portal/usuario`, {
      method: "POST",
      headers: this._headers(cookieHeader, "application/x-www-form-urlencoded; charset=UTF-8"),
      body: new URLSearchParams({ functionPage: "restrictedArea", email: creds.email, password: creds.password }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private async _get(cookieHeader: string, path: string, query: Record<string, string>): Promise<Response> {
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${API}${path}?${qs}`, {
      method: "GET",
      headers: this._headers(cookieHeader),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new SivisApiError(res.status, `SIVIS GET ${path} → ${res.status}`, await res.text().catch(() => null));
    }
    return res;
  }

  private _headers(cookieHeader: string, contentType?: string): Record<string, string> {
    const h: Record<string, string> = {
      "Cookie": cookieHeader,
      "X-Requested-With": "XMLHttpRequest",
      "Origin": BASE,
      "Referer": `${BASE}/loja/${LOJA}/cliente`,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "User-Agent": "LoogStudio/1.0",
    };
    if (contentType) h["Content-Type"] = contentType;
    return h;
  }

  /** Parse response — SIVIS devolve text/html mas conteudo eh JSON. */
  private async _parseJson(res: Response): Promise<unknown> {
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { _raw: text.slice(0, 500) }; }
  }

  private _brl(cents: number): string {
    return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  private _brlPlain(cents: number): string {
    return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  private _stripPhone(phone: string): string {
    return phone.replace(/\D/g, "");
  }
  private _mapTipoVeiculo(t: string): string {
    const map: Record<string, string> = { carro: "1", moto: "2", caminhao: "3", utilitario: "4", eletrico: "5" };
    return map[t] ?? "1";
  }
}
