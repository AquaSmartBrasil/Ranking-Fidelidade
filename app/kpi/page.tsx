"use client";
import { useEffect, useState, useCallback } from "react";

type VendedorKPI = {
  vendedor_id: string;
  vendedor_nome: string;
  meta: number;
  contacted: number;
  no_answer: number;
  postponed: number;
  total: number;
  pct: number;
  historico: { date: string; contacted: number; no_answer: number; total: number }[];
};
type EmpresaKPI = { contacted: number; no_answer: number; postponed: number; meta: number };
type KpiData = { date: string; empresa: EmpresaKPI; vendedores: VendedorKPI[] };

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function MiniSparkline({ data, meta }: { data: { date: string; total: number }[]; meta: number }) {
  if (!data.length) return <span className="text-xs text-gray-300">sem dados</span>;
  const max = Math.max(meta, ...data.map(d => d.total), 1);
  const w = 6;
  const gap = 2;
  const h = 32;

  return (
    <svg width={data.length * (w + gap)} height={h} className="overflow-visible">
      {data.map((d, i) => {
        const barH = Math.max(2, Math.round((d.total / max) * h));
        const color = d.total >= meta ? "#22c55e" : d.total >= meta * 0.6 ? "#3b82f6" : "#fb923c";
        return (
          <rect key={d.date}
            x={i * (w + gap)} y={h - barH}
            width={w} height={barH}
            rx={2} fill={color} opacity={0.85}
          />
        );
      })}
      {/* Meta line */}
      <line x1={0} y1={h - Math.round((meta / max) * h)}
        x2={data.length * (w + gap)} y2={h - Math.round((meta / max) * h)}
        stroke="#6b7280" strokeWidth={1} strokeDasharray="3,2" />
    </svg>
  );
}

export default function KpiPage() {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");

  const load = useCallback((d?: string) => {
    const params = d ? `?date=${d}` : "";
    fetch(`/api/kpi-gestor${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(date || undefined), 60 * 1000);
    return () => clearInterval(t);
  }, [load, date]);

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDate(e.target.value);
    setLoading(true);
    load(e.target.value || undefined);
  }

  if (loading) return <div className="text-sm text-gray-400 py-16 text-center">Carregando KPIs...</div>;
  if (!data) return <div className="text-sm text-red-500 py-8">Erro ao carregar.</div>;

  const dataLabel = new Date(data.date + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long"
  });

  const totalMeta = data.empresa.meta;
  const totalFeitos = data.empresa.contacted + data.empresa.no_answer + data.empresa.postponed;
  const pctEmpresa = totalMeta > 0 ? Math.round((totalFeitos / totalMeta) * 100) : 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 KPI de Contatos</h1>
          <p className="text-sm text-gray-500 capitalize mt-0.5">{dataLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date || data.date} onChange={handleDateChange}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <button onClick={() => load(date || undefined)}
            className="px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">↻</button>
        </div>
      </div>

      {/* KPI empresa */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-blue-600 rounded-xl p-4 text-white">
          <p className="text-xs text-blue-100 mb-1">Total contatos</p>
          <p className="text-3xl font-black">{totalFeitos}</p>
          <p className="text-xs text-blue-200">meta: {totalMeta}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">✅ Contatados</p>
          <p className="text-3xl font-black text-green-600">{data.empresa.contacted}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">📵 Sem resposta</p>
          <p className="text-3xl font-black text-gray-500">{data.empresa.no_answer}</p>
        </div>
        <div className={`rounded-xl p-4 border ${pctEmpresa >= 100 ? "bg-green-50 border-green-200" : pctEmpresa >= 60 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
          <p className="text-xs text-gray-500 mb-1">% da meta</p>
          <p className={`text-3xl font-black ${pctEmpresa >= 100 ? "text-green-700" : pctEmpresa >= 60 ? "text-blue-700" : "text-orange-700"}`}>{pctEmpresa}%</p>
          <ProgressBar pct={pctEmpresa} color={pctEmpresa >= 100 ? "bg-green-500" : pctEmpresa >= 60 ? "bg-blue-500" : "bg-orange-400"} />
        </div>
      </div>

      {/* Por vendedor */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Por vendedor — hoje</p>
        </div>
        <div className="divide-y divide-gray-100">
          {data.vendedores.length === 0 && (
            <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado ainda hoje. Os vendedores precisam marcar os contatos na tela de Missão.</p>
          )}
          {data.vendedores.map(v => {
            const alertClass = v.pct >= 100 ? "bg-green-50" : v.pct < 40 ? "bg-red-50" : "";
            return (
              <div key={v.vendedor_id} className={`px-4 py-4 ${alertClass}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-gray-800">{v.vendedor_nome}</p>
                    {v.pct >= 100 && <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">✓ Meta</span>}
                    {v.pct < 40 && v.total > 0 && <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">⚠ Baixo</span>}
                    {v.total === 0 && <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">Sem registro</span>}
                  </div>
                  <span className={`text-sm font-black ${v.pct >= 100 ? "text-green-700" : v.pct < 40 ? "text-red-600" : "text-gray-700"}`}>
                    {v.total}/{v.meta}
                  </span>
                </div>
                <ProgressBar pct={v.pct} color={v.pct >= 100 ? "bg-green-500" : v.pct >= 60 ? "bg-blue-500" : v.pct >= 40 ? "bg-orange-400" : "bg-red-400"} />
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span className="text-green-600 font-semibold">✅ {v.contacted}</span>
                  <span>📵 {v.no_answer}</span>
                  <span className="text-blue-500">➡️ {v.postponed}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Histórico 30 dias por vendedor */}
      {data.vendedores.some(v => v.historico.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Histórico 30 dias — contatos/dia</p>
          </div>
          <div className="divide-y divide-gray-100">
            {data.vendedores.filter(v => v.historico.length > 0).map(v => (
              <div key={v.vendedor_id} className="px-4 py-3 flex items-center gap-4">
                <p className="text-sm font-medium text-gray-700 w-28 shrink-0">{v.vendedor_nome.split(" ")[0]}</p>
                <MiniSparkline data={v.historico} meta={v.meta} />
                <div className="text-xs text-gray-400 ml-auto">
                  média: <span className="font-bold text-gray-600">
                    {v.historico.length ? Math.round(v.historico.reduce((s, d) => s + d.total, 0) / v.historico.length) : 0}/dia
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            🟢 Meta atingida &nbsp; 🔵 60%+ &nbsp; 🟠 abaixo — linha pontilhada = meta de {data.vendedores[0]?.meta ?? 15}/dia
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pb-4">Atualiza a cada minuto · Contatos registrados pelos vendedores na Missão do Dia</p>
    </div>
  );
}
