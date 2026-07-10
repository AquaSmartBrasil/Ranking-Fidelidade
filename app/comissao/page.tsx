"use client";
import { useEffect, useState } from "react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

type Vendedor = {
  id: string; nome: string;
  totalVendido: number; clientesAtendidos: number;
  metaMensal: number; metaClientes: number;
  pctFaturamento: number | null; pctClientes: number | null;
  bateuFaturamento: boolean; bateuClientes: boolean;
  semInadimplencia: boolean; temInadimplencia: boolean;
  comissaoFaturamento: number; comissaoClientes: number; comissaoInadimplencia: number;
  upgrades: number; bonusRanking: number; totalComissao: number;
};

type Data = {
  mes: string;
  vendedores: Vendedor[];
  regras: { pctFaturamento: number; pctClientes: number; pctInadimplencia: number; bonusBronze: number };
};

function Check({ ok }: { ok: boolean }) {
  return ok
    ? <span className="text-green-500 font-bold">✓</span>
    : <span className="text-red-400 font-bold">✗</span>;
}

function PctBar({ pct, ok }: { pct: number | null; ok: boolean }) {
  if (pct === null) return <span className="text-xs text-gray-300">sem meta</span>;
  const w = Math.min(pct, 100);
  const color = ok ? "bg-green-400" : pct >= 70 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className={`text-xs font-semibold ${ok ? "text-green-600" : "text-gray-500"}`}>{pct}%</span>
    </div>
  );
}

export default function ComissaoPage() {
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const mesAtualYM = `${brNow.getUTCFullYear()}-${String(brNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const [mesSel, setMesSel] = useState(mesAtualYM);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/comissao?mes=${mesSel}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [mesSel]);

  function navMes(delta: number) {
    const [y, m] = mesSel.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (next <= mesAtualYM) setMesSel(next);
  }

  const mesLabel = new Date(
    Number(mesSel.split("-")[0]), Number(mesSel.split("-")[1]) - 1, 1
  ).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  const totalGeral = data?.vendedores.reduce((s, v) => s + v.totalComissao, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comissão</h1>
          <p className="text-sm text-gray-500 mt-1">Calculada por faturamento, clientes e inadimplência</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <button onClick={() => navMes(-1)} className="px-3 py-2 text-gray-500 hover:bg-gray-100 text-lg font-light">‹</button>
          <span className="px-3 py-2 text-sm font-medium text-gray-800 min-w-[130px] text-center capitalize">{mesLabel}</span>
          <button onClick={() => navMes(1)}
            className={`px-3 py-2 text-lg font-light ${mesSel >= mesAtualYM ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-100"}`}>›</button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-400">Calculando comissões...</div>}

      {!loading && data && (
        <>
          {/* Regras resumidas */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 grid grid-cols-3 gap-3 text-xs text-blue-700">
            <div><span className="font-bold">{data.regras.pctFaturamento}%</span> sobre o faturamento do mês</div>
            <div><span className="font-bold">{data.regras.pctClientes}%</span> se bater meta de clientes</div>
            <div><span className="font-bold">{data.regras.pctInadimplencia}%</span> se fechar sem inadimplência</div>
          </div>

          {/* Total geral */}
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Total de comissões no mês</span>
            <span className="text-2xl font-bold text-gray-900">{fmt(totalGeral)}</span>
          </div>

          {/* Cards por vendedor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {data.vendedores.map(v => (
              <div key={v.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                {/* Nome + total */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-gray-900 text-lg">{v.nome}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Total vendido: {fmt(v.totalVendido)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-emerald-600">{fmt(v.totalComissao)}</div>
                    <div className="text-xs text-gray-400">comissão total</div>
                  </div>
                </div>

                {/* Breakdown dos 3 componentes */}
                <div className="space-y-3 border-t border-gray-100 pt-3">

                  {/* Faturamento */}
                  <div className="flex items-start gap-3">
                    <Check ok={v.bateuFaturamento} />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">Meta de faturamento</span>
                        <span className={`font-semibold ${v.bateuFaturamento ? "text-green-600" : "text-gray-400"}`}>
                          {v.bateuFaturamento ? fmt(v.comissaoFaturamento) : "R$ 0"}
                        </span>
                      </div>
                      <PctBar pct={v.pctFaturamento} ok={v.bateuFaturamento} />
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {fmt(v.totalVendido)} de {v.metaMensal > 0 ? fmt(v.metaMensal) : "sem meta"}
                      </div>
                    </div>
                  </div>

                  {/* Clientes */}
                  <div className="flex items-start gap-3">
                    <Check ok={v.bateuClientes} />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">Meta de clientes</span>
                        <span className={`font-semibold ${v.bateuClientes ? "text-green-600" : "text-gray-400"}`}>
                          {v.bateuClientes ? fmt(v.comissaoClientes) : "R$ 0"}
                        </span>
                      </div>
                      <PctBar pct={v.pctClientes} ok={v.bateuClientes} />
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {v.clientesAtendidos} de {v.metaClientes > 0 ? `${v.metaClientes} clientes` : "sem meta"}
                      </div>
                    </div>
                  </div>

                  {/* Inadimplência */}
                  <div className="flex items-start gap-3">
                    <Check ok={v.semInadimplencia} />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Sem inadimplência</span>
                        <span className={`font-semibold ${v.semInadimplencia ? "text-green-600" : "text-gray-400"}`}>
                          {v.semInadimplencia ? fmt(v.comissaoInadimplencia) : "R$ 0"}
                        </span>
                      </div>
                      {v.temInadimplencia && (
                        <div className="text-[10px] text-red-500 mt-0.5">⚠ Há clientes com pendência financeira</div>
                      )}
                    </div>
                  </div>

                  {/* Bônus ranking */}
                  {v.upgrades > 0 && (
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <span className="text-amber-500 text-lg">⭐</span>
                      <div className="flex-1 text-sm text-amber-800">
                        {v.upgrades} cliente{v.upgrades > 1 ? "s" : ""} saíu do Bronze
                      </div>
                      <span className="font-bold text-amber-700">{fmt(v.bonusRanking)}</span>
                    </div>
                  )}
                </div>

                {/* Barra de potencial */}
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Potencial máximo</span>
                    <span>{fmt(Math.round(v.totalVendido * 0.06))}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${v.totalVendido > 0 ? Math.min(100, Math.round((v.totalComissao / (v.totalVendido * 0.06)) * 100)) : 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
