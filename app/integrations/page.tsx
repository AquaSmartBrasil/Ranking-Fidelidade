"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  connected: boolean;
  expires_at?: string;
  token_expired?: boolean;
  lastSync?: string | null;
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ step: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") setMessage("Conta Azul conectada com sucesso!");
    else if (params.get("error")) setMessage(`Erro ao conectar: ${params.get("error")}`);
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/conta-azul/status");
      setStatus(await res.json());
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    setSyncProgress(null);

    const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hoje = brNow.toISOString().slice(0, 10);
    const inicioAno = `${brNow.getUTCFullYear()}-01-01`;

    try {
      // Descobrir data da última venda já salva
      const resLast = await fetch("/api/sync/last-date");
      const dataLast = await resLast.json();
      const ultimaData: string | null = dataLast.lastDate ?? null;
      const isFirstSync = !ultimaData || ultimaData < inicioAno;

      // Início: se já tem dados, sincroniza só os últimos 3 dias; senão, o ano inteiro
      let dataInicio: string;
      if (isFirstSync) {
        dataInicio = inicioAno;
      } else {
        const d = new Date(ultimaData);
        d.setDate(d.getDate() - 3);
        dataInicio = d.toISOString().slice(0, 10);
      }

      // 1. Clientes
      setSyncStep("Sincronizando clientes...");
      await fetch("/api/sync/customers", { method: "POST" });

      // 2. Produtos + Categorias
      setSyncStep("Sincronizando produtos...");
      await fetch("/api/sync/products", { method: "POST" });
      let hasMoreCat = true, catBatch = 0;
      while (hasMoreCat && catBatch < 40) {
        const r = await fetch("/api/sync/product-categories", { method: "POST" });
        const d = await r.json();
        hasMoreCat = d.hasMore ?? false;
        catBatch++;
      }

      // 3. Vendas
      setSyncStep(isFirstSync
        ? `1ª sincronização — buscando vendas de ${dataInicio} até hoje...`
        : `Atualizando vendas desde ${dataInicio}...`);
      const resS = await fetch("/api/sync/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_inicio: dataInicio, data_fim: hoje }),
      });
      const dataS = await resS.json();
      if (dataS.error) { setMessage(`Erro em vendas: ${dataS.error}`); return; }
      const totalVendas = dataS.records ?? 0;

      // 4. Itens (só vendas ainda sem itens)
      let totalItems = 0, itemOffset = 0, hasMoreItems = true;
      while (hasMoreItems && itemOffset < 5000) {
        setSyncStep(`Sincronizando detalhes... (${itemOffset}/${totalVendas} vendas)`);
        setSyncProgress({ step: itemOffset, total: Math.max(totalVendas, 1) });
        const resI = await fetch("/api/sync/sale-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset: itemOffset }),
        });
        const dataI = await resI.json();
        if (dataI.error) break;
        totalItems += dataI.records ?? 0;
        hasMoreItems = dataI.hasMore ?? false;
        itemOffset = dataI.nextOffset ?? itemOffset + 8;
        if (!hasMoreItems) break;
      }

      const msg = isFirstSync
        ? `Primeiro sync completo! ${totalVendas} vendas importadas desde ${inicioAno}.`
        : `Atualizado! ${totalVendas} vendas verificadas desde ${dataInicio}.`;
      setMessage(msg);
      fetchStatus();
    } catch {
      setMessage("Erro durante a sincronização. Tente novamente.");
    } finally {
      setSyncing(false);
      setSyncStep(null);
      setSyncProgress(null);
    }
  }

  function formatDate(iso?: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR");
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Integrações</h1>
      <p className="text-sm text-gray-500 mb-6">Conexão com o Conta Azul ERP</p>

      {message && (
        <div className={`mb-5 px-4 py-3 rounded-lg text-sm ${message.includes("Erro") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Conta Azul</h2>
            <p className="text-xs text-gray-400 mt-0.5">OAuth 2.0</p>
          </div>
          {loadingStatus ? (
            <span className="text-xs text-gray-400">Verificando...</span>
          ) : status?.connected ? (
            <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-600 text-xs font-medium px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-red-400 rounded-full" />
              Desconectado
            </span>
          )}
        </div>

        {status?.connected && (
          <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-4">
            <div>Token expira em: <span className="font-medium text-gray-700">{formatDate(status.expires_at)}</span></div>
            {status.token_expired && (
              <div className="text-orange-600 font-medium">⚠ Token expirado — clique em Reconectar.</div>
            )}
          </div>
        )}

        {/* Botões */}
        <div className="flex flex-col gap-3">
          {!status?.connected ? (
            <a href="/api/conta-azul/connect"
              className="text-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-3 rounded-lg transition-colors">
              Conectar Conta Azul
            </a>
          ) : (
            <>
              <button onClick={handleSync} disabled={syncing}
                className="relative bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-5 py-3 rounded-lg transition-colors text-sm">
                {syncing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    {syncStep ?? "Sincronizando..."}
                  </span>
                ) : "Sincronizar"}
              </button>

              {/* Barra de progresso dos itens */}
              {syncing && syncProgress && syncProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.round((syncProgress.step / syncProgress.total) * 100))}%` }} />
                  </div>
                  <div className="text-xs text-gray-400 text-right">
                    {syncProgress.step} / {syncProgress.total} vendas
                  </div>
                </div>
              )}

              <a href="/api/conta-azul/connect"
                className="text-center text-xs text-gray-500 hover:text-gray-700 underline">
                Reconectar / Renovar acesso
              </a>
            </>
          )}
        </div>

        {/* Info sobre o que sincroniza */}
        {status?.connected && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1 border border-gray-100">
            <div className="font-medium text-gray-600 mb-1">O que é sincronizado:</div>
            <div>✓ Clientes e produtos</div>
            <div>✓ Vendas desde 1° de janeiro até hoje</div>
            <div>✓ Itens de cada venda (para ranking por linha de produto)</div>
          </div>
        )}
      </div>
    </div>
  );
}
