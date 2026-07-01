"use client";

import { useEffect, useState, useMemo } from "react";

interface RankingCliente {
  id: string;
  name: string;
  value: number;
  purchases: number;
  lines: number[];
  lineCount: number;
  prevValue: number;
  growth: number;
  score: number;
  level: string;
  levelColor: string;
  nextLevel: string | null;
  nextLevelColor: string | null;
  pointsToNext: number;
  progressPct: number;
  actions?: string[];
}

interface RankingData {
  mes: string;
  ranking: RankingCliente[];
  levelCounts: Record<string, number>;
  totalAtivos: number;
  inactivos: { id: string; name: string; prevValue: number }[];
}

const LEVEL_CONFIG: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  Bronze:   { bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-300",  badge: "bg-amber-100 text-amber-800" },
  Silver:   { bg: "bg-gray-50",    text: "text-gray-600",   border: "border-gray-300",   badge: "bg-gray-200 text-gray-700" },
  Gold:     { bg: "bg-yellow-50",  text: "text-yellow-700", border: "border-yellow-300", badge: "bg-yellow-100 text-yellow-800" },
  Platinum: { bg: "bg-purple-50",  text: "text-purple-700", border: "border-purple-300", badge: "bg-purple-100 text-purple-800" },
  Diamante: { bg: "bg-cyan-50",    text: "text-cyan-700",   border: "border-cyan-300",   badge: "bg-cyan-100 text-cyan-800" },
};

const LINES = [
  { id: 1, label: "Congelados", short: "C", active: "bg-blue-500 text-white", inactive: "bg-gray-100 text-gray-300 line-through" },
  { id: 2, label: "Peixes",     short: "P", active: "bg-emerald-500 text-white", inactive: "bg-gray-100 text-gray-300 line-through" },
  { id: 3, label: "Microvida",  short: "M", active: "bg-violet-500 text-white", inactive: "bg-gray-100 text-gray-300 line-through" },
];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function mesOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ val, label });
  }
  return opts;
}

