"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/errors/api-fetch";

export type BlockRow = {
  id: string;
  tipo: "carros" | "motos" | "caminhoes";
  marca_codigo: string;
  marca_nome: string;
  modelo_codigo: string | null;
  modelo_nome: string | null;
  motivo: string | null;
  ativo: boolean;
  created_at: string;
};

interface FipeMarca { codigo: string; nome: string }
interface FipeModelo { codigo: string; nome: string; marca_codigo: string; marca_nome: string }

const TIPO_LABEL: Record<string, string> = { carros: "🚗 Carros", motos: "🏍️ Motos", caminhoes: "🚛 Caminhões" };

export function BlocksManager({ initial }: { initial: BlockRow[] }) {
  const [blocks, setBlocks] = useState<BlockRow[]>(initial);
  const [tipo, setTipo] = useState<"carros" | "motos" | "caminhoes">("carros");
  const [marcaQ, setMarcaQ] = useState("");
  const [marcas, setMarcas] = useState<FipeMarca[]>([]);
  const [marcaSelecionada, setMarcaSelecionada] = useState<FipeMarca | null>(null);
  const [modeloQ, setModeloQ] = useState("");
  const [modelos, setModelos] = useState<FipeModelo[]>([]);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Debounced search de marcas
  useEffect(() => {
    const t = setTimeout(async () => {
      const url = `/api/admin/fipe-catalog?tipo=${tipo}` + (marcaQ ? `&q=${encodeURIComponent(marcaQ)}` : "");
      try {
        const r = await apiFetch(url);
        const j = await r.json();
        setMarcas(j.marcas ?? []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [tipo, marcaQ]);

  // Carrega modelos quando marca selecionada muda
  useEffect(() => {
    if (!marcaSelecionada) { setModelos([]); return; }
    const t = setTimeout(async () => {
      const url = `/api/admin/fipe-catalog?tipo=${tipo}&marca=${marcaSelecionada.codigo}` + (modeloQ ? `&q=${encodeURIComponent(modeloQ)}` : "");
      try {
        const r = await apiFetch(url);
        const j = await r.json();
        setModelos(j.modelos ?? []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [tipo, marcaSelecionada, modeloQ]);

  const criarBloqueioMarca = async () => {
    if (!marcaSelecionada) { setMsg("Selecione uma marca"); return; }
    setSalvando(true); setMsg(null);
    try {
      const r = await apiFetch("/api/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          marca_codigo: marcaSelecionada.codigo,
          marca_nome: marcaSelecionada.nome,
          motivo: motivo || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? "Erro");
      setBlocks((prev) => [j.block as BlockRow, ...prev]);
      setMsg(`✅ Marca ${marcaSelecionada.nome} bloqueada.`);
      setMarcaSelecionada(null); setMarcaQ(""); setMotivo("");
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : "Erro"}`);
    } finally { setSalvando(false); }
  };

  const criarBloqueioModelo = async (modelo: FipeModelo) => {
    if (!marcaSelecionada) return;
    setSalvando(true); setMsg(null);
    try {
      const r = await apiFetch("/api/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          marca_codigo: marcaSelecionada.codigo,
          marca_nome: marcaSelecionada.nome,
          modelo_codigo: modelo.codigo,
          modelo_nome: modelo.nome,
          motivo: motivo || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? "Erro");
      setBlocks((prev) => [j.block as BlockRow, ...prev]);
      setMsg(`✅ ${modelo.nome} bloqueado.`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : "Erro"}`);
    } finally { setSalvando(false); }
  };

  const toggleAtivo = async (b: BlockRow) => {
    try {
      const r = await apiFetch(`/api/admin/blocks/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !b.ativo }),
      });
      const j = await r.json();
      if (!r.ok) return;
      setBlocks((prev) => prev.map((x) => (x.id === b.id ? (j.block as BlockRow) : x)));
    } catch {}
  };

  const deletar = async (b: BlockRow) => {
    if (!confirm(`Remover bloqueio de ${b.marca_nome}${b.modelo_nome ? " / " + b.modelo_nome : ""}?`)) return;
    try {
      const r = await apiFetch(`/api/admin/blocks/${b.id}`, { method: "DELETE" });
      if (!r.ok) return;
      setBlocks((prev) => prev.filter((x) => x.id !== b.id));
    } catch {}
  };

  const grupos = useMemo(() => {
    const map = new Map<string, BlockRow[]>();
    for (const b of blocks) {
      const key = b.tipo;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [blocks]);

  const ativos = blocks.filter((b) => b.ativo).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* COLUNA ESQUERDA — form novo bloqueio + lista */}
      <div className="space-y-6">
        <div className="rounded-xl border border-loog-border bg-loog-panel p-4">
          <h2 className="font-display text-lg font-bold">➕ Novo bloqueio</h2>
          <p className="mt-1 text-xs text-loog-muted">
            Escolha o tipo, busque a marca, e bloqueie a <b>marca inteira</b> ou um <b>modelo específico</b>.
          </p>

          <div className="mt-4 flex gap-2">
            {(["carros", "motos", "caminhoes"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTipo(t); setMarcaSelecionada(null); setMarcaQ(""); }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${tipo === t ? "bg-loog-brand text-white" : "border border-loog-border text-loog-muted hover:text-white"}`}
              >
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-loog-muted">Marca</label>
              <input
                type="text"
                value={marcaSelecionada ? marcaSelecionada.nome : marcaQ}
                onChange={(e) => { setMarcaSelecionada(null); setMarcaQ(e.target.value); }}
                placeholder="digita pra buscar..."
                className="mt-1 w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
              />
              {!marcaSelecionada && marcas.length > 0 && (
                <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-loog-border bg-loog-bg">
                  {marcas.map((m) => (
                    <button
                      key={m.codigo}
                      type="button"
                      onClick={() => { setMarcaSelecionada(m); setMarcaQ(""); }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-white hover:bg-loog-brand/20"
                    >
                      {m.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-loog-muted">Modelo (opcional)</label>
              <input
                type="text"
                value={modeloQ}
                onChange={(e) => setModeloQ(e.target.value)}
                placeholder="busca modelo específico..."
                disabled={!marcaSelecionada}
                className="mt-1 w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white disabled:opacity-40"
              />
              {marcaSelecionada && modelos.length > 0 && (
                <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-loog-border bg-loog-bg">
                  {modelos.map((m) => (
                    <button
                      key={m.codigo}
                      type="button"
                      onClick={() => criarBloqueioModelo(m)}
                      disabled={salvando}
                      className="block w-full px-3 py-1.5 text-left text-xs text-white hover:bg-red-500/20"
                    >
                      🚫 {m.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-loog-muted">Motivo (opcional)</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex: preço alto, sinistro frequente, política LOOG..."
              className="mt-1 w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={!marcaSelecionada || salvando}
              onClick={criarBloqueioMarca}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              🚫 Bloquear MARCA INTEIRA
            </button>
            <span className="text-[10px] text-loog-muted">— ou clique num modelo acima pra bloquear só ele</span>
          </div>

          {msg && <p className="mt-3 text-sm text-amber-300">{msg}</p>}
        </div>

        {/* Lista agrupada */}
        {grupos.map(([t, items]) => (
          <section key={t}>
            <h3 className="mb-2 text-sm font-semibold text-loog-muted">
              {TIPO_LABEL[t]} <span className="ml-1 rounded bg-loog-panel px-2 py-0.5 text-[10px]">{items.length}</span>
            </h3>
            <ul className="space-y-2">
              {items.map((b) => (
                <li
                  key={b.id}
                  className={`flex items-center justify-between rounded-xl border p-3 ${b.ativo ? "border-red-500/40 bg-red-500/10" : "border-loog-border/60 bg-loog-panel/40 opacity-60"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold text-white">
                        {b.marca_nome}
                      </span>
                      {b.modelo_nome && <span className="text-sm text-white/70">· {b.modelo_nome}</span>}
                      {!b.modelo_nome && <span className="rounded bg-red-600/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">MARCA INTEIRA</span>}
                    </div>
                    {b.motivo && <div className="mt-1 text-[11px] italic text-loog-muted">💬 {b.motivo}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => toggleAtivo(b)} className="text-[10px] text-loog-muted hover:text-white">
                      {b.ativo ? "pausar" : "ativar"}
                    </button>
                    <button type="button" onClick={() => deletar(b)} className="rounded px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/20">
                      remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {blocks.length === 0 && (
          <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
            Nenhum bloqueio criado ainda. Use o formulário acima pra começar.
          </div>
        )}
      </div>

      {/* COLUNA DIREITA — stats */}
      <aside className="space-y-3">
        <div className="rounded-xl border border-loog-brand/40 bg-loog-brand/10 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">Bloqueios ativos</div>
          <div className="mt-1 font-display text-3xl font-bold text-white">{ativos}</div>
        </div>
        <div className="rounded-xl border border-loog-border bg-loog-panel p-4 text-xs text-loog-muted">
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white">Como funciona</h4>
          <ul className="space-y-1.5">
            <li>• Catálogo FIPE pré-carregado (108 marcas carro + 103 moto + 29 caminhão + 11.4k modelos)</li>
            <li>• Bloqueio de <b>marca inteira</b> rejeita toda cotação da marca</li>
            <li>• Bloqueio de <b>modelo</b> rejeita só aquele modelo específico</li>
            <li>• O cotador consulta esta tabela antes de calcular — se bate, devolve erro ao consultor</li>
            <li>• <i>Pausar</i> desativa temporariamente sem apagar o histórico</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
