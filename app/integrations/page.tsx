"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  connected: boolean;
  expires_at?: string;
  token_expired?: boolean;
}

const PERIODS = [
  { label: "Este mês", days: 30 },
  { label: "Últimos 90 dias", days: 90 },
  { label: "Últimos 6 meses", days: 180 },
  { label: "Este ano", days: 365 },
];

function dateRange(days: number): { data_inicio: string; data_fim: string } {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - days);
  return {
    data_inicio: inicio.toISOString().slice(0, 10),
    data_fim: fim.toISOString().slice(0, 10),
  };
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(1); // Últimos 90 dias

  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;

  useEffect(() => {
    if (params?.get("connected") === "1") {
      setMessage("Conta Azul conectada com sucesso!");
    } else if (params?.get("error")) {
      setMessage(`Erro ao conectar: ${params.get("error")}`);
    }
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/conta-azul/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/conta-azul/refresh", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setMessage(`Erro ao renovar token: ${data.error}`);
      } else {
        setMessage("Token renovado com sucesso!");
        fetchStatus();
      }
    } catch {
      setMessage("Erro ao renovar token.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSyncItems() {
    setSyncing(true);
    setMessage(null);
    let total = 0;
    let offset = 0;
    let hasMore = true;
    let totalSales = 0;
    try {
      while (hasMore && offset < 2000) {
        setSyncStep(`Sincronizando itens... (${offset}${totalSales ? `/${totalSales}` : ""} vendas)`);
        const res = await fetch("/api/sync/sale-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset }),
        });
        const data = await res.json();
        if (data.error) { setMessage(`Erro: ${data.error}`); return; }
        total += data.records ?? 0;
        hasMore = data.hasMore ?? false;
        if (data.total) totalSales = data.total;
        offset = data.nextOffset ?? offset + 8;
      }
      setMessage(`Itens sincronizados: ${total} itens em ${offset} vendas`);
    } catch {
      setMessage("Erro ao sincronizar itens.");
    } finally {
      setSyncing(false);
      setSyncStep(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    const results: Record<string, number | string> = {};
    const period = dateRange(PERIODS[selectedPeriod].days);

    try {
      // Clientes
      setSyncStep("Sincronizando clientes...");
      const resC = await fetch("/api/sync/customers", { method: "POST" });
      const dataC = await resC.json();
      if (dataC.error) { setMessage(`Erro em clientes: ${dataC.error}`); return; }
      results.customers = dataC.records ?? 0;

      // Produtos
      setSyncStep("Sincronizando produtos...");
      const resP = await fetch("/api/sync/products", { method: "POST" });
      const dataP = await resP.json();
      if (dataP.error) { setMessage(`Erro em produtos: ${dataP.error}`); return; }
      results.products = dataP.records ?? 0;

      // Vendas (sem itens, rápido)
      setSyncStep(`Sincronizando vendas (${PERIODS[selectedPeriod].label.toLowerCase()})...`);
      const resS = await fetch("/api/sync/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(period),
      });
      const dataS = await resS.json();
      if (dataS.error) { setMessage(`Erro em vendas: ${dataS.error}`); return; }
      results.sales = dataS.records ?? 0;

      // Categorias dos produtos
      setSyncStep("Sincronizando categorias dos produtos...");
      let hasMoreCat = true;
      let catBatch = 0;
      while (hasMoreCat && catBatch < 40) {
        const resC = await fetch("/api/sync/product-categories", { method: "POST" });
        const dataC = await resC.json();
        if (dataC.error) break;
        hasMoreCat = dataC.hasMore ?? false;
        catBatch++;
      }

      // Itens das vendas — por offset progressivo
      let totalItems = 0;
      let itemOffset = 0;
      let hasMoreItems = true;
      while (hasMoreItems && itemOffset < 2000) {
        setSyncStep(`Sincronizando itens... (${itemOffset}/${Number(results.sales)} vendas)`);
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
      }
      results.items = totalItems;

      setMessage(
        `Sync concluído! Clientes: ${results.customers}, Produtos: ${results.products}, Vendas: ${results.sales}, Itens: ${results.items}`
      );
    } catch {
      setMessage("Erro durante o sync.");
    } finally {
      setSyncing(false);
      setSyncStep(null);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Integrações</h1>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded text-sm ${
            message.includes("Erro")
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}
        >
          {message}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Conta Azul</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Integração via OAuth 2.0
            </p>
          </div>
          {loadingStatus ? (
            <span className="text-xs text-gray-400">Verificando...</span>
          ) : status?.connected ? (
            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 text-xs font-medium px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />
              Desconectado
            </span>
          )}
        </div>

        {status?.connected && (
          <div className="mb-4 text-sm text-gray-600 space-y-1">
            <p>
              <span className="font-medium">Token expira em:</span>{" "}
              {formatDate(status.expires_at)}
            </p>
            {status.token_expired && (
              <p className="text-orange-600 font-medium">
                ⚠ Token expirado — renove antes de sincronizar.
              </p>
            )}
          </div>
        )}

        {status?.connected && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Período das vendas
            </label>
            <div className="flex gap-2 flex-wrap">
              {PERIODS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPeriod(i)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    selectedPeriod === i
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {!status?.connected && (
            <a
              href="/api/conta-azul/connect"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              Conectar Conta Azul
            </a>
          )}

          {status?.connected && (
            <>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded transition-colors disabled:opacity-50"
              >
                {refreshing ? "Renovando..." : "Renovar Token"}
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors disabled:opacity-50"
              >
                {syncing ? (syncStep ?? "Sincronizando...") : "Sincronizar Dados"}
              </button>
              <button
                onClick={handleSyncItems}
                disabled={syncing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors disabled:opacity-50"
                title="Sincroniza os itens de todas as vendas (necessário para o Ranking de Clientes)"
              >
                {syncing ? (syncStep ?? "...") : "Sincronizar Itens"}
              </button>
              <a
                href="/api/conta-azul/connect"
                className="inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded transition-colors"
              >
                Reconectar
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