export default function RankingPage() {
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterLevel, setFilterLevel] = useState("Todos");
  const [filterLine, setFilterLine] = useState(0);
  const [tab, setTab] = useState<"ranking" | "oportunidades" | "inativos">("ranking");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ranking?mes=${mes}`)
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [mes]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.ranking.filter(c => {
      if (filterLevel !== "Todos" && c.level !== filterLevel) return false;
      if (filterLine > 0 && !c.lines.includes(filterLine)) return false;
      return true;
    });
  }, [data, filterLevel, filterLine]);

  const opportunities = useMemo(() => {
    if (!data) return [];
    return data.ranking.filter(c =>
      c.lineCount < 3 || (c.pointsToNext > 0 && c.pointsToNext <= 30) || c.growth < 0
    ).map(c => {
      const actions: string[] = [];
      if (c.lineCount < 3) {
        if (!c.lines.includes(1)) actions.push("Oferecer linha de congelados");
        if (!c.lines.includes(2)) actions.push("Oferecer peixes ornamentais");
        if (!c.lines.includes(3)) actions.push("Oferecer microvida / plâncton");
      }
      if (c.pointsToNext > 0 && c.pointsToNext <= 30) actions.push(`${c.pointsToNext} pts para ${c.nextLevel} ↑`);
      if (c.growth < 0) actions.push("Queda de compra — fazer reposição");
      return { ...c, actions };
    }).slice(0, 30);
  }, [data]);

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Carregando ranking...</div>;
  if (!data) return <div className="text-red-600 text-sm">Erro ao carregar dados.</div>;

  const levels = ["Bronze", "Silver", "Gold", "Platinum", "Diamante"];
  const meses = mesOptions();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ranking de Clientes</h1>
          <p className="text-xs text-gray-400 mt-1">Gamificação da carteira · pontuação mensal</p>
        </div>
        <select
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
        >
          {meses.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
      </div>

      {/* Cards de resumo por nível */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Ativos no mês</p>
          <p className="text-2xl font-bold text-gray-800">{data.totalAtivos}</p>
        </div>
        {levels.map(l => {
          const cfg = LEVEL_CONFIG[l];
          return (
            <div key={l} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-4 text-center cursor-pointer transition-opacity ${filterLevel === l ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
              onClick={() => setFilterLevel(filterLevel === l ? "Todos" : l)}>
              <p className={`text-xs font-medium mb-1 ${cfg.text}`}>{l}</p>
              <p className={`text-2xl font-bold ${cfg.text}`}>{data.levelCounts[l] ?? 0}</p>
            </div>
          );
        })}
      </div>

      {/* Regras de pontuação */}
      <details className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <summary className="px-5 py-3 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none flex items-center gap-2">
          <span>📊</span> Como funciona a pontuação?
        </summary>
        <div className="px-5 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gray-100">
          {/* Recorrência */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Recorrência <span className="text-gray-400 font-normal normal-case">(até 40 pts)</span></div>
            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex justify-between"><span>3 meses seguidos</span><span className="font-semibold text-gray-900">40 pts</span></div>
              <div className="flex justify-between"><span>2 meses nos últimos 3</span><span className="font-semibold text-gray-900">25 pts</span></div>
              <div className="flex justify-between"><span>1 mês</span><span className="font-semibold text-gray-900">10 pts</span></div>
            </div>
          </div>
          {/* Mix */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Mix de linhas <span className="text-gray-400 font-normal normal-case">(até 30 pts)</span></div>
            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex justify-between"><span>3 linhas (C + P + M)</span><span className="font-semibold text-gray-900">30 pts</span></div>
              <div className="flex justify-between"><span>2 linhas</span><span className="font-semibold text-gray-900">15 pts</span></div>
              <div className="flex justify-between"><span>1 linha</span><span className="font-semibold text-gray-900">5 pts</span></div>
            </div>
          </div>
          {/* Valor */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Valor no mês <span className="text-gray-400 font-normal normal-case">(até 30 pts)</span></div>
            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex justify-between"><span>Acima de R$ 5.000</span><span className="font-semibold text-gray-900">30 pts</span></div>
              <div className="flex justify-between"><span>R$ 3.001 – R$ 5.000</span><span className="font-semibold text-gray-900">24 pts</span></div>
              <div className="flex justify-between"><span>R$ 1.501 – R$ 3.000</span><span className="font-semibold text-gray-900">18 pts</span></div>
              <div className="flex justify-between"><span>R$ 501 – R$ 1.500</span><span className="font-semibold text-gray-900">10 pts</span></div>
              <div className="flex justify-between"><span>Até R$ 500</span><span className="font-semibold text-gray-900">5 pts</span></div>
            </div>
          </div>
          {/* Inadimplência + Níveis */}
          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold text-red-600 mb-2 uppercase tracking-wide">Inadimplência <span className="text-gray-400 font-normal normal-case text-gray-600">(-15 pts)</span></div>
              <div className="text-xs text-gray-600">Penalidade de 15 pts se houver pendência financeira em aberto.</div>
            </div>
            <div>
              <div className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Níveis</div>
              <div className="space-y-1 text-xs">
                {[
                  { name: "Bronze",   range: "0–24",   color: "bg-amber-100 text-amber-800" },
                  { name: "Silver",   range: "25–49",  color: "bg-gray-200 text-gray-700" },
                  { name: "Gold",     range: "50–69",  color: "bg-yellow-100 text-yellow-800" },
                  { name: "Platinum", range: "70–84",  color: "bg-purple-100 text-purple-800" },
                  { name: "Diamante", range: "85–100", color: "bg-cyan-100 text-cyan-800" },
                ].map(l => (
                  <div key={l.name} className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${l.color}`}>{l.name}</span>
                    <span className="text-gray-500">{l.range} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([["ranking", "Ranking"], ["oportunidades", "Oportunidades"], ["inativos", "Inativos"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
            {key === "inativos" && data.inactivos.length > 0 && (
              <span className="ml-1.5 bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full">{data.inactivos.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Ranking */}
      {tab === "ranking" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">Filtrar:</span>
            <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none">
              <option value="Todos">Todos os níveis</option>
              {levels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={filterLine} onChange={e => setFilterLine(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none">
              <option value={0}>Todas as linhas</option>
              <option value={1}>Congelados</option>
              <option value={2}>Peixes ornamentais</option>
              <option value={3}>Microvida</option>
            </select>
            {(filterLevel !== "Todos" || filterLine > 0) && (
              <button onClick={() => { setFilterLevel("Todos"); setFilterLine(0); }}
                className="text-xs text-blue-600 hover:underline">Limpar filtros</button>
            )}
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} clientes</span>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Cliente</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Valor</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Compras</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Mix de linhas</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 min-w-[160px]">Progressão</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const cfg = LEVEL_CONFIG[c.level] ?? LEVEL_CONFIG.Bronze;
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-400 font-medium">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{c.level}</span>
                            <span className="text-sm text-gray-800 font-medium truncate max-w-[200px]">{c.name}</span>
                          </div>
                          {c.growth !== 0 && (
                            <span className={`text-xs ml-0.5 ${c.growth > 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {c.growth > 0 ? "▲" : "▼"} {Math.abs(Math.round(c.growth * 100))}% vs mês ant.
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">{fmt(c.value)}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">{c.purchases}x</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 justify-center items-center">
                            {LINES.map(line => {
                              const has = c.lines.includes(line.id);
                              return (
                                <div key={line.id} className="flex flex-col items-center gap-0.5">
                                  <span
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${has ? line.active : line.inactive}`}
                                    title={has ? `✓ ${line.label}` : `✗ ${line.label}`}
                                  >
                                    {line.short}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-center text-[10px] text-gray-400 mt-1">
                            {c.lines.length}/3 {c.lines.length === 3 ? "✓" : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-bold ${cfg.text}`}>{c.score}</span>
                          <span className="text-xs text-gray-400"> pts</span>
                        </td>
                        <td className="px-4 py-3">
                          {c.nextLevel ? (
                            <div>
                              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>{c.level}</span>
                                <span className={LEVEL_CONFIG[c.nextLevel]?.text ?? "text-gray-500"}>{c.nextLevel}</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${c.progressPct}%`, backgroundColor: c.levelColor }}
                                />
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5">faltam {c.pointsToNext} pts</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <div className="h-2 bg-cyan-200 rounded-full flex-1">
                                <div className="h-full bg-cyan-400 rounded-full w-full" />
                              </div>
                              <span className="text-[10px] text-cyan-600 font-semibold">MAX</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">Nenhum cliente encontrado.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Oportunidades */}
      {tab === "oportunidades" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Clientes com potencial de evolução — ações sugeridas para o vendedor.</p>
          {opportunities.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhuma oportunidade identificada.</div>
          )}
          {opportunities.map(c => {
            const cfg = LEVEL_CONFIG[c.level] ?? LEVEL_CONFIG.Bronze;
            return (
              <div key={c.id} className={`rounded-lg border ${cfg.border} p-4`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{c.level}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500 mb-1">{fmt(c.value)} · {c.purchases}x compras · {c.score} pts</p>
                      <div className="flex gap-1.5 items-center">
                        {LINES.map(line => {
                          const has = c.lines.includes(line.id);
                          return (
                            <span key={line.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${has ? line.active : "bg-gray-100 text-gray-400"}`}>
                              {has ? "✓" : "✗"} {line.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.actions?.map((a, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full">{a}</span>
                    ))}
                  </div>
                </div>
                {c.nextLevel && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>{c.level} · {c.score} pts</span>
                      <span className={LEVEL_CONFIG[c.nextLevel]?.text}>{c.nextLevel} em {c.score + c.pointsToNext} pts</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.progressPct}%`, backgroundColor: c.levelColor }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Inativos */}
      {tab === "inativos" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Clientes que compraram no mês anterior mas ainda não compraram neste mês.</p>
          {data.inactivos.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum cliente inativo identificado.</div>
          )}
          {data.inactivos.map(c => (
            <div key={c.id} className="bg-white rounded-lg border border-orange-200 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                <p className="text-xs text-gray-500">Última compra: {fmt(c.prevValue)} no mês anterior</p>
              </div>
              <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1 rounded-full">
                Cliente inativo este mês — fazer reposição
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
