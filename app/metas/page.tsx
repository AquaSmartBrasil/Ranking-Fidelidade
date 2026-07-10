"use client";
import { useEffect, useState, useCallback } from "react";

type Vendedor = {
  id: string; nome: string; totalClientes: number; clientesMes: number;
  totalPeriodo: number; totalMes: number; totalTrim: number; totalSem: number; totalAno: number;
  metaMes: number; metaTrimestre: number; metaSemestre: number; metaAnual: number; metaClientes: number;
  pctMes: number|null; pctTrim: number|null; pctSem: number|null; pctAno: number|null; pctClientes: number|null;
};
type MesData = { mes: string; total: number; count: number };
type ClienteCarteira = {
  id: string; nome: string; email: string; historico: MesData[];
  metaMes: number; realizadoPeriodo: number; pctMeta: number|null;
  comprou: boolean; mesesSemCompra: number; lines: number[]; ultimaCompra: string|null;
};

const PERIODOS = [
  { key: "mes", label: "Este mês" },
  { key: "trimestre", label: "Trimestre" },
  { key: "semestre", label: "Semestre" },
  { key: "ano", label: "Este ano" },
  { key: "custom", label: "Personalizado" },
];

const LINE_LABELS: Record<number, { label: string; bg: string }> = {
  1: { label: "C", bg: "bg-blue-500" },
  2: { label: "P", bg: "bg-green-500" },
  3: { label: "M", bg: "bg-purple-500" },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function getMesLabel(m: string) {
  const [y, mo] = m.split("-");
  return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mo)-1] + "/" + y.slice(2);
}
function getLast12Months() {
  const now = new Date();
  return Array.from({length:12},(_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-11+i, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
}

function PctBar({ pct, label, metaLabel }: { pct: number|null; label: string; metaLabel: string }) {
  if (pct === null) return null;
  const capped = Math.min(pct, 100);
  const color = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-blue-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className={`font-semibold ${pct >= 100 ? "text-green-600" : pct >= 70 ? "text-blue-600" : "text-gray-700"}`}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{width:`${capped}%`}} />
      </div>
      <div className="text-xs text-gray-400 mt-0.5">meta: {metaLabel}</div>
    </div>
  );
}

