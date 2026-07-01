import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const anoAtual = brNow.getUTCFullYear();
  const mesAtual = brNow.getUTCMonth() + 1;

  const { data: goalRow } = await supabaseAdmin
    .from("company_goals").select("*").eq("company_id", companyId).eq("ano", anoAtual).single();

  // Sazonalidade: 2 anos anteriores completos
  const { data: salesHist } = await supabaseAdmin
    .from("sales").select("sale_date, total_amount")
    .eq("company_id", companyId)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .gte("sale_date", `${anoAtual - 2}-01-01`).lte("sale_date", `${anoAtual - 1}-12-31`).limit(10000);

  const totalPorMes: number[] = Array(13).fill(0);
  let totalGeral = 0;
  for (const s of salesHist ?? []) {
    const m = parseInt((s.sale_date ?? "").slice(5, 7));
    if (m >= 1 && m <= 12) { totalPorMes[m] += s.total_amount ?? 0; totalGeral += s.total_amount ?? 0; }
  }
  const sazonalidade = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const pct = totalGeral > 0 ? (totalPorMes[m] / totalGeral) * 100 : 100 / 12;
    return { mes: m, pct: Math.round(pct * 10) / 10 };
  });

  // Realizado no ano atual mês a mês
  const { data: salesAno } = await supabaseAdmin
    .from("sales").select("sale_date, total_amount")
    .eq("company_id", companyId)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .gte("sale_date", `${anoAtual}-01-01`).lte("sale_date", `${anoAtual}-12-31`).limit(10000);

  const realizadoPorMes: number[] = Array(13).fill(0);
  for (const s of salesAno ?? []) {
    const m = parseInt((s.sale_date ?? "").slice(5, 7));
    if (m >= 1 && m <= 12) realizadoPorMes[m] += s.total_amount ?? 0;
  }
  const realizado = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    valor: Math.round(realizadoPorMes[i + 1]),
    fechado: i + 1 < mesAtual,
    atual: i + 1 === mesAtual,
  }));

  const { data: vendedorGoals } = await supabaseAdmin
    .from("vendedor_goals").select("meta_mensal").eq("company_id", companyId);
  const totalVendedoresMensal = (vendedorGoals ?? []).reduce((s, g) => s + (Number(g.meta_mensal) || 0), 0);

  return NextResponse.json({
    ano: anoAtual, mesAtual,
    metaAnual: goalRow?.meta_anual ?? 0,
    distribuicao: goalRow?.distribuicao ?? null,
    sazonalidade, realizado,
    totalVendedoresMensal,
    totalVendedoresAnual: totalVendedoresMensal * 12,
    temHistorico: totalGeral > 0,
  });
}

export async function POST(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;
  const anoAtual = new Date(Date.now() - 3*60*60*1000).getUTCFullYear();
  const body = await req.json();
  const { meta_anual, distribuicao } = body;
  const { error } = await supabaseAdmin.from("company_goals").upsert({
    company_id: companyId, ano: anoAtual,
    meta_anual: Number(meta_anual) || 0,
    distribuicao: distribuicao ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,ano" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
