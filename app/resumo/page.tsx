"use client";
import { useEffect, useState } from "react";

type VendedorMes = { vendedorId: string; nome: string; cor: string; valor: number; metaMensal: number; pct: number | null };
type MesData = { mes: number; total: number; metaMes: number; vendedores: VendedorMes[]; fechado: boolean; atual: boolean };
type Vendedor = { id: string; nome: string; cor: string };
type ResumoData = {
  ano: number; mesAtual: number;
  metaAnual: number; metaTrim: number; metaSem: number;
  realizadoAno: number; realizadoTrim: number; realizadoSem: number;
  trimLabel: string; semLabel: string;
  trimIdx: number; semIdx: number; trimAtualIdx: number; semAtualIdx: number;
  vendedores: Vendedor[]; meses: MesData[];
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtCompact(v: number) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(Math.round(v));
}

function GoalCard({ label, meta, realizado }: { label: string; meta: number; realizado: number }) {
  const pct = meta > 0 ? Math.round((realizado / meta) * 100) : null;
  const color = pct === null ? "text-gray-700" : pct >= 100 ? "text-green-600" : pct >= 70 ? "text-blue-600" : "text-orange-600";
  const barColor = pct === null ? "bg-gray-300" : pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-blue-500" : "bg-orange-400";
  return (
    <div className={label ? "bg-white border border-gray-200 rounded-xl p-5" : ""}>
      {label && <div className="text-xs text-gray-500 font-medium mb-2">{label}</div>}
      <div className="flex items-end justify-between mb-1">
        <span className="text-xl font-bold text-gray-900">{fmt(realizado)}</span>
        {pct !== null && <span className={`text-sm font-bold ${color}`}>{pct}%</span>}
      </div>
      <div className="text-xs text-gray-400 mb-2">meta: {meta > 0 ? fmt(meta) : "não definida"}</div>
      {meta > 0 && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function ResumoPage() {
  const [data, setData] = useState<ResumoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverMes, setHoverMes] = useState<number | null>(null);
  const [trimOffset, setTrimOffset] = useState(0);
  const [semOffset, setSemOffset] = useState(0);

  function load(tOff: number, sOff: number) {
    setLoading(true);
    fetch(`/api/resumo?trimOffset=${tOff}&semOffset=${sOff}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }

  useEffect(() => { load(trimOffset, semOffset); }, [trimOffset, semOffset]);

  if (loading) return <div className="text-sm text-gray-400">Carregando...</div>;
  if (!data) return <div className="text-sm text-red-600">Erro ao carregar dados.</div>;

  const maxValor = Math.max(...data.meses.map(m => Math.max(m.total, m.metaMes)), 1);
  const chartHeight = 280;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resumo — {data.ano}</h1>
        <p className="text-sm text-gray-500 mt-1">Faturamento do ano por vendedor vs metas</p>
      </div>

      {/* Cards de metas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GoalCard label="Meta Anual" meta={data.metaAnual} realizado={data.realizadoAno} />

        {/* Trimestre com setas */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">{data.trimLabel} · {data.ano}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setTrimOffset(o => Math.min(o + 1, data.trimAtualIdx))}
                className={`w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 ${trimOffset >= data.trimAtualIdx ? "opacity-30 cursor-not-allowed" : ""}`}>‹</button>
              <button onClick={() => setTrimOffset(o => Math.max(o - 1, 0))}
                className={`w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 ${trimOffset === 0 ? "opacity-30 cursor-not-allowed" : ""}`}>›</button>
            </div>
          </div>
          <GoalCard label="" meta={data.metaTrim} realizado={data.realizadoTrim} />
        </div>

        {/* Semestre com setas */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">{data.semLabel} · {data.ano}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setSemOffset(o => Math.min(o + 1, data.semAtualIdx))}
                className={`w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 ${semOffset >= data.semAtualIdx ? "opacity-30 cursor-not-allowed" : ""}`}>‹</button>
              <button onClick={() => setSemOffset(o => Math.max(o - 1, 0))}
                className={`w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 ${semOffset === 0 ? "opacity-30 cursor-not-allowed" : ""}`}>›</button>
            </div>
          </div>
          <GoalCard label="" meta={data.metaSem} realizado={data.realizadoSem} />
        </div>
      </div>

      {/* Legenda vendedores */}
      {data.vendedores.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {data.vendedores.map(v => (
            <div key={v.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.cor }} />
              {v.nome}
            </div>
          ))}
        </div>
      )}

      {/* Gráfico de barras empilhadas */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-end gap-3" style={{ height: chartHeight }}>
          {data.meses.map(m => {
            const barHeightPx = (m.total / maxValor) * (chartHeight - 30);
            const metaHeightPx = (m.metaMes / maxValor) * (chartHeight - 30);
            const isHover = hoverMes === m.mes;
            return (
              <div key={m.mes} className="flex-1 flex flex-col items-center h-full justify-end relative"
                onMouseEnter={() => setHoverMes(m.mes)} onMouseLeave={() => setHoverMes(null)}>

                {/* Tooltip */}
                {isHover && (
                  <div className="absolute bottom-full mb-2 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg z-10 whitespace-nowrap">
                    <div className="font-bold mb-1">{MESES[m.mes - 1]}/{data.ano}</div>
                    <div className="text-gray-300 mb-1.5">Total: {fmt(m.total)} {m.metaMes > 0 && `· Meta: ${fmt(m.metaMes)}`}</div>
                    {m.vendedores.filter(v => v.valor > 0).map(v => (
                      <div key={v.vendedorId} className="flex items-center gap-1.5 justify-between">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: v.cor }} />
                          {v.nome}
                        </span>
                        <span className="ml-3">
                          {fmt(v.valor)}
                          {v.pct !== null && (
                            <span className={`ml-1 ${v.pct >= 100 ? "text-green-400" : v.pct >= 70 ? "text-blue-300" : "text-orange-300"}`}>
                              ({v.pct}%)
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Linha de meta tracejada */}
                {m.metaMes > 0 && (
                  <div className="absolute w-full border-t-2 border-dashed border-gray-400 z-[1]"
                    style={{ bottom: `${metaHeightPx + 18}px` }} />
                )}

                {/* Barra empilhada */}
                <div className="w-full max-w-[36px] rounded-t-sm overflow-hidden flex flex-col-reverse transition-opacity"
                  style={{ height: `${barHeightPx}px`, opacity: isHover ? 1 : 0.92 }}>
                  {m.vendedores.filter(v => v.valor > 0).map(v => {
                    const segH = m.total > 0 ? (v.valor / m.total) * barHeightPx : 0;
                    return <div key={v.vendedorId} style={{ height: `${segH}px`, backgroundColor: v.cor }} title={`${v.nome}: ${fmt(v.valor)}`} />;
                  })}
                </div>

                {/* Rótulo mês */}
                <div className={`text-xs mt-2 font-medium ${m.atual ? "text-blue-600" : "text-gray-500"}`}>
                  {MESES[m.mes - 1]}
                </div>
                <div className="text-[10px] text-gray-400">{m.total > 0 ? fmtCompact(m.total) : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabela detalhada por mês */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Mês</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Realizado</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Meta</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">%</th>
              {data.vendedores.map(v => (
                <th key={v.id} className="text-right px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: v.cor }} />
                    {v.nome}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.meses.map(m => {
              const pct = m.metaMes > 0 ? Math.round((m.total / m.metaMes) * 100) : null;
              return (
                <tr key={m.mes} className={`border-b border-gray-50 last:border-0 ${m.atual ? "bg-blue-50" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{MESES[m.mes - 1]}{m.atual && <span className="text-[10px] text-blue-600 ml-1">atual</span>}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{m.total > 0 ? fmt(m.total) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{m.metaMes > 0 ? fmt(m.metaMes) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {pct !== null ? (
                      <span className={`font-semibold ${pct >= 100 ? "text-green-600" : pct >= 70 ? "text-blue-600" : "text-orange-600"}`}>{pct}%</span>
                    ) : "—"}
                  </td>
                  {data.vendedores.map(v => {
                    const vd = m.vendedores.find(x => x.vendedorId === v.id);
                    return (
                      <td key={v.id} className="px-4 py-2.5 text-right text-gray-600">
                        {vd && vd.valor > 0 ? fmt(vd.valor) : "—"}
                        {vd && vd.pct !== null && vd.valor > 0 && (
                          <span className={`text-[10px] ml-1 ${vd.pct >= 100 ? "text-green-600" : vd.pct >= 70 ? "text-blue-600" : "text-orange-500"}`}>
                            ({vd.pct}%)
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
