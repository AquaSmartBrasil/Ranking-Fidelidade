import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Dias úteis (seg-sex) restantes no mês a partir de hoje (inclusive)
function diasUteisRestantes(brNow: Date): number {
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth(); // 0-based
  const hoje = brNow.getUTCDate();
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = hoje; d <= ultimoDia; d++) {
    const dow = new Date(Date.UTC(ano, mes, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count || 1;
}

// Dias úteis totais no mês
function diasUteisMes(brNow: Date): number {
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= ultimoDia; d++) {
    const dow = new Date(Date.UTC(ano, mes, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count || 1;
}

const EXCLUDE = '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")';

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth() + 1;
  const hoje = `${ano}-${String(mes).padStart(2, "0")}-${String(brNow.getUTCDate()).padStart(2, "0")}`;
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const diasRestantes = diasUteisRestantes(brNow);
  const diasTotais = diasUteisMes(brNow);

  // Metas dos vendedores ativos
  const { data: goals } = await supabaseAdmin
    .from("vendedor_goals")
    .select("vendedor_id, vendedor_nome, meta_mensal, meta_clientes")
    .eq("company_id", companyId)
    .eq("excluido", false);

  if (!goals?.length) return NextResponse.json({ vendedores: [], diasRestantes, diasTotais });

  // Vendas do mês inteiro
  const { data: salesMes } = await supabaseAdmin
    .from("sales")
    .select("id, sale_date, total_amount, raw_json")
    .eq("company_id", companyId)
    .gte("sale_date", inicioMes)
    .lte("sale_date", fimMes)
    .not("status", "in", EXCLUDE)
    .limit(5000);

  // Vendas de hoje
  const { data: salesToday } = await supabaseAdmin
    .from("sales")
    .select("total_amount, raw_json")
    .eq("company_id", companyId)
    .eq("sale_date", hoje)
    .not("status", "in", EXCLUDE)
    .limit(1000);

  // Histórico últimos 6 meses para identificar carteira ativa
  const inicioHistorico = `${mes <= 6 ? ano - 1 : ano}-${String(mes <= 6 ? mes + 6 : mes - 6).padStart(2, "0")}-01`;
  const { data: salesHist } = await supabaseAdmin
    .from("sales")
    .select("total_amount, raw_json")
    .eq("company_id", companyId)
    .gte("sale_date", inicioHistorico)
    .lt("sale_date", inicioMes)
    .not("status", "in", EXCLUDE)
    .limit(5000);

  const vendedores = goals.map((g) => {
    const metaMensal = g.meta_mensal ?? 0;
    const metaDia = metaMensal > 0 ? Math.ceil(metaMensal / diasTotais) : 0;
    const metaDiaRestante = metaMensal > 0 ? Math.ceil(metaMensal / diasRestantes) : 0;

    // Faturado hoje por este vendedor
    const faturadoHoje = (salesToday ?? [])
      .filter(s => (s.raw_json as { vendedor?: { id?: string } } | null)?.vendedor?.id === g.vendedor_id)
      .reduce((acc, s) => acc + (s.total_amount ?? 0), 0);

    // Faturado no mês por este vendedor
    const faturadoMes = (salesMes ?? [])
      .filter(s => (s.raw_json as { vendedor?: { id?: string } } | null)?.vendedor?.id === g.vendedor_id)
      .reduce((acc, s) => acc + (s.total_amount ?? 0), 0);

    // Clientes que compraram esse mês deste vendedor
    const clientesMes = new Set<string>();
    for (const s of salesMes ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string; nome?: string } } | null;
      if (raw?.vendedor?.id === g.vendedor_id && raw?.cliente?.id) {
        clientesMes.add(raw.cliente.id);
      }
    }

    // Clientes ativos nos últimos 6 meses deste vendedor (carteira)
    type ClienteInfo = { id: string; nome: string; ultimoMes: string };
    const carteira = new Map<string, ClienteInfo>();
    for (const s of salesHist ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string; nome?: string } } | null;
      if (raw?.vendedor?.id !== g.vendedor_id) continue;
      const cid = raw?.cliente?.id;
      const cnome = raw?.cliente?.nome ?? "?";
      const mes_s = (s.raw_json as { data?: string } | null)?.data?.slice(0, 7) ?? "";
      if (!cid) continue;
      const cur = carteira.get(cid);
      if (!cur || mes_s > cur.ultimoMes) carteira.set(cid, { id: cid, nome: cnome, ultimoMes: mes_s });
    }
    // Também adicionar quem comprou esse mês
    for (const s of salesMes ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string; nome?: string }; data?: string } | null;
      if (raw?.vendedor?.id !== g.vendedor_id) continue;
      const cid = raw?.cliente?.id;
      const cnome = raw?.cliente?.nome ?? "?";
      if (!cid) continue;
      const cur = carteira.get(cid);
      const mes_s = raw?.data?.slice(0, 7) ?? inicioMes.slice(0, 7);
      if (!cur || mes_s > cur.ultimoMes) carteira.set(cid, { id: cid, nome: cnome, ultimoMes: mes_s });
    }

    // Inativos = na carteira mas não compraram este mês, ordenados pelo mais antigo
    const inativos = Array.from(carteira.values())
      .filter(c => !clientesMes.has(c.id))
      .sort((a, b) => a.ultimoMes.localeCompare(b.ultimoMes));

    // Calcular meses sem compra para cada inativo
    const mesAtualStr = `${ano}-${String(mes).padStart(2, "0")}`;
    const inativosComMeses = inativos.map(c => {
      const [y, m] = c.ultimoMes.split("-").map(Number);
      const [ya, ma] = mesAtualStr.split("-").map(Number);
      const mesesSem = (ya - y) * 12 + (ma - m);
      return { ...c, mesesSemCompra: mesesSem };
    });

    // Meta de reativações hoje
    const totalInativos = inativos.length;
    const reativacoesHoje = totalInativos > 0 ? Math.ceil(totalInativos / diasRestantes) : 0;

    // Clientes que compraram hoje (reativados)
    const reativadosHoje = (salesToday ?? []).filter(s => {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string } } | null;
      if (raw?.vendedor?.id !== g.vendedor_id) return false;
      const cid = raw?.cliente?.id;
      return cid && inativos.some(i => i.id === cid);
    }).length;

    return {
      id: g.vendedor_id,
      nome: g.vendedor_nome,
      metaMensal,
      metaDia,
      metaDiaRestante,
      faturadoHoje: Math.round(faturadoHoje),
      faturadoMes: Math.round(faturadoMes),
      pctDia: metaDia > 0 ? Math.round((faturadoHoje / metaDia) * 100) : null,
      pctMes: metaMensal > 0 ? Math.round((faturadoMes / metaMensal) * 100) : null,
      totalInativos,
      reativacoesHoje,
      reativadosHoje,
      // Top inativos para mostrar (prioritários)
      inativosPrioritarios: inativosComMeses.slice(0, reativacoesHoje + 2),
    };
  }).sort((a, b) => b.faturadoHoje - a.faturadoHoje);

  return NextResponse.json({ vendedores, diasRestantes, diasTotais, hoje });
}
