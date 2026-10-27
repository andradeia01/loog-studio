"use client";

/**
 * Formulario de cotacao 0km (veiculo novo, sem placa). O consultor seleciona
 * tipo -> marca -> modelo -> ano/versao, puxando tudo do catalogo FIPE pre-carregado
 * + API parallelum em tempo real pro valor exato.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/errors/api-fetch";

interface Marca { codigo: string; nome: string }
interface Modelo { codigo: string; nome: string }
interface Ano {
  codigo: string; ano_modelo: number; combustivel: string;
  valor_cents: number; valor_formatted: string; fipe_code: string;
}

type TipoFipe = "carros" | "motos" | "caminhoes";
type TipoVeiculo = "carro" | "moto" | "utilitario" | "eletrico" | "caminhao";

const TIPO_LABEL: Record<TipoFipe, string> = {
  carros: "🚗 Carro / Pickup / Elétrico",
  motos: "🏍️ Moto",
  caminhoes: "🚛 Caminhão / Van",
};

export function ZeroKmForm({
  cliente, onCotar, loading,
}: {
  cliente: { nome: string; telefone: string };
  onCotar: (dados: {
    tipo: TipoVeiculo;
    marca: string;
    modelo: string;
    ano: number;
    combustivel?: string;
    fipeValor: number;
    fipeCode?: string;
  }) => void | Promise<void>;
  loading: boolean;
}) {
  const [tipoFipe, setTipoFipe] = useState<TipoFipe>("carros");
  const [marcaQ, setMarcaQ] = useState("");
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marca, setMarca] = useState<Marca | null>(null);
  const [modeloQ, setModeloQ] = useState("");
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [anos, setAnos] = useState<Ano[]>([]);
  const [ano, setAno] = useState<Ano | null>(null);
  const [loadingFipe, setLoadingFipe] = useState(false);
  const [tipoVeiculoOverride, setTipoVeiculoOverride] = useState<TipoVeiculo | null>(null);

  // Busca marcas
  useEffect(() => {
    const t = setTimeout(async () => {
      const url = `/api/admin/fipe-catalog?tipo=${tipoFipe}` + (marcaQ ? `&q=${encodeURIComponent(marcaQ)}` : "");
      try {
        const r = await apiFetch(url);
        const j = await r.json();
        setMarcas(j.marcas ?? []);
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [tipoFipe, marcaQ]);

  // Busca modelos quando marca selecionada
  useEffect(() => {
    if (!marca) { setModelos([]); return; }
    const t = setTimeout(async () => {
      const url = `/api/admin/fipe-catalog?tipo=${tipoFipe}&marca=${marca.codigo}` + (modeloQ ? `&q=${encodeURIComponent(modeloQ)}` : "");
      try {
        const r = await apiFetch(url);
        const j = await r.json();
        setModelos(j.modelos ?? []);
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  }, [tipoFipe, marca, modeloQ]);

  // Busca anos+valor FIPE quando modelo selecionado
  useEffect(() => {
    if (!modelo || !marca) { setAnos([]); setAno(null); return; }
    setLoadingFipe(true);
    (async () => {
      try {
        const r = await apiFetch(`/api/admin/fipe-catalog/valor?tipo=${tipoFipe}&marca=${marca.codigo}&modelo=${modelo.codigo}`);
        const j = await r.json();
        setAnos(j.anos ?? []);
        // Auto-seleciona ano mais recente (geralmente 0km)
        if (j.anos?.[0]) setAno(j.anos[0]);
      } catch { setAnos([]); }
      setLoadingFipe(false);
    })();
  }, [tipoFipe, marca, modelo]);

  const resolveTipoVeiculo = (): TipoVeiculo => {
    if (tipoVeiculoOverride) return tipoVeiculoOverride;
    if (tipoFipe === "motos") return "moto";
    if (tipoFipe === "caminhoes") return "caminhao";
    // Carros: tenta deduzir por combustivel ou nome do modelo
    const comb = (ano?.combustivel ?? "").toLowerCase();
    const nome = (modelo?.nome ?? "").toLowerCase();
    if (/elet|battery|ev\b|bev/.test(comb) || /elet|hybrid|phev|plug/.test(nome)) return "eletrico";
    if (/diesel/.test(comb)) return "utilitario";
    return "carro";
  };

  const canCotar = marca && modelo && ano && cliente.nome.trim() && cliente.telefone.trim();

  const submit = () => {
    if (!canCotar) return;
    onCotar({
      tipo: resolveTipoVeiculo(),
      marca: marca.nome,
      modelo: modelo.nome,
      ano: ano.ano_modelo,
      combustivel: ano.combustivel,
      fipeValor: ano.valor_cents / 100,
      fipeCode: ano.fipe_code,
    });
  };

  return (
    <div className="card space-y-4 border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🆕</span>
        <div>
          <h2 className="font-display text-base font-bold text-emerald-200">Veículo 0 km — sem placa</h2>
          <p className="text-[11px] text-emerald-100/70">
            Escolha pelo catálogo FIPE oficial. Valor é consultado em tempo real.
          </p>
        </div>
      </div>

      {/* Tipo FIPE */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-loog-border bg-loog-panel/60 p-1">
        {(["carros", "motos", "caminhoes"] as const).map((t) => (
          <button
            key={t} type="button"
            onClick={() => { setTipoFipe(t); setMarca(null); setMarcaQ(""); setModelo(null); setAnos([]); setAno(null); setTipoVeiculoOverride(null); }}
            className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition sm:text-xs ${tipoFipe === t ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white"}`}
          >
            {TIPO_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Marca */}
      <div>
        <label className="label">Marca</label>
        <input
          type="text"
          value={marca ? marca.nome : marcaQ}
          onChange={(e) => { setMarca(null); setMarcaQ(e.target.value); setModelo(null); setAnos([]); }}
          placeholder="digite pra buscar (ex: BYD, Fiat, Honda...)"
          className="input"
        />
        {!marca && marcas.length > 0 && (
          <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-loog-border bg-loog-bg">
            {marcas.slice(0, 20).map((m) => (
              <button
                key={m.codigo} type="button"
                onClick={() => { setMarca(m); setMarcaQ(""); setModelo(null); setAnos([]); }}
                className="block w-full px-3 py-1.5 text-left text-xs text-white hover:bg-loog-brand/20"
              >{m.nome}</button>
            ))}
          </div>
        )}
      </div>

      {/* Modelo (habilita após marca) */}
      <div>
        <label className="label">Modelo</label>
        <input
          type="text"
          value={modelo ? modelo.nome : modeloQ}
          onChange={(e) => { setModelo(null); setModeloQ(e.target.value); setAnos([]); }}
          disabled={!marca}
          placeholder={marca ? "digite pra filtrar..." : "selecione a marca primeiro"}
          className="input disabled:opacity-40"
        />
        {marca && !modelo && modelos.length > 0 && (
          <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-loog-border bg-loog-bg">
            {modelos.slice(0, 30).map((m) => (
              <button
                key={m.codigo} type="button"
                onClick={() => { setModelo(m); setModeloQ(""); }}
                className="block w-full px-3 py-1.5 text-left text-xs text-white hover:bg-loog-brand/20"
              >{m.nome}</button>
            ))}
          </div>
        )}
      </div>

      {/* Ano + FIPE */}
      {modelo && (
        <div>
          <label className="label">Ano / Versão (buscando FIPE em tempo real)</label>
          {loadingFipe ? (
            <div className="rounded-lg border border-dashed border-loog-border p-3 text-xs text-loog-muted">
              Consultando tabela FIPE…
            </div>
          ) : anos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
              FIPE não devolveu anos pra esse modelo.
            </div>
          ) : (
            <div className="max-h-48 overflow-auto rounded-lg border border-loog-border bg-loog-bg">
              {anos.map((a) => (
                <button
                  key={a.codigo} type="button"
                  onClick={() => setAno(a)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${ano?.codigo === a.codigo ? "bg-loog-brand/30 text-white" : "text-loog-muted hover:bg-loog-brand/10"}`}
                >
                  <span><b className="text-white">{a.ano_modelo}</b> · {a.combustivel}</span>
                  <span className="font-mono text-emerald-300">{a.valor_formatted}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Override tipo (manual) */}
      {ano && tipoFipe === "carros" && (
        <div className="rounded-lg border border-loog-border bg-loog-panel/40 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-loog-muted mb-1">Tipo pra cotação (auto-detectado)</div>
          <div className="grid grid-cols-3 gap-1">
            {(["carro", "utilitario", "eletrico"] as const).map((tv) => (
              <button
                key={tv} type="button"
                onClick={() => setTipoVeiculoOverride(tv)}
                className={`rounded px-2 py-1 text-[10px] font-semibold transition ${
                  (tipoVeiculoOverride ?? resolveTipoVeiculo()) === tv
                    ? "bg-loog-brand text-white"
                    : "text-loog-muted hover:text-white"
                }`}
              >{tv === "eletrico" ? "⚡ Elétrico" : tv === "utilitario" ? "🛻 Pickup/Diesel" : "🚗 Carro"}</button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canCotar || loading}
        onClick={submit}
        className="btn-primary w-full !py-2 disabled:opacity-50"
      >
        {loading ? "Gerando cotação…" : "🆕 Gerar cotação 0 km"}
      </button>
    </div>
  );
}
