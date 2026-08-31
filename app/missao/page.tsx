"use client";
import { useEffect, useState, useCallback } from "react";

type ClienteInativo = { id: string; nome: string; ultimoMes: string; mesesSemCompra: number };
type Vendedor = {
  id: string; nome: string;
  metaMensal: number; metaDia: number; metaDiaRestante: number;
  faturadoHoje: number; faturadoMes: number;
  pctDia: number | null; pctMes: number | null;
  totalInativos: number; reativacoesHoje: number; reativadosHoje: number;
  inativosPrioritarios: ClienteInativo[];
};
type MissaoData = { vendedores: Vendedor[]; diasRestantes: number; diasTotais: number; hoje: string };

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function getMesLabel(m: string) {
  const [y, mo] = m.split("-");
  return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mo)-1] + "/" + y.slice(2);
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const capped = Math.min(pct, 100);
  return (
    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${capped}%` }} />
    </div>
  );
}

function VendedorCard({ v, isGestor, diasRestantes }: { v: Vendedor; isGestor: boolean; diasRestantes: number }) {
  const metaOk = v.pctDia !== null && v.pctDia >= 100;
  const reatiuOk = v.reativadosHoje >= v.reativacoesHoje;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{v.nome}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Missão de hoje</p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
          metaOk && reatiuOk ? "bg-green-100 text-green-700" :
          metaOk || reatiuOk ? "bg-blue-100 text-blue-700" :
          "bg-orange-100 text-orange-700"
        }`}>
          {metaOk && reatiuOk ? "✓ Missão completa" : metaOk ? "✓ Meta batida" : reatiuOk ? "✓ Clientes reativados" : "⚡ Em andamento"}
        </span>
      </div>

      {/* Meta do dia */}
      <div className="bg-blue-50 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-blue-800">💰 Meta do dia</span>
          <span className={`text-lg font-bold ${metaOk ? "text-green-600" : "text-blue-700"}`}>
            {v.pctDia !== null ? `${v.pctDia}%` : "—"}
          </span>
        </div>
        <ProgressBar pct={v.pctDia ?? 0} color={metaOk ? "bg-green-500" : v.pctDia && v.pctDia >= 60 ? "bg-blue-500" : "bg-orange-400"} />
        <div className="flex justify-between text-xs text-blue-600">
          <span>Faturado hoje: <strong>{fmt(v.faturadoHoje)}</strong></span>
          <span>Meta: <strong>{fmt(v.metaDia)}</strong></span>
        </div>
        {v.metaDiaRestante > v.metaDia && (
          <p className="text-xs text-orange-600">⚠ Para compensar o mês: {fmt(v.metaDiaRestante)}/dia</p>
        )}
      </div>

      {/* Reativações */}
      <div className="bg-purple-50 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-purple-800">🎯 Clientes a reativar hoje</span>
          <span className={`text-lg font-bold ${reatiuOk ? "text-green-600" : "text-purple-700"}`}>
            {v.reativadosHoje}/{v.reativacoesHoje}
          </span>
        </div>
        <ProgressBar
          pct={v.reativacoesHoje > 0 ? Math.round((v.reativadosHoje / v.reativacoesHoje) * 100) : 100}
          color={reatiuOk ? "bg-green-500" : "bg-purple-500"}
        />
        <p className="text-xs text-purple-600">
          {v.totalInativos} clientes inativos na carteira · {diasRestantes} dias úteis restantes
        </p>
      </div>

      {/* Lista de inativos prioritários */}
      {v.inativosPrioritarios.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            📋 Prioritários para contatar hoje
          </p>
          <div className="space-y-2">
            {v.inativosPrioritarios.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                i < v.reativacoesHoje ? "bg-red-50 border border-red-100" : "bg-gray-50"
              }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                  i < v.reativacoesHoje ? "bg-red-500" : "bg-gray-300"
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.nome}</p>
                  <p className="text-xs text-gray-400">
                    Última compra: {getMesLabel(c.ultimoMes)} ·{" "}
                    <span className={c.mesesSemCompra >= 3 ? "text-red-500 font-semibold" : c.mesesSemCompra >= 2 ? "text-orange-500" : "text-yellow-600"}>
                      {c.mesesSemCompra} {c.mesesSemCompra === 1 ? "mês" : "meses"} sem comprar
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progresso mês (só gestor vê todos, vendedor vê o próprio) */}
      {isGestor && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progresso do mês</span>
            <span>{v.pctMes ?? 0}% da meta mensal</span>
          </div>
          <ProgressBar pct={v.pctMes ?? 0} color={v.pctMes && v.pctMes >= 100 ? "bg-green-500" : v.pctMes && v.pctMes >= 70 ? "bg-blue-500" : "bg-orange-400"} />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{fmt(v.faturadoMes)}</span>
            <span>{fmt(v.metaMensal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MissaoPage() {
  const [data, setData] = useState<MissaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGestor, setIsGestor] = useState(true);
  const [vendedorSel, setVendedorSel] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/missao").then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-atualiza a cada 5 minutos
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div className="text-sm text-gray-400">Carregando missão do dia...</div>;
  if (!data) return <div className="text-sm text-red-600">Erro ao carregar.</div>;

  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hojeLabel = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const vendedoresVisiveis = isGestor
    ? data.vendedores
    : vendedorSel
      ? data.vendedores.filter(v => v.id === vendedorSel)
      : data.vendedores;

  // Totais para visão gestor
  const totalFaturadoHoje = data.vendedores.reduce((s, v) => s + v.faturadoHoje, 0);
  const totalMetaDia = data.vendedores.reduce((s, v) => s + v.metaDia, 0);
  const totalInativos = data.vendedores.reduce((s, v) => s + v.totalInativos, 0);
  const totalReativados = data.vendedores.reduce((s, v) => s + v.reativadosHoje, 0);
  const totalReativacoesHoje = data.vendedores.reduce((s, v) => s + v.reativacoesHoje, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Missão do Dia</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">{hojeLabel} · {data.diasRestantes} dias úteis restantes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setIsGestor(true); setVendedorSel(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${isGestor ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
            👁 Visão gestor
          </button>
          {data.vendedores.map(v => (
            <button key={v.id} onClick={() => { setIsGestor(false); setVendedorSel(v.id); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${!isGestor && vendedorSel === v.id ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:border-purple-400"}`}>
              {v.nome}
            </button>
          ))}
          <button onClick={load} className="px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white text-gray-500 hover:bg-gray-50" title="Atualizar">
            ↻
          </button>
        </div>
      </div>

      {/* Cards resumo gestor */}
      {isGestor && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-blue-600 rounded-xl p-4">
            <p className="text-xs text-blue-100 mb-1">Faturado hoje</p>
            <p className="text-xl font-bold text-white">{fmt(totalFaturadoHoje)}</p>
            <p className="text-xs text-blue-200 mt-0.5">meta: {fmt(totalMetaDia)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">% da meta do dia</p>
            <p className="text-xl font-bold text-gray-800">
              {totalMetaDia > 0 ? Math.round((totalFaturadoHoje / totalMetaDia) * 100) : 0}%
            </p>
            <p className="text-xs text-gray-400 mt-0.5">equipe toda</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Inativos reativados</p>
            <p className="text-xl font-bold text-gray-800">{totalReativados}/{totalReativacoesHoje}</p>
            <p className="text-xs text-gray-400 mt-0.5">meta do dia</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total inativos</p>
            <p className="text-xl font-bold text-gray-800">{totalInativos}</p>
            <p className="text-xs text-gray-400 mt-0.5">na carteira da equipe</p>
          </div>
        </div>
      )}

      {/* Cards de vendedores */}
      <div className={isGestor ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "max-w-xl"}>
        {vendedoresVisiveis.map(v => (
          <VendedorCard key={v.id} v={v} isGestor={isGestor} diasRestantes={data.diasRestantes} />
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center">Atualiza automaticamente a cada 5 minutos</p>
    </div>
  );
}
