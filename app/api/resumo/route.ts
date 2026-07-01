import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CORES = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16"];

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const anoAtual = brNow.getUTCFullYear();
  const mesAtual = brNow.getUTCMonth() + 1;

  // Meta anual + distribuição mensal salva
  const { data: companyGoal } = await supabaseAdmin
    .from("company_goals").select("*").eq("company_id", companyId).eq("ano", anoAtual).single();
  const metaAnual = Number(companyGoal?.meta_anual) || 0;
  const distribuicao: { mes: number; pct: number; valor: number }[] | null = companyGoal?.distribuicao ?? null;

  const metaPorMes = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    if (distribuicao) {
      const d = distribuicao.find(x => x.mes === m);
      return d?.valor ?? Math.round(metaAnual / 12);
    }
    return metaAnual > 0 ? Math.round(metaAnual / 12) : 0;
  });

  // Vendedores excluídos não entram
  const { data: excludedRows } = await supabaseAdmin
    .from("vendedor_goals").select("vendedor_id").eq("company_id", companyId).eq("excluido", true);
  const excludedIds = new Set((excludedRows ?? []).map(r => r.vendedor_id));

  // Vendas do ano inteiro
  const { data: sales } = await supabaseAdmin
    .from("sales").select("sale_date, total_amount, raw_json")
    .eq("company_id", companyId)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .gte("sale_date", `${anoAtual}-01-01`).lte("sale_date", `${anoAtual}-12-31`)
    .limit(10000);

  // Mapear vendedores únicos (ordenados por valor total desc, para cor consistente)
  type VendTotal = { id: string; nome: string; total: number };
  const vendTotals = new Map<string, VendTotal>();
  for (const s of sales ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string; nome?: string } } | null;
    const vId = raw?.vendedor?.id;
    if (!vId || excludedIds.has(vId)) continue;
    const vNome = raw?.vendedor?.nome ?? "—";
    const cur = vendTotals.get(vId) ?? { id: vId, nome: vNome, total: 0 };
    cur.total += s.total_amount ?? 0;
    vendTotals.set(vId, cur);
  }
  const vendedoresOrdenados = Array.from(vendTotals.values()).sort((a, b) => b.total - a.total);
  const vendedores = vendedoresOrdenados.map((v, i) => ({ id: v.id, nome: v.nome, cor: CORES[i % CORES.length] }));
  const vendedorColorMap = new Map(vendedores.map(v => [v.id, v.cor]));

  // Meta mensal de cada vendedor (para % de atingimento)
  const { data: vendGoals } = await supabaseAdmin
    .from("vendedor_goals").select("vendedor_id, meta_mensal").eq("company_id", companyId);
  const metaMensalVendedor = new Map((vendGoals ?? []).map(g => [g.vendedor_id, Number(g.meta_mensal) || 0]));

  // Agrupar por mês e vendedor
  type MesVendedor = { vendedorId: string; nome: string; cor: string; valor: number; metaMensal: number; pct: number | null };
  const porMes: { mes: number; total: number; metaMes: number; vendedores: MesVendedor[]; fechado: boolean; atual: boolean }[] =
    Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1, total: 0, metaMes: metaPorMes[i],
      vendedores: vendedores.map(v => ({ vendedorId: v.id, nome: v.nome, cor: v.cor, valor: 0, metaMensal: metaMensalVendedor.get(v.id) ?? 0, pct: null })),
      fechado: i + 1 < mesAtual, atual: i + 1 === mesAtual,
    }));

  for (const s of sales ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string } } | null;
    const vId = raw?.vendedor?.id;
    if (!vId || excludedIds.has(vId)) continue;
    const m = parseInt((s.sale_date ?? "").slice(5, 7));
    if (m < 1 || m > 12) continue;
    const mesData = porMes[m - 1];
    const vEntry = mesData.vendedores.find(v => v.vendedorId === vId);
    if (vEntry) vEntry.valor += s.total_amount ?? 0;
    mesData.total += s.total_amount ?? 0;
  }

  for (const mesData of porMes) {
    for (const v of mesData.vendedores) {
      v.valor = Math.round(v.valor);
      v.pct = v.metaMensal > 0 ? Math.round((v.valor / v.metaMensal) * 100) : null;
    }
    mesData.total = Math.round(mesData.total);
  }

  // Realizado e meta por trimestre/semestre/ano (com base no mês atual)
  const trimAtualIdx = Math.floor((mesAtual - 1) / 3); // 0-3
  const trimMeses = [trimAtualIdx * 3, trimAtualIdx * 3 + 1, trimAtualIdx * 3 + 2];
  const semAtualIdx = mesAtual <= 6 ? 0 : 1;
  const semMeses = semAtualIdx === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];

  const realizadoAno = porMes.reduce((s, m) => s + m.total, 0);
  const realizadoTrim = trimMeses.reduce((s, i) => s + porMes[i].total, 0);
  const realizadoSem = semMeses.reduce((s, i) => s + porMes[i].total, 0);
  const metaTrim = trimMeses.reduce((s, i) => s + porMes[i].metaMes, 0);
  const metaSem = semMeses.reduce((s, i) => s + porMes[i].metaMes, 0);

  return NextResponse.json({
    ano: anoAtual, mesAtual,
    metaAnual, metaTrim, metaSem,
    realizadoAno, realizadoTrim, realizadoSem,
    vendedores, meses: porMes,
  });
}
