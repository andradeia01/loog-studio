"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/errors/api-fetch";

interface Credential {
  user_id: string;
  sivis_login: string;
  last_login_test_at: string | null;
  last_login_test_ok: boolean | null;
  last_login_test_error: string | null;
  created_at: string;
  updated_at: string;
}

interface TestResult {
  ok: boolean;
  consultorNome?: string | null;
  consultorId?: string | null;
  error?: string;
}

export function SivisCredentialsForm() {
  const [cred, setCred] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/sivis/credentials");
      const data = await r.json();
      if (r.ok) {
        setCred(data.credential);
        if (data.credential) setLogin(data.credential.sivis_login);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const salvar = useCallback(async () => {
    if (!login.trim() || !password) {
      setNotice("Preenche login + senha");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const r = await apiFetch("/api/sivis/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sivis_login: login.trim(), sivis_password: password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
      setPassword("");
      setNotice("Credenciais salvas (senha criptografada no server).");
      setTestResult(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }, [login, password, load]);

  const testar = useCallback(async (useTyped: boolean) => {
    setTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, string> = {};
      if (useTyped) {
        body.sivis_login = login.trim();
        body.sivis_password = password;
      }
      const r = await apiFetch("/api/sivis/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      setTestResult(data);
      await load();
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : "Falha" });
    } finally {
      setTesting(false);
    }
  }, [login, password, load]);

  const remover = useCallback(async () => {
    if (!confirm("Remover credenciais SIVIS? Sync pro SIVIS vai parar até você reconfigurar.")) return;
    try {
      const r = await apiFetch("/api/sivis/credentials", { method: "DELETE" });
      if (!r.ok) throw new Error("Falha");
      setCred(null);
      setLogin("");
      setPassword("");
      setTestResult(null);
      setNotice("Removida.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    }
  }, []);

  if (loading) return <div className="p-6 text-center text-loog-muted">Carregando…</div>;

  const inputCls = "w-full rounded-xl border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white placeholder:text-loog-muted outline-none focus:border-loog-brand";

  return (
    <div className="space-y-5 max-w-xl">
      <div className="rounded-2xl border border-loog-border bg-loog-panel p-5">
        <h2 className="font-display text-lg font-bold text-white">Credenciais SIVIS</h2>
        <p className="mt-1 text-sm text-loog-muted">
          Suas credenciais ficam criptografadas (AES-256-GCM) no server e são usadas <strong>só pelo worker de sync</strong>
          pra espelhar seus leads invisivelmente no SIVIS. A senha nunca aparece em nenhum lugar depois de salva.
        </p>

        {cred && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">
            ✓ Credencial configurada: <strong>{cred.sivis_login}</strong>
            <div className="text-xs text-emerald-200/70 mt-1">
              Atualizada em {new Date(cred.updated_at).toLocaleString("pt-BR")}
            </div>
            {cred.last_login_test_ok === true && (
              <div className="text-xs mt-2">
                🟢 Último teste OK em {new Date(cred.last_login_test_at!).toLocaleString("pt-BR")}
              </div>
            )}
            {cred.last_login_test_ok === false && (
              <div className="text-xs mt-2 text-rose-200">
                🔴 Último teste FALHOU: {cred.last_login_test_error}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-white">Login SIVIS (email)</span>
            <input
              type="email"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="voce@email.com"
              className={inputCls + " mt-1"}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-white">
              Senha SIVIS <span className="font-normal text-xs text-loog-muted">{cred ? "(só pra atualizar)" : ""}</span>
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={cred ? "••••••••  (não enviado se vazio)" : "••••••••"}
              autoComplete="new-password"
              className={inputCls + " mt-1"}
            />
          </label>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={salvar}
              disabled={saving || !login.trim() || !password}
              className="rounded-xl bg-loog-brand px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-loog-brand/20 transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Salvando…" : cred ? "Atualizar senha" : "Salvar credenciais"}
            </button>
            <button
              type="button"
              onClick={() => testar(!!password)}
              disabled={testing || (!cred && !password)}
              className="rounded-xl border border-loog-border bg-loog-panel px-4 py-2 text-sm font-semibold text-white hover:border-loog-brand/40 disabled:opacity-50"
              title={password ? "Testa os valores digitados sem salvar" : "Testa a credencial salva"}
            >
              {testing ? "Testando…" : "🔌 Testar conexão SIVIS"}
            </button>
            {cred && (
              <button
                type="button"
                onClick={remover}
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 ml-auto"
              >
                Remover
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div className="mt-3 rounded-lg border border-loog-border bg-loog-bg p-3 text-sm text-white">{notice}</div>
        )}

        {testResult && (
          <div className={
            "mt-3 rounded-xl border p-3 text-sm " +
            (testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/5 text-rose-200")
          }>
            {testResult.ok ? (
              <>
                🟢 Login OK no SIVIS
                {testResult.consultorNome && <> — autenticado como <strong>{testResult.consultorNome}</strong></>}
                {testResult.consultorId && <> (id {testResult.consultorId})</>}
              </>
            ) : (
              <>🔴 Login falhou: {testResult.error}</>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200">
        🔒 <strong>Segurança:</strong> sua senha é criptografada antes de ser salva com AES-256-GCM.
        A chave de criptografia fica em variável de ambiente no servidor LOOG, nunca é armazenada junto da senha.
        Só o worker de sync descriptografa em memória (nunca escreve a senha em claro em lugar nenhum).
      </div>
    </div>
  );
}
