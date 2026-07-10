"use client";

import { useEffect, useState } from "react";

interface Kpis {
  totalVendas: number;
  receitaTotal: number;
  ticketMedio: number;
  totalClientes: number;
}

interface SalesByMonth {
  mes: string;
  total: number;
  count: number;
}

interface ClienteRanking {
  name: string;
  total: number;
  count: number;
}

interface DashboardData {
  kpis: Kpis;
  salesByMonth: SalesByMonth[];
  rankingClientes: ClienteRanking[];
}

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function mesLabel(mes: string) {
  const [year, month] = mes.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

export default function DashboardPage() {
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const mesAtualYM = `${brNow.getUTCFullYear()}-${String(brNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const [mesSel, setMesSel] = useState(mesAtualYM);
  const [modoAno, setModoAno] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function buildUrl(ms: string, ano: boolean) {
    if (ano) return `/api/dashboard?periodo=ano`;
    const [y, m] = ms.split("-").map(Number);
    const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
    const fim = new Date(y, m, 0).toISOString().slice(0, 10);
    return `/api/dashboard?periodo=custom&inicio=${inicio}&fim=${fim}`;
  }

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(buildUrl(mesSel, modoAno))
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Erro ao carregar dados."))
      .finally(() => setLoading(false));
  }, [mesSel, modoAno]);

  const mesSelLabel = new Date(
    Number(mesSel.split("-")[0]), Number(mesSel.split("-")[1]) - 1, 1
  ).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  const periodoLabel = modoAno ? `Este ano (${brNow.getUTCFullYear()})` : mesSelLabel;

  return (
    <div className="space-y-6">
      {/* Header + filtros */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-1">dados do Conta Azul</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <button onClick={() => {
              setModoAno(false);
              const [y, m] = mesSel.split("-").map(Number);
              const d = new Date(y, m - 2, 1);
              setMesSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
            }} className="px-3 py-2 text-gray-500 hover:bg-gray-100 transition-colors text-lg font-light">‹</button>
            <button onClick={() => setModoAno(false)}
              className={`px-3 py-2 text-sm font-medium min-w-[130px] text-center capitalize transition-colors ${modoAno ? "text-gray-400" : "text-gray-800"}`}>
              {mesSelLabel}
            </button>
            <button onClick={() => {
              setModoAno(false);
              const [y, m] = mesSel.split("-").map(Number);
              const d = new Date(y, m, 1);
              const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              if (next <= mesAtualYM) setMesSel(next);
            }} className={`px-3 py-2 text-lg font-light transition-colors ${!modoAno && mesSel >= mesAtualYM ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-100"}`}>›</button>
          </div>
          <button onClick={() => setModoAno(a => !a)}
            className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors ${modoAno ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
            Este ano
          </button>
        </div>
      </div>



      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
          Carregando...
        </div>
      )}

      {!loading && (error || !data) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error ?? "Sem dados. Faça a sincronização primeiro."}
        </div>
      )}

      {!loading && data && (() => {
        const { kpis, salesByMonth, rankingClientes } = data;
        const maxMonthTotal = Math.max(...salesByMonth.map((m) => m.total), 1);

        return (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard label="Vendas" value={kpis.totalVendas.toLocaleString("pt-BR")} sub={periodoLabel.toLowerCase()} />
              <KpiCard label="Receita" value={fmt(kpis.receitaTotal)} sub={periodoLabel.toLowerCase()} highlight />
              <KpiCard label="Ticket médio" value={fmt(kpis.ticketMedio)} sub="por venda" />
              <KpiCard label="Clientes atendidos" value={kpis.totalClientes.toLocaleString("pt-BR")} sub={periodoLabel.toLowerCase()} />
            </div>

            {/* Gráfico */}
            {salesByMonth.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Receita por período</h2>
                <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height: "160px" }}>
                  {salesByMonth.map((m) => {
                    const pct = (m.total / maxMonthTotal) * 100;
                    return (
                      <div key={m.mes} className="flex flex-col items-center shrink-0 gap-1" style={{ minWidth: "36px" }}>
                        <div className="w-full flex items-end justify-center" style={{ height: "120px" }}>
                          <div
                            className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-default"
                            style={{ height: `${pct}%`, minHeight: "2px" }}
                            title={`${mesLabel(m.mes)}: ${fmt(m.total)} (${m.count} vendas)`}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 text-center leading-tight">
                          {mesLabel(m.mes)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ranking clientes */}
            {rankingClientes.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Top 10 clientes · {periodoLabel.toLowerCase()}
                </h2>
                <div className="space-y-3">
                  {rankingClientes.map((c, i) => {
                    const pct = (c.total / rankingClientes[0].total) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-4 text-right shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-700 truncate">{c.name}</span>
                            <span className="text-sm font-medium text-gray-800 ml-2 shrink-0">
                              {fmt(c.total)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{c.count}x</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

function KpiCard({ label, value, sub, highlight }: {
  label: string; value: string; sub: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200"}`}>
      <p className={`text-xs font-medium mb-1 ${highlight ? "text-blue-100" : "text-gray-500"}`}>{label}</p>
      <p className={`text-xl font-bold ${highlight ? "text-white" : "text-gray-800"}`}>{value}</p>
      <p className={`text-xs mt-0.5 ${highlight ? "text-blue-200" : "text-gray-400"}`}>{sub}</p>
    </div>
  );
}
