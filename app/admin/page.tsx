"use client";
import { useEffect, useState } from "react";

type Goal = {
  id: string; vendedor_id: string; vendedor_nome: string;
  meta_mensal: number; meta_clientes: number; updated_at: string; excluido?: boolean;
};
type MesDistrib = { mes: number; pct: number; valor: number };
type RealizadoMes = { mes: number; valor: number; fechado: boolean; atual: boolean };
type CompanyData = {
  ano: number; mesAtual: number; metaAnual: number;
  distribuicao: MesDistrib[] | null;
  sazonalidade: { mes: number; pct: number }[];
  realizado: RealizadoMes[];
  totalVendedoresMensal: number; totalVendedoresAnual: number;
  temHistorico: boolean;
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const SQL_TABLE = `CREATE TABLE IF NOT EXISTS vendedor_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  vendedor_id TEXT NOT NULL,
  vendedor_nome TEXT,
  meta_mensal NUMERIC(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, vendedor_id)
);

CREATE TABLE IF NOT EXISTS company_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  ano INTEGER NOT NULL,
  meta_anual NUMERIC(12,2) DEFAULT 0,
  distribuicao JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, ano)
);`;

export default function AdminPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [metaAnualInput, setMetaAnualInput] = useState("");
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [distribEdit, setDistribEdit] = useState<number[]>([]);
  const [distribuindo, setDistribuindo] = useState(false);
  const [distribPreview, setDistribPreview] = useState<{ vendedor_nome: string; peso: number; metaMensal: number; metaAnual: number; clientes: number }[] | null>(null);
  const [mediaClientes, setMediaClientes] = useState<Record<string, number>>({});
  const [editingClientes, setEditingClientes] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/vendedor-goals").then(r => r.json()),
      fetch("/api/admin/company-goals").then(r => r.json()),
    ]).then(([vd, cd]) => {
      setGoals(vd.goals ?? []);
      setMediaClientes(vd.mediaClientes ?? {});
      setTableError(vd.tableError ?? (cd.error ? cd.error : null));
      if (cd && !cd.error) {
        setCompany(cd);
        setMetaAnualInput(cd.metaAnual > 0 ? String(cd.metaAnual) : "");
        // Inicializar distribuição com sazonalidade se não houver salva
        const distrib = cd.distribuicao ?? cd.sazonalidade;
        setDistribEdit(distrib.map((d: { pct: number }) => Math.round(d.pct * 10) / 10));
      }
      setLoading(false);
    });
  }, []);

  function calcDistrib(metaAnual: number, pcts: number[]): number[] {
    return pcts.map(p => Math.round((metaAnual * p) / 100));
  }

  async function saveEmpresa() {
    const val = Number(metaAnualInput);
    if (!val || val <= 0) return;
    setSavingEmpresa(true);
    setMessage(null);
    const distribuicao = distribEdit.map((pct, i) => ({
      mes: i + 1, pct, valor: Math.round((val * pct) / 100),
    }));
    const res = await fetch("/api/admin/company-goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta_anual: val, distribuicao }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage(`Erro: ${data.error}`);
    } else {
      setCompany(prev => prev ? { ...prev, metaAnual: val, distribuicao } : prev);
      setMessage("Meta da empresa salva!");
      setTimeout(() => setMessage(null), 3000);
    }
    setSavingEmpresa(false);
  }

  function applySeasonality() {
    if (!company) return;
    setDistribEdit(company.sazonalidade.map(s => Math.round(s.pct * 10) / 10));
  }

  async function distributeToVendedores() {
    const val = Number(metaAnualInput);
    if (!val || val <= 0) return;
    setDistribuindo(true);
    setMessage(null);
    setDistribPreview(null);
    const res = await fetch("/api/admin/distribute-goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta_anual: val }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage(`Erro: ${data.error}`);
    } else {
      setDistribPreview(data.distribuicao);
      setMessage("Metas dos vendedores geradas automaticamente! Confira abaixo e ajuste se necessário.");
      // Recarregar lista de vendedores
      const vd = await fetch("/api/admin/vendedor-goals").then(r => r.json());
      setGoals(vd.goals ?? []);
    }
    setDistribuindo(false);
  }

  function distributeEqual() {
    setDistribEdit(Array(12).fill(Math.round(10000 / 12) / 100));
  }

  function startEdit(g: Goal) {
    setEditing(prev => ({ ...prev, [g.vendedor_id]: String(g.meta_mensal) }));
  }

  async function save(g: Goal) {
    const val = Number(editing[g.vendedor_id]);
    if (isNaN(val) || val < 0) return;
    setSaving(g.vendedor_id);
    setMessage(null);
    const res = await fetch("/api/admin/vendedor-goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedor_id: g.vendedor_id, vendedor_nome: g.vendedor_nome, meta_mensal: val }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage(`Erro: ${data.error}`);
    } else {
      setGoals(prev => prev.map(x => x.vendedor_id === g.vendedor_id ? { ...x, meta_mensal: val } : x));
      const newEditing = { ...editing };
      delete newEditing[g.vendedor_id];
      setEditing(newEditing);
      setMessage(`Meta de ${g.vendedor_nome} salva!`);
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(null);
  }

  async function saveMetaClientes(g: Goal) {
    const val = Number(editingClientes[g.vendedor_id]);
    if (isNaN(val) || val < 0) return;
    setSaving(g.vendedor_id + "_c");
    const res = await fetch("/api/admin/vendedor-goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedor_id: g.vendedor_id, vendedor_nome: g.vendedor_nome, meta_clientes: val }),
    });
    const data = await res.json();
    if (!data.error) {
      setGoals(prev => prev.map(x => x.vendedor_id === g.vendedor_id ? { ...x, meta_clientes: val } : x));
      const n = { ...editingClientes }; delete n[g.vendedor_id]; setEditingClientes(n);
      setMessage(`Meta de clientes de ${g.vendedor_nome} salva!`);
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(null);
  }

  async function aplicarMediaClientes() {
    for (const g of goalsAtivos) {
      const media = mediaClientes[g.vendedor_id];
      if (!media || media === g.meta_clientes) continue;
      await fetch("/api/admin/vendedor-goals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendedor_id: g.vendedor_id, vendedor_nome: g.vendedor_nome, meta_clientes: media }),
      });
    }
    const vd = await fetch("/api/admin/vendedor-goals").then(r => r.json());
    setGoals(vd.goals ?? []);
    setMediaClientes(vd.mediaClientes ?? {});
    setMessage("Médias históricas aplicadas!");
    setTimeout(() => setMessage(null), 3000);
  }

  function cancel(vid: string) {
    const newEditing = { ...editing };
    delete newEditing[vid];
    setEditing(newEditing);
  }

  async function toggleExcluido(g: Goal) {
    const novoExcluido = !g.excluido;
    setSaving(g.vendedor_id);
    setMessage(null);
    const res = await fetch("/api/admin/vendedor-goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendedor_id: g.vendedor_id, vendedor_nome: g.vendedor_nome,
        excluido: novoExcluido,
        ...(novoExcluido ? { meta_mensal: 0 } : {}),
      }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage(`Erro: ${data.error}`);
    } else {
      setGoals(prev => prev.map(x => x.vendedor_id === g.vendedor_id
        ? { ...x, excluido: novoExcluido, meta_mensal: novoExcluido ? 0 : x.meta_mensal }
        : x));
      setMessage(novoExcluido ? `${g.vendedor_nome} excluído da distribuição de metas.` : `${g.vendedor_nome} reativado.`);
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(null);
  }

  if (loading) return <div className="text-sm text-gray-400">Carregando...</div>;

  const metaAnualNum = Number(metaAnualInput) || 0;
  const goalsAtivos = goals.filter(g => !g.excluido);
  const goalsExcluidos = goals.filter(g => g.excluido);
  const totalVendMensal = goalsAtivos.reduce((s, g) => s + (Number(g.meta_mensal) || 0), 0);
  const totalVendAnual = totalVendMensal * 12;
  const metaBase = metaAnualNum > 0 ? metaAnualNum : (company?.metaAnual ?? 0);
  const distribValores = metaBase > 0 ? calcDistrib(metaBase, distribEdit) : [];
  const pctTotalDistrib = distribEdit.reduce((s, p) => s + p, 0);
  const pctCobertura = metaAnualNum > 0 ? Math.round((totalVendAnual / metaAnualNum) * 100) : null;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Metas da empresa e dos vendedores</p>
      </div>

      {message && (
        <div className={`text-sm px-4 py-3 rounded-lg ${message.startsWith("Erro") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
          {message}
        </div>
      )}

      {tableError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-800 space-y-3">
          <p><strong>Tabelas não encontradas.</strong> Rode o SQL abaixo no Supabase SQL Editor:</p>
          <pre className="bg-red-100 rounded p-3 text-xs overflow-x-auto">{SQL_TABLE}</pre>
          <p className="text-red-500 text-xs">{tableError}</p>
        </div>
      )}

      {!tableError && (
        <>
          {/* ─── META DA EMPRESA ─── */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Meta da Empresa — {company?.ano}</h2>
                <p className="text-sm text-gray-500">Define a meta anual e distribui por mês conforme sazonalidade histórica.</p>
              </div>
            </div>

            {/* Meta salva em destaque */}
            {(company?.metaAnual ?? 0) > 0 && (
              <div className="flex items-center gap-4 bg-blue-600 text-white rounded-xl px-5 py-4">
                <div className="flex-1">
                  <div className="text-xs font-medium text-blue-200 uppercase tracking-wide mb-0.5">Meta Anual Definida</div>
                  <div className="text-3xl font-bold">{fmt(company!.metaAnual)}</div>
                  <div className="text-sm text-blue-200 mt-0.5">= {fmt(company!.metaAnual / 12)} por mês</div>
                </div>
                {pctCobertura !== null && (
                  <div className="text-center bg-white/10 rounded-xl px-4 py-3">
                    <div className={`text-2xl font-bold ${pctCobertura >= 100 ? "text-green-300" : "text-orange-300"}`}>{pctCobertura}%</div>
                    <div className="text-xs text-blue-200">cobertura vendedores</div>
                  </div>
                )}
              </div>
            )}

            {/* Input meta anual */}
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {(company?.metaAnual ?? 0) > 0 ? "Alterar Meta Anual (R$)" : "Meta Anual da Empresa (R$)"}
                </label>
                <input
                  type="number"
                  value={metaAnualInput}
                  onChange={e => setMetaAnualInput(e.target.value)}
                  placeholder="Ex: 1200000"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              {metaAnualNum > 0 && metaAnualNum !== company?.metaAnual && (
                <div className="text-sm text-amber-600 font-medium">
                  Novo: <span className="font-bold">{fmt(metaAnualNum / 12)}</span>/mês
                </div>
              )}
            </div>

            {/* Comparativo com vendedores */}
            {metaAnualNum > 0 && totalVendAnual > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm flex gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-gray-500">Meta empresa/ano</div>
                  <div className="font-bold text-gray-900">{fmt(metaAnualNum)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Soma vendedores/ano</div>
                  <div className={`font-bold ${totalVendAnual >= metaAnualNum ? "text-green-600" : "text-orange-600"}`}>{fmt(totalVendAnual)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Diferença</div>
                  <div className={`font-bold ${totalVendAnual >= metaAnualNum ? "text-green-600" : "text-red-500"}`}>
                    {totalVendAnual >= metaAnualNum ? "+" : ""}{fmt(totalVendAnual - metaAnualNum)}
                  </div>
                </div>
              </div>
            )}

            {/* Distribuição mensal */}
            {(metaAnualNum > 0 || (company?.metaAnual ?? 0) > 0) && (
              <div>
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="text-xs font-medium text-gray-700">Distribuição por mês</span>
                  {company?.temHistorico && (
                    <button onClick={applySeasonality}
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100">
                      📈 Aplicar sazonalidade histórica
                    </button>
                  )}
                  <button onClick={distributeEqual}
                    className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-200">
                    ÷ Distribuir igual
                  </button>
                  <span className={`text-xs ml-auto ${Math.abs(pctTotalDistrib - 100) > 0.5 ? "text-red-500" : "text-green-600"}`}>
                    Total: {Math.round(pctTotalDistrib * 10) / 10}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {MESES.map((m, i) => {
                    const metaValor = distribValores[i] ?? 0;
                    const real = company?.realizado?.[i];
                    const isFechado = real?.fechado ?? false;
                    const isAtual = real?.atual ?? false;
                    const realValor = real?.valor ?? 0;
                    const maxVal = Math.max(...distribValores, ...(company?.realizado?.map(r => r.valor) ?? []), 1);
                    const metaBarPct = Math.round((metaValor / maxVal) * 100);
                    const realBarPct = Math.round((realValor / maxVal) * 100);
                    const pctReal = metaValor > 0 ? Math.round((realValor / metaValor) * 100) : null;
                    const realColor = pctReal === null ? "" : pctReal >= 100 ? "text-green-600" : pctReal >= 70 ? "text-blue-600" : "text-red-500";
                    return (
                      <div key={m} className={`rounded-lg p-2 border ${isAtual ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300" : isFechado ? "border-gray-200 bg-gray-50" : "border-indigo-300 bg-indigo-50"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-semibold ${isAtual ? "text-blue-700" : isFechado ? "text-gray-500" : "text-indigo-700"}`}>{m}</span>
                          {isAtual && <span className="text-[9px] bg-blue-500 text-white rounded px-1">atual</span>}
                          {!isFechado && !isAtual && <span className="text-[9px] text-indigo-400">✏</span>}
                        </div>

                        {/* Barra dupla: meta (cinza) + realizado (colorido) */}
                        <div className="space-y-0.5 mb-2">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden" title="Meta">
                            <div className="h-full bg-gray-400 rounded-full" style={{ width: `${metaBarPct}%` }} />
                          </div>
                          {(isFechado || isAtual) && (
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden" title="Realizado">
                              <div className={`h-full rounded-full ${pctReal && pctReal >= 100 ? "bg-green-400" : pctReal && pctReal >= 70 ? "bg-blue-400" : "bg-red-400"}`}
                                style={{ width: `${Math.min(realBarPct, 100)}%` }} />
                            </div>
                          )}
                        </div>

                        {/* Input % (só meses futuros) */}
                        {!isFechado && (
                          <input type="number" step="0.1" value={distribEdit[i] ?? ""}
                            onChange={e => { const newD = [...distribEdit]; newD[i] = Number(e.target.value); setDistribEdit(newD); }}
                            className={`w-full text-xs border rounded px-1 py-0.5 text-right focus:outline-none mb-1 ${isAtual ? "border-blue-300 bg-white focus:border-blue-500" : "border-indigo-300 bg-white focus:border-indigo-500"}`}
                            title="% do total anual" />
                        )}

                        {/* Valores */}
                        {(isFechado || isAtual) ? (
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-gray-400">meta</span>
                              <span className="text-gray-600">{fmt(metaValor)}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-gray-400">real</span>
                              <span className={`font-semibold ${realColor}`}>{fmt(realValor)}</span>
                            </div>
                            {pctReal !== null && (
                              <div className={`text-[10px] text-right font-bold ${realColor}`}>{pctReal}%</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-indigo-700 text-right">{fmt(metaValor)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3 flex-wrap items-center">
              <button onClick={saveEmpresa} disabled={savingEmpresa || metaAnualNum <= 0}
                className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {savingEmpresa ? "Salvando..." : "Salvar meta da empresa"}
              </button>
              <button onClick={distributeToVendedores} disabled={distribuindo || metaAnualNum <= 0}
                className="bg-emerald-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                {distribuindo ? "Gerando..." : "🎯 Gerar metas dos vendedores automaticamente"}
              </button>
              <span className="text-xs text-gray-400">
                Distribui proporcional ao histórico de cada vendedor (70% valor vendido + 30% tamanho da carteira, últimos 6 meses)
              </span>
            </div>

            {/* Preview da distribuição gerada */}
            {distribPreview && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold text-emerald-700 mb-2">Metas geradas — revise na tabela abaixo</div>
                {distribPreview.map(d => (
                  <div key={d.vendedor_nome} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-gray-800">{d.vendedor_nome}</span>
                      <span className="text-xs text-gray-400 ml-2">{d.clientes} clientes · peso {d.peso}%</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-emerald-700">{fmt(d.metaMensal)}/mês</div>
                      <div className="text-xs text-gray-400">{fmt(d.metaAnual)}/ano</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <hr className="border-gray-100" />

          {/* ─── RESUMO VENDEDORES ─── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Metas dos Vendedores</h2>
              {Object.keys(mediaClientes).length > 0 && (
                <button onClick={aplicarMediaClientes}
                  className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700">
                  📊 Aplicar média histórica de clientes
                </button>
              )}
              {totalVendMensal > 0 && (
                <div className="text-right text-sm">
                  <div className="text-gray-500">Total mensal <span className="font-bold text-gray-900">{fmt(totalVendMensal)}</span></div>
                  <div className="text-gray-500">Total anual <span className="font-bold text-gray-900">{fmt(totalVendAnual)}</span></div>
                </div>
              )}
            </div>

            {goals.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800">
                Nenhum vendedor encontrado. Sincronize as vendas em <strong>Integrações → Sincronizar Itens</strong>.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">Vendedor</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">Meta Faturamento</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">Meta Clientes</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">Anual</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {goalsAtivos.map(g => {
                      const isEditing = g.vendedor_id in editing;
                      const editVal = editing[g.vendedor_id] ?? "";
                      const numVal = Number(editVal) || 0;
                      const sharePct = totalVendMensal > 0 ? Math.round((g.meta_mensal / totalVendMensal) * 100) : 0;
                      return (
                        <tr key={g.vendedor_id} className="border-b border-gray-50 last:border-0">
                          <td className="px-5 py-4">
                            <div className="font-medium text-gray-900">{g.vendedor_nome || g.vendedor_id}</div>
                            {totalVendMensal > 0 && g.meta_mensal > 0 && (
                              <div className="mt-1 h-1 bg-gray-100 rounded-full w-32 overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${sharePct}%` }} />
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {isEditing ? (
                              <input type="number" value={editVal}
                                onChange={e => setEditing(prev => ({ ...prev, [g.vendedor_id]: e.target.value }))}
                                className="border border-blue-300 rounded px-2 py-1 w-32 text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                                onKeyDown={e => { if (e.key === "Enter") save(g); if (e.key === "Escape") cancel(g.vendedor_id); }}
                                autoFocus />
                            ) : (
                              <span className={`font-semibold ${g.meta_mensal > 0 ? "text-gray-900" : "text-gray-300"}`}>
                                {g.meta_mensal > 0 ? fmt(g.meta_mensal) : "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {g.vendedor_id in editingClientes ? (
                              <div className="flex gap-1 justify-end items-center">
                                <input type="number" value={editingClientes[g.vendedor_id]}
                                  onChange={e => setEditingClientes(prev => ({ ...prev, [g.vendedor_id]: e.target.value }))}
                                  className="border border-purple-300 rounded px-2 py-1 w-20 text-right text-sm focus:outline-none"
                                  onKeyDown={e => { if (e.key === "Enter") saveMetaClientes(g); }}
                                  autoFocus />
                                <button onClick={() => saveMetaClientes(g)} className="text-xs bg-purple-600 text-white px-2 py-1 rounded">OK</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditingClientes(prev => ({ ...prev, [g.vendedor_id]: String(g.meta_clientes || mediaClientes[g.vendedor_id] || "") }))}
                                className="text-right w-full">
                                <span className={`font-semibold ${g.meta_clientes > 0 ? "text-gray-900" : "text-gray-300"}`}>
                                  {g.meta_clientes > 0 ? `${g.meta_clientes} clientes` : "—"}
                                </span>
                                {!g.meta_clientes && mediaClientes[g.vendedor_id] && (
                                  <div className="text-[10px] text-purple-500">sugerido: {mediaClientes[g.vendedor_id]}</div>
                                )}
                              </button>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right text-gray-500">
                            {isEditing ? (numVal > 0 ? fmt(numVal * 12) : "—") : (g.meta_mensal > 0 ? fmt(g.meta_mensal * 12) : "—")}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {isEditing ? (
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => save(g)} disabled={saving === g.vendedor_id}
                                  className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
                                  {saving === g.vendedor_id ? "..." : "Salvar"}
                                </button>
                                <button onClick={() => cancel(g.vendedor_id)}
                                  className="text-xs text-gray-500 px-2 py-1.5 hover:text-gray-700">Cancelar</button>
                              </div>
                            ) : (
                              <div className="flex gap-3 justify-end items-center">
                                <button onClick={() => startEdit(g)}
                                  className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                                <button onClick={() => toggleExcluido(g)} disabled={saving === g.vendedor_id}
                                  className="text-xs text-red-500 hover:underline font-medium disabled:opacity-50">
                                  {saving === g.vendedor_id ? "..." : "Excluir"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Linha de total */}
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td className="px-5 py-3 font-bold text-gray-800">Total ({goalsAtivos.length} ativos)</td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalVendMensal)}</td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalVendMensal * 3)}</td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalVendAnual)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Vendedores excluídos */}
            {goalsExcluidos.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-2.5 text-xs font-medium text-gray-500 bg-gray-100">
                  Excluídos da distribuição ({goalsExcluidos.length}) — não contam na meta da empresa nem em Metas de Vendas
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {goalsExcluidos.map(g => (
                      <tr key={g.vendedor_id} className="border-b border-gray-100 last:border-0">
                        <td className="px-5 py-3 text-gray-400 line-through">{g.vendedor_nome || g.vendedor_id}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => toggleExcluido(g)} disabled={saving === g.vendedor_id}
                            className="text-xs text-emerald-600 hover:underline font-medium disabled:opacity-50">
                            {saving === g.vendedor_id ? "..." : "Reativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
