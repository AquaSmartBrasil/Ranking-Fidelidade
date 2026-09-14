"use client";
import { useEffect, useState, useCallback } from "react";
import { ClienteModal } from "@/app/components/ClienteModal";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type ClienteInfo = { id: string; nome: string; ultimoMes: string; mesesSemCompra: number };
type Linha = { linha: number; nome: string; emoji: string; meta: number; vendido: number; pct: number | null };
type Vendedor = {
  id: string; nome: string;
  metaMensal: number; metaDia: number; metaDiaRestante: number;
  faturadoHoje: number; faturadoMes: number;
  pctDia: number | null; pctMes: number | null;
  totalCarteira: number; totalInativos: number; totalUrgencia: number;
  reativacoesHoje: number; reativadosHoje: number;
  criticos: ClienteInfo[];
  atencao: ClienteInfo[];
  alerta: ClienteInfo[];
  urgencia: ClienteInfo[];
  linhas: Linha[];
};
type MissaoData = { vendedores: Vendedor[]; diasRestantes: number; diasTotais: number; hoje: string };

// resultado do log de contato
type ContactResult = "contacted" | "no_answer" | "postponed";
type ContactLog = { cliente_ca_id: string; result: ContactResult };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function getMesLabel(m: string) {
  if (!m) return "?";
  const [y, mo] = m.split("-");
  return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(mo)-1] + "/" + y.slice(2);
}

