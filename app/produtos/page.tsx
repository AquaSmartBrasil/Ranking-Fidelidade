"use client";
import { useEffect, useState, useCallback } from "react";

type VendedorMeta = { id: string; nome: string; metaUnidades: number; vendidoMes: number; pctMes: number | null };
type EmpresaMeta = { metaUnidades: number; vendidoMes: number; pctMes: number | null; metaDia: number };
type Produto = {
  nome: string; linha: number | null; linhaLabel: string; linhaEmoji: string;
  receitaHistTotal: number; precoMedio: number;
  empresa: EmpresaMeta;
  vendedores: VendedorMeta[];
};
type VendedorNome = { id: string; nome: string };
type Data = { produtos: Produto[]; vendedores: VendedorNome[]; diasRestantes: number; mes: string };

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function getMesLabel(m: string) {
  const [y, mo] = m.split("-");
  return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mo)-1] + "/" + y.slice(2);
}

function BarPct({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-gray-300">—</span>;
  const capped = Math.min(pct, 100);
  const color = pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-orange-400" : "bg-red-400";
  const textColor = pct >= 100 ? "text-green-700" : pct >= 60 ? "text-blue-700" : pct >= 30 ? "text-orange-700" : "text-red-700";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${capped}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${textColor}`}>{pct}%</span>
    </div>
  );
}

function rowBg(pct: number | null) {
  if (pct === null) return "";
  if (pct >= 100) return "bg-green-50/40";
  if (pct < 30) return "bg-red-50/60";
  return "";
}

export default function ProdutosPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [linhaFiltro, setLinhaFiltro] = useState<string>("todos");

  const load = useCallback(() => {
    fetch("/api/produtos-meta").then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-sm text-gray-400 py-16 text-center">Calculando metas de produtos...</div>;
  if (!data?.produtos?.length) return <div className="text-sm text-gray-500 py-8 text-center">Sem dados suficientes. Sincronize e configure metas no Admin.</div>;

  const mesLabel = getMesLabel(data.mes);
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hojeLabel = hoje.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });

  function toggleExpandido(nome: string) {
    setExpandido(prev => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  }

  const filtered = data.produtos.filter(p => {
    if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false;
    if (linhaFiltro !== "todos" && String(p.linha ?? "outros") !== linhaFiltro) return false;
    return true;
  });

  // KPIs da empresa
  const totalMetaEmpresa = data.produtos.reduce((s, p) => s + p.empresa.metaUnidades, 0);
  const totalVendidoEmpresa = data.produtos.reduce((s, p) => s + p.empresa.vendidoMes, 0);
  const pctGeral = totalMetaEmpresa > 0 ? Math.round((totalVendidoEmpresa / totalMetaEmpresa) * 100) : 0;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📦 Meta de Produtos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Top 30 produtos · {mesLabel} · {hojeLabel} · {data.diasRestantes} dias úteis restantes</p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">↻ Atualizar</button>
      </div>

      {/* KPIs empresa */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-600 rounded-xl p-4">
          <p className="text-xs text-blue-100 mb-1">Meta empresa (unid.)</p>
          <p className="text-2xl font-black text-white">{totalMetaEmpresa.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-blue-200 mt-0.5">top 30 produtos</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Vendido no mês</p>
          <p className="text-2xl font-black text-gray-800">{totalVendidoEmpresa.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-gray-400 mt-0.5">unidades</p>
        </div>
        <div className={`rounded-xl p-4 border ${pctGeral >= 100 ? "bg-green-50 border-green-200" : pctGeral >= 60 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
          <p className="text-xs text-gray-500 mb-1">% da meta</p>
          <p className={`text-2xl font-black ${pctGeral >= 100 ? "text-green-700" : pctGeral >= 60 ? "text-blue-700" : "text-orange-700"}`}>{pctGeral}%</p>
          <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pctGeral >= 100 ? "bg-green-500" : pctGeral >= 60 ? "bg-blue-500" : "bg-orange-400"}`} style={{ width: `${Math.min(pctGeral, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..."
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-200" />
        {[
          { key: "todos", label: "Todas as linhas" },
          { key: "1", label: "🧊 Congelados" },
          { key: "2", label: "🐟 Peixes" },
          { key: "3", label: "🦠 Microvida" },
          { key: "outros", label: "📦 Outros" },
        ].map(l => (
          <button key={l.key} onClick={() => setLinhaFiltro(l.key)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${linhaFiltro === l.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
            {l.label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Linha</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Meta empresa</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Vendido</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 min-w-[140px]">Progresso</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Meta/dia</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Preço médio</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 text-center">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const aberto = expandido.has(p.nome);
              return (
                <>
                  {/* Linha do produto (empresa) */}
                  <tr key={p.nome}
                    className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${rowBg(p.empresa.pctMes)} ${aberto ? "border-b-0" : ""}`}
                    onClick={() => toggleExpandido(p.nome)}
                  >
                    <td className="px-4 py-3 text-xs text-gray-400 font-medium">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{p.nome}</p>
                    </td>
                    <td className="px-3 py-3 text-center text-base" title={p.linhaLabel}>{p.linhaEmoji}</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-700">
                      {p.empresa.metaUnidades > 0 ? p.empresa.metaUnidades.toLocaleString("pt-BR") : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-bold ${p.empresa.vendidoMes > 0 ? "text-blue-600" : "text-gray-300"}`}>
                        {p.empresa.vendidoMes > 0 ? p.empresa.vendidoMes.toLocaleString("pt-BR") : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3"><BarPct pct={p.empresa.pctMes} /></td>
                    <td className="px-3 py-3 text-right">
                      {p.empresa.metaDia > 0
                        ? <span className={`font-bold text-sm ${p.empresa.metaDia >= 10 ? "text-orange-600" : "text-gray-700"}`}>{p.empresa.metaDia}/dia</span>
                        : p.empresa.pctMes !== null && p.empresa.pctMes >= 100
                          ? <span className="text-green-600 text-xs font-bold">✓ ok</span>
                          : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-gray-400">{p.precoMedio > 0 ? fmt(p.precoMedio) : "—"}</td>
                    <td className="px-3 py-3 text-center text-gray-400 text-xs">
                      {p.vendedores.length > 0
                        ? <span className={`transition-transform inline-block ${aberto ? "rotate-90" : ""}`}>▶</span>
                        : "—"}
                    </td>
                  </tr>

                  {/* Sub-linhas por vendedor (expande ao clicar) */}
                  {aberto && p.vendedores.map(v => (
                    <tr key={`${p.nome}-${v.id}`} className="border-b border-gray-50 bg-gray-50/80">
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 pl-8">
                        <span className="text-xs text-gray-500 font-medium">↳ {v.nome}</span>
                      </td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600 font-semibold">
                        {v.metaUnidades > 0 ? v.metaUnidades : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-blue-500">
                        {v.vendidoMes > 0 ? v.vendidoMes : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2"><BarPct pct={v.pctMes} /></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">Nenhum produto encontrado</div>
        )}

        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          {filtered.length} produto{filtered.length !== 1 ? "s" : ""} · Meta calculada pelo histórico de 12 meses · Clique numa linha para ver por vendedor
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center pb-4">Atualiza conforme sync de vendas</p>
    </div>
  );
}