function MiniBarChart({ historico, meta }: { historico: MesData[]; meta: number }) {
  const months = getLast12Months();
  const mesMap = new Map(historico.map(m => [m.mes, m.total]));
  const maxVal = Math.max(meta, ...months.map(m => mesMap.get(m) ?? 0), 1);
  const mesAtual = months[months.length-1];
  return (
    <div className="flex items-end gap-0.5 h-14 mt-2">
      {months.map(m => {
        const val = mesMap.get(m) ?? 0;
        const pct = Math.round((val/maxVal)*100);
        const isCurrent = m === mesAtual;
        const metaPct = Math.round((meta/maxVal)*100);
        return (
          <div key={m} className="flex flex-col items-center flex-1 h-full justify-end relative" title={`${getMesLabel(m)}: ${fmt(val)}`}>
            {isCurrent && meta>0 && <div className="absolute w-full border-t-2 border-dashed border-orange-400" style={{bottom:`${metaPct}%`}} />}
            <div className={`w-full rounded-t-sm ${isCurrent ? (val>=meta ? "bg-green-500":"bg-blue-400") : "bg-gray-300"}`}
              style={{height:`${pct}%`, minHeight:val>0?"2px":"0"}} />
            <span className="text-gray-400 mt-0.5" style={{fontSize:"8px"}}>{getMesLabel(m).split("/")[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MetasPage() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<Vendedor|null>(null);
  const [carteira, setCarteira] = useState<ClienteCarteira[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<ClienteCarteira|null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCarteira, setLoadingCarteira] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos"|"ativos"|"inativos">("todos");
  const hoje = new Date(Date.now() - 3*60*60*1000);
  const mesAtualYM = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth()+1).padStart(2,"0")}`;
  const [mesSel, setMesSel] = useState(mesAtualYM);

  const buildUrl = useCallback((base: string, vId?: string) => {
    const [y, m] = mesSel.split("-").map(Number);
    const inicio = `${y}-${String(m).padStart(2,"0")}-01`;
    const fim = new Date(y, m, 0).toISOString().slice(0,10);
    const params = new URLSearchParams({ periodo: "custom", inicio, fim });
    if (vId) params.set("vendedor", vId);
    return `${base}?${params}`;
  }, [mesSel]);

  const loadVendedores = useCallback(() => {
    setLoading(true);
    fetch(buildUrl("/api/metas")).then(r=>r.json()).then(d => {
      setVendedores(d.vendedores ?? []);
      setLoading(false);
    });
  }, [buildUrl]);

  useEffect(() => { loadVendedores(); }, [loadVendedores]);

  function selectVendedor(v: Vendedor) {
    setSelectedVendedor(v);
    setSelectedCliente(null);
    setCarteira([]);
    setLoadingCarteira(true);
    fetch(buildUrl("/api/metas", v.id)).then(r=>r.json()).then(d => {
      setCarteira(d.carteira ?? []);
      setLoadingCarteira(false);
    });
  }

  const filtered = carteira.filter(c => {
    if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "ativos" && !c.comprou) return false;
    if (filter === "inativos" && c.comprou) return false;
    return true;
  });

  const totalRealizado = filtered.reduce((s,c)=>s+c.realizadoPeriodo,0);
  const totalMeta = selectedVendedor?.metaMes ?? filtered.reduce((s,c)=>s+c.metaMes,0);
  const [mesSelAno, mesSelMes] = mesSel.split("-").map(Number);
  const mesLabel = new Date(mesSelAno, mesSelMes - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  if (loading) return <div className="text-gray-500 text-sm">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Metas de Vendas</h1>
          <p className="text-sm text-gray-500 mt-1">Carteira por vendedor</p>
        </div>
        {/* Seletor de mês com setas */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <button onClick={() => {
            const [y, m] = mesSel.split("-").map(Number);
            const d = new Date(y, m - 2, 1);
            setMesSel(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
            setSelectedVendedor(null); setCarteira([]);
          }} className="px-3 py-2 text-gray-500 hover:bg-gray-100 transition-colors text-lg font-light">‹</button>
          <span className="px-3 py-2 text-sm font-medium text-gray-800 min-w-[130px] text-center capitalize">{mesLabel}</span>
          <button onClick={() => {
            const [y, m] = mesSel.split("-").map(Number);
            const d = new Date(y, m, 1);
            const next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
            if (next <= mesAtualYM) { setMesSel(next); setSelectedVendedor(null); setCarteira([]); }
          }} className={`px-3 py-2 text-lg font-light transition-colors ${mesSel >= mesAtualYM ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-100"}`}>›</button>
        </div>
      </div>

      {!selectedVendedor ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendedores.map(v => {
            // Meta e % referentes ao período selecionado
            const metaRef = v.metaMes;
            const pctRef = metaRef > 0 ? Math.round((v.totalPeriodo / metaRef) * 100) : null;
            return (
              <button key={v.id} onClick={() => selectVendedor(v)}
                className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-blue-400 hover:shadow-md transition-all">
                <div className="font-semibold text-gray-900 text-lg">{v.nome}</div>
                <div className="text-sm text-gray-500 mt-0.5">{v.clientesMes} clientes atendidos no mês</div>

                <div className="mt-3 text-blue-600 font-bold text-2xl">{fmt(v.totalPeriodo)}</div>
                <div className="text-xs text-gray-400 mb-3">{mesLabel}</div>

                <div className="border-t border-gray-100 pt-3 space-y-0">
                  <PctBar pct={pctRef} label="% da meta de faturamento" metaLabel={metaRef > 0 ? fmt(metaRef) : "sem meta"} />
                  <PctBar pct={v.pctClientes} label="% da meta de clientes" metaLabel={v.metaClientes > 0 ? `${v.metaClientes} clientes` : "sem meta"} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <button onClick={() => { setSelectedVendedor(null); setCarteira([]); setSelectedCliente(null); }}
              className="text-sm text-blue-600 hover:underline">← Voltar</button>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedVendedor.nome}</h2>
              <p className="text-sm text-gray-500">{carteira.length} clientes · {mesLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-xs text-blue-600 font-medium">Realizado</div>
              <div className="text-xl font-bold text-blue-700 mt-1">{fmt(totalRealizado)}</div>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
              <div className="text-xs text-orange-600 font-medium">Meta do mês</div>
              <div className="text-xl font-bold text-orange-700 mt-1">{fmt(totalMeta)}</div>
            </div>
            <div className={`rounded-xl p-4 border ${totalRealizado>=totalMeta ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
              <div className={`text-xs font-medium ${totalRealizado>=totalMeta ? "text-green-600" : "text-red-500"}`}>
                {totalRealizado>=totalMeta ? "Acima da meta" : "Falta atingir"}
              </div>
              <div className={`text-xl font-bold mt-1 ${totalRealizado>=totalMeta ? "text-green-700" : "text-red-600"}`}>
                {totalMeta>0 ? fmt(Math.abs(totalMeta-totalRealizado)) : "—"}
              </div>
            </div>
            <div className={`rounded-xl p-4 border ${totalRealizado>=totalMeta ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"}`}>
              <div className="text-xs text-gray-600 font-medium">% da meta</div>
              <div className={`text-xl font-bold mt-1 ${totalRealizado>=totalMeta ? "text-green-600" : "text-gray-700"}`}>
                {totalMeta>0 ? Math.round((totalRealizado/totalMeta)*100) : 0}%
              </div>
            </div>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente..."
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]" />
            {(["todos","ativos","inativos"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter===f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {f==="todos" ? "Todos" : f==="ativos" ? "✓ Compraram" : "⚠ Inativos"}
              </button>
            ))}
            <span className="text-sm text-gray-400">{filtered.length} clientes</span>
          </div>

          {loadingCarteira && <div className="text-sm text-gray-400">Carregando carteira...</div>}

          {selectedCliente && (
            <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{selectedCliente.nome}</h3>
                  <p className="text-sm text-gray-400">{selectedCliente.email}</p>
                </div>
                <button onClick={() => setSelectedCliente(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <div className="text-xs text-gray-500">Realizado ({mesLabel})</div>
                  <div className="font-bold text-blue-600 text-lg">{fmt(selectedCliente.realizadoPeriodo)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Meta mensal projetada</div>
                  <div className="font-bold text-orange-600 text-lg">{fmt(selectedCliente.metaMes)}</div>
                  <div className="text-xs text-gray-400">média 3 meses + 5%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Linhas de produto</div>
                  <div className="flex gap-1 mt-1">
                    {[1,2,3].map(l => {
                      const info = LINE_LABELS[l];
                      const has = selectedCliente.lines.includes(l);
                      return <span key={l} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${has ? info.bg : "bg-gray-100 text-gray-400"}`}>{info.label}</span>;
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-gray-500 mb-1">Histórico 12 meses <span className="text-orange-400">--- meta mensal</span></div>
                <MiniBarChart historico={selectedCliente.historico} meta={selectedCliente.metaMes} />
              </div>
              <div className="mt-4">
                <div className="text-xs font-medium text-gray-600 mb-2">Meses detalhados</div>
                <div className="grid grid-cols-4 gap-1">
                  {getLast12Months().map(m => {
                    const d = selectedCliente.historico.find(h=>h.mes===m);
                    const isCurrent = m === mesAtualYM;
                    return (
                      <div key={m} className={`rounded-lg p-2 text-center text-xs ${isCurrent ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                        <div className="text-gray-400">{getMesLabel(m)}</div>
                        {d ? (<><div className="font-semibold text-gray-800">{fmt(d.total)}</div><div className="text-gray-400">{d.count}x</div></>) : <div className="text-gray-300">—</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Realizado</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Meta mês</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">%</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Linhas</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => setSelectedCliente(selectedCliente?.id===c.id ? null : c)}
                    className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.nome}</div>
                      {c.ultimaCompra && <div className="text-xs text-gray-400">Última: {getMesLabel(c.ultimaCompra)}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600">{c.realizadoPeriodo>0 ? fmt(c.realizadoPeriodo) : "—"}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{c.metaMes>0 ? fmt(c.metaMes) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {c.pctMeta!==null ? (
                        <span className={`font-semibold ${c.pctMeta>=100 ? "text-green-600" : c.pctMeta>=50 ? "text-yellow-600" : "text-red-500"}`}>{c.pctMeta}%</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        {[1,2,3].map(l => {
                          const info = LINE_LABELS[l];
                          const has = c.lines.includes(l);
                          return <span key={l} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${has ? info.bg : "bg-gray-100 text-gray-300"}`}>{info.label}</span>;
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.comprou
                        ? <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">Ativo</span>
                        : <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${(c.mesesSemCompra||1) >= 4 ? "bg-red-200 text-red-700" : (c.mesesSemCompra||1) >= 2 ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>
                            Inativo há {c.mesesSemCompra||1} {(c.mesesSemCompra||1)===1?"mês":"meses"}
                          </span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length===0 && <div className="text-center py-8 text-gray-400 text-sm">Nenhum cliente encontrado</div>}
          </div>
        </div>
      )}
    </div>
  );
}