function ProgressBar({ pct, color, thin }: { pct: number; color: string; thin?: boolean }) {
  const capped = Math.min(pct, 100);
  return (
    <div className={`${thin ? "h-1.5" : "h-2.5"} bg-gray-100 rounded-full overflow-hidden`}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${capped}%` }} />
    </div>
  );
}

function UrgBadge({ n }: { n: number }) {
  if (n >= 4) return <span className="text-[11px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full">{n}m 🚨</span>;
  if (n === 3) return <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{n}m 🔴</span>;
  if (n === 2) return <span className="text-[11px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{n}m 🟠</span>;
  return <span className="text-[11px] text-gray-400 px-2 py-0.5 rounded-full">{n === 0 ? "este mês" : `${n}m`}</span>;
}

// ─── Botões de contato ────────────────────────────────────────────────────────
function ContactButtons({ clienteId, clienteNome, vendedorId, vendedorNome, log, onLogged }: {
  clienteId: string;
  clienteNome: string;
  vendedorId: string;
  vendedorNome: string;
  log: ContactLog | undefined;
  onLogged: (clienteId: string, result: ContactResult) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function register(result: ContactResult) {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/contact-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendedorId, vendedorNome, clienteId, clienteNome, result }),
      });
      onLogged(clienteId, result);
    } finally {
      setSaving(false);
    }
  }

  const btns: { result: ContactResult; label: string; activeClass: string; inactiveClass: string }[] = [
    { result: "contacted",  label: "✅ Contatei",     activeClass: "bg-green-500 text-white border-green-500",   inactiveClass: "bg-white text-gray-500 border-gray-200 hover:border-green-400 hover:text-green-600" },
    { result: "no_answer",  label: "📵 Sem resposta", activeClass: "bg-gray-500 text-white border-gray-500",     inactiveClass: "bg-white text-gray-500 border-gray-200 hover:border-gray-400" },
    { result: "postponed",  label: "➡️ Amanhã",       activeClass: "bg-blue-500 text-white border-blue-500",     inactiveClass: "bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-600" },
  ];

  return (
    <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
      {btns.map(b => (
        <button
          key={b.result}
          onClick={() => register(b.result)}
          disabled={saving}
          className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg border transition-all ${
            log?.result === b.result ? b.activeClass : b.inactiveClass
          } ${saving ? "opacity-50 cursor-wait" : ""}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

// ─── Card de cliente com botões ───────────────────────────────────────────────
function ClienteRow({ c, vendedorId, vendedorNome, log, onSelect, onLogged }: {
  c: ClienteInfo;
  vendedorId: string;
  vendedorNome: string;
  log: ContactLog | undefined;
  onSelect: () => void;
  onLogged: (clienteId: string, result: ContactResult) => void;
}) {
  const m = c.mesesSemCompra;
  const isUrgencia = m >= 4;
  const isCritico = m === 3;
  const isAtencao = m === 2;
  const isDone = log?.result === "contacted";
  const isPostponed = log?.result === "postponed";

  return (
    <div className={`rounded-xl border transition-colors ${
      isDone     ? "bg-green-50 border-green-200 opacity-70" :
      isPostponed? "bg-blue-50 border-blue-200 opacity-60" :
      isUrgencia ? "bg-red-50 border-red-300" :
      isCritico  ? "bg-red-50 border-red-200" :
      isAtencao  ? "bg-orange-50 border-orange-200" :
                   "bg-gray-50 border-gray-100"
    }`}>
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${
            isDone ? "line-through text-gray-400" :
            isPostponed ? "text-blue-500" :
            isUrgencia || isCritico ? "text-red-800" :
            isAtencao ? "text-orange-800" : "text-gray-800"
          }`}>{c.nome}</p>
          {c.ultimoMes && (
            <p className="text-xs text-gray-400">Última compra: {getMesLabel(c.ultimoMes)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {log ? (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              isDone ? "bg-green-100 text-green-700" :
              isPostponed ? "bg-blue-100 text-blue-700" :
              "bg-gray-100 text-gray-500"
            }`}>
              {isDone ? "✓ ok" : isPostponed ? "→ amanhã" : "📵"}
            </span>
          ) : (
            <UrgBadge n={m} />
          )}
          <span className="text-gray-300 text-sm">›</span>
        </div>
      </button>
      <div className="px-3 pb-2.5">
        <ContactButtons
          clienteId={c.id}
          clienteNome={c.nome}
          vendedorId={vendedorId}
          vendedorNome={vendedorNome}
          log={log}
          onLogged={onLogged}
        />
      </div>
    </div>
  );
}

// ─── KPI Bar de contatos ──────────────────────────────────────────────────────
function KpiContatos({ logs, meta }: { logs: ContactLog[]; meta: number }) {
  const contacted = logs.filter(l => l.result === "contacted").length;
  const noAnswer  = logs.filter(l => l.result === "no_answer").length;
  const postponed = logs.filter(l => l.result === "postponed").length;
  const total = contacted + noAnswer + postponed;
  const pct = meta > 0 ? Math.round((total / meta) * 100) : 0;

  return (
    <div className={`rounded-xl border-2 p-4 ${pct >= 100 ? "bg-green-50 border-green-300" : "bg-white border-gray-200"}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">📞 Contatos do dia</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct >= 100 ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"}`}>
          {total}/{meta}
        </span>
      </div>
      <ProgressBar pct={pct} color={pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : "bg-orange-400"} />
      <div className="flex gap-3 mt-2 text-xs">
        <span className="text-green-600 font-semibold">✅ {contacted} contatados</span>
        <span className="text-gray-400">📵 {noAnswer} sem resp.</span>
        <span className="text-blue-500">➡️ {postponed} amanhã</span>
      </div>
    </div>
  );
}

// ─── Visão de um vendedor ─────────────────────────────────────────────────────
function VendedorView({ v, diasRestantes }: { v: Vendedor; diasRestantes: number }) {
  const [clienteSel, setClienteSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const META_CONTATOS = 15;

  // Carregar logs do dia ao montar
  useEffect(() => {
    fetch(`/api/contact-log?vendedor=${v.id}`)
      .then(r => r.json())
      .then(d => {
        setLogs((d.logs ?? []).map((l: { cliente_ca_id: string; result: ContactResult }) => ({
          cliente_ca_id: l.cliente_ca_id,
          result: l.result,
        })));
      });
  }, [v.id]);

  function handleLogged(clienteId: string, result: ContactResult) {
    setLogs(prev => {
      const filtered = prev.filter(l => l.cliente_ca_id !== clienteId);
      return [...filtered, { cliente_ca_id: clienteId, result }];
    });
  }

  const metaOk = v.pctDia !== null && v.pctDia >= 100;
  const reatiuOk = v.reativadosHoje >= v.reativacoesHoje && v.reativacoesHoje > 0;

  const todosClientes: ClienteInfo[] = [
    ...v.urgencia,
    ...v.criticos,
    ...v.atencao,
    ...v.alerta,
  ];

  // Postponed clientes vão para o final
  const logMap = new Map(logs.map(l => [l.cliente_ca_id, l]));
  const pendentes = todosClientes.filter(c => {
    const l = logMap.get(c.id);
    return !l || l.result === "no_answer";
  });
  const feitos = todosClientes.filter(c => {
    const l = logMap.get(c.id);
    return l && (l.result === "contacted" || l.result === "postponed");
  });
  const ordenados = [...pendentes, ...feitos];

  const filtrados = busca.trim()
    ? ordenados.filter(c => c.nome.toUpperCase().includes(busca.toUpperCase()))
    : ordenados;

  const linhaAlerta = v.linhas.reduce<Linha | null>((min, l) => {
    if (l.pct === null) return min;
    if (!min || (l.pct < (min.pct ?? 100))) return l;
    return min;
  }, null);

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho */}
      <div className={`rounded-2xl px-6 py-5 ${reatiuOk && metaOk ? "bg-green-500" : "bg-gray-900"}`}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-white/50 uppercase tracking-wider">Missão do dia</p>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            reatiuOk && metaOk ? "bg-white text-green-600" :
            reatiuOk || metaOk ? "bg-white/20 text-white" : "bg-orange-500 text-white"
          }`}>
            {reatiuOk && metaOk ? "✓ Missão completa!" : metaOk ? "✓ Meta batida" : "⚡ Em andamento"}
          </span>
        </div>
        <h2 className="text-2xl font-black text-white">{v.nome}</h2>
      </div>

      {/* ── KPI de contatos do dia — DESTAQUE */}
      <KpiContatos logs={logs} meta={META_CONTATOS} />

      {/* ── KPIs financeiros */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Meta mensal</p>
          <p className="text-xl font-bold text-gray-800">{v.pctMes ?? 0}%</p>
          <ProgressBar pct={v.pctMes ?? 0} thin color={v.pctMes && v.pctMes >= 100 ? "bg-green-500" : v.pctMes && v.pctMes >= 70 ? "bg-blue-500" : "bg-orange-400"} />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{fmt(v.faturadoMes)}</span><span>{fmt(v.metaMensal)}</span>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Faturado hoje</p>
          <p className={`text-xl font-bold ${metaOk ? "text-green-600" : "text-gray-800"}`}>{fmt(v.faturadoHoje)}</p>
          {v.faturadoMes < v.metaMensal && (
            <p className="text-xs text-orange-500 mt-1">Falta {fmt(v.metaMensal - v.faturadoMes)}</p>
          )}
        </div>
      </div>

      {/* ── Missão de reativação */}
      <div className={`rounded-2xl p-5 text-center border-2 ${reatiuOk ? "bg-green-50 border-green-300" : "bg-orange-50 border-orange-300"}`}>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Reativações prioritárias</p>
        <p className={`text-5xl font-black ${reatiuOk ? "text-green-600" : "text-orange-600"}`}>
          {v.reativadosHoje}<span className="text-3xl text-gray-400">/{v.reativacoesHoje}</span>
        </p>
        <p className={`text-sm font-bold mt-1 ${reatiuOk ? "text-green-700" : "text-orange-700"}`}>
          {reatiuOk ? "✓ Todos os prioritários contatados!" : `Contatar ${v.reativacoesHoje} clientes prioritários`}
        </p>
        <p className="text-xs text-gray-400 mt-1">{diasRestantes} dias úteis restantes</p>
        <div className="mt-3">
          <ProgressBar pct={v.reativacoesHoje > 0 ? Math.round((v.reativadosHoje / v.reativacoesHoje) * 100) : 100}
            color={reatiuOk ? "bg-green-500" : "bg-orange-400"} />
        </div>
      </div>

      {/* ── Metas de unidades por linha */}
      {v.linhas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📦 Meta de unidades do dia</p>
            {linhaAlerta && linhaAlerta.pct !== null && linhaAlerta.pct < 60 && (
              <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                Foco: {linhaAlerta.emoji} {linhaAlerta.nome}
              </span>
            )}
          </div>
          {v.linhas.map(l => (
            <div key={l.linha} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className={`font-medium ${l.pct !== null && l.pct < 40 ? "text-orange-700 font-bold" : "text-gray-700"}`}>
                  {l.emoji} {l.nome}
                </span>
                <span className={`font-bold ${l.pct !== null && l.pct >= 100 ? "text-green-600" : l.pct !== null && l.pct < 40 ? "text-orange-600" : "text-gray-600"}`}>
                  {l.vendido}/{l.meta} frascos
                  {l.pct !== null && <span className="ml-1 text-xs text-gray-400">({l.pct}%)</span>}
                </span>
              </div>
              <ProgressBar thin pct={l.pct ?? 0} color={
                l.pct !== null && l.pct >= 100 ? "bg-green-500" :
                l.pct !== null && l.pct >= 60 ? "bg-blue-500" :
                l.pct !== null && l.pct < 40 ? "bg-orange-400" : "bg-gray-300"
              } />
            </div>
          ))}
        </div>
      )}

      {/* ── Lista de clientes com botões de contato */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">
            📋 Carteira — {v.totalCarteira} clientes
            {v.totalUrgencia > 0 && <span className="ml-2 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">🚨 {v.totalUrgencia} urgentes</span>}
            {v.totalInativos > 0 && <span className="ml-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">⚠ {v.totalInativos} inativos</span>}
          </p>
        </div>

        <input
          type="text"
          placeholder="Buscar cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        {!busca && (
          <>
            {/* Urgência */}
            {v.urgencia.filter(c => !["contacted","postponed"].includes(logMap.get(c.id)?.result ?? "")).length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">🚨 Urgência (4–6 meses)</span>
                  <span className="bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full">
                    {v.urgencia.filter(c => !["contacted","postponed"].includes(logMap.get(c.id)?.result ?? "")).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {v.urgencia.filter(c => !["contacted","postponed"].includes(logMap.get(c.id)?.result ?? "")).map(c => (
                    <ClienteRow key={c.id} c={c} vendedorId={v.id} vendedorNome={v.nome}
                      log={logMap.get(c.id)} onSelect={() => setClienteSel(c.id)} onLogged={handleLogged} />
                  ))}
                </div>
              </div>
            )}

            {/* Prioritários pendentes */}
            {[...v.criticos, ...v.atencao].filter(c => !["contacted","postponed"].includes(logMap.get(c.id)?.result ?? "")).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Prioritários (2–3 meses)</p>
                <div className="space-y-2">
                  {[...v.criticos, ...v.atencao].filter(c => !["contacted","postponed"].includes(logMap.get(c.id)?.result ?? "")).map(c => (
                    <ClienteRow key={c.id} c={c} vendedorId={v.id} vendedorNome={v.nome}
                      log={logMap.get(c.id)} onSelect={() => setClienteSel(c.id)} onLogged={handleLogged} />
                  ))}
                </div>
              </div>
            )}

            {/* Alerta pendentes */}
            {v.alerta.filter(c => !["contacted","postponed"].includes(logMap.get(c.id)?.result ?? "")).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Outros inativos</p>
                <div className="space-y-2">
                  {v.alerta.filter(c => !["contacted","postponed"].includes(logMap.get(c.id)?.result ?? "")).map(c => (
                    <ClienteRow key={c.id} c={c} vendedorId={v.id} vendedorNome={v.nome}
                      log={logMap.get(c.id)} onSelect={() => setClienteSel(c.id)} onLogged={handleLogged} />
                  ))}
                </div>
              </div>
            )}

            {/* Feitos (contatados e adiados) */}
            {feitos.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">✓ Feitos hoje ({feitos.length})</p>
                <div className="space-y-2">
                  {feitos.map(c => (
                    <ClienteRow key={c.id} c={c} vendedorId={v.id} vendedorNome={v.nome}
                      log={logMap.get(c.id)} onSelect={() => setClienteSel(c.id)} onLogged={handleLogged} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {busca && (
          <div className="space-y-2">
            {filtrados.length === 0
              ? <p className="text-sm text-gray-400 text-center py-4">Nenhum cliente encontrado</p>
              : filtrados.map(c => (
                  <ClienteRow key={c.id} c={c} vendedorId={v.id} vendedorNome={v.nome}
                    log={logMap.get(c.id)} onSelect={() => setClienteSel(c.id)} onLogged={handleLogged} />
                ))
            }
          </div>
        )}
      </div>

      {/* Modal */}
      {clienteSel && (
        <ClienteModal
          clienteId={clienteSel}
          vendedorId={v.id}
          onClose={() => setClienteSel(null)}
        />
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function MissaoPage() {
  const [data, setData] = useState<MissaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [vendedorSel, setVendedorSel] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/missao").then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (data?.vendedores?.length && !vendedorSel) {
      setVendedorSel(data.vendedores[0].id);
    }
  }, [data, vendedorSel]);

  if (loading) return <div className="text-sm text-gray-400 py-16 text-center">Carregando...</div>;
  if (!data?.vendedores?.length) return <div className="text-sm text-red-500 py-8">Sem dados. Configure as metas no Admin.</div>;

  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hojeLabel = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const vendedorAtual = data.vendedores.find(v => v.id === vendedorSel) ?? data.vendedores[0];

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚡ Missão do Dia</h1>
          <p className="text-sm text-gray-500 capitalize mt-0.5">{hojeLabel} · {data.diasRestantes} dias úteis restantes</p>
        </div>
        <div className="flex items-center gap-2">
          {data.vendedores.map(v => (
            <button key={v.id}
              onClick={() => setVendedorSel(v.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${vendedorSel === v.id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
            >
              {v.nome.split(" ")[0]}
            </button>
          ))}
          <button onClick={load} className="px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">↻</button>
        </div>
      </div>

      {vendedorAtual && (
        <VendedorView v={vendedorAtual} diasRestantes={data.diasRestantes} />
      )}

      <p className="text-xs text-gray-400 text-center pb-4">Atualiza automaticamente a cada 5 minutos</p>
    </div>
  );
}
