import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const EXCLUDE_STATUS = '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")';

function getPeriodoInicio(periodo: string): string {
  const hoje = new Date();
  if (periodo === "hoje") return hoje.toISOString().slice(0, 10);
  if (periodo === "semana") {
    const d = new Date();
    const dia = d.getDay();
    d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
    return d.toISOString().slice(0, 10);
  }
  if (periodo === "mes") {
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (periodo === "ano") return `${hoje.getFullYear()}-01-01`;
  const dias = parseInt(periodo) || 90;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });

  const companyId = company.id;
  const periodo = req.nextUrl.searchParams.get("periodo") ?? "mes";
  const inicioPeriodoStr = periodo === "custom"
    ? (req.nextUrl.searchParams.get("inicio") ?? getPeriodoInicio("mes"))
    : getPeriodoInicio(periodo);
  const fimPeriodoStr = periodo === "custom"
    ? (req.nextUrl.searchParams.get("fim") ?? new Date().toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  const [{ data: salesKpi }, { data: salesAll }] = await Promise.all([
    supabaseAdmin.from("sales").select("total_amount")
      .eq("company_id", companyId).gte("sale_date", inicioPeriodoStr).lte("sale_date", fimPeriodoStr)
      .not("status", "in", EXCLUDE_STATUS),
    supabaseAdmin.from("sales").select("sale_date, total_amount, raw_json")
      .eq("company_id", companyId).gte("sale_date", inicioPeriodoStr).lte("sale_date", fimPeriodoStr)
      .not("status", "in", EXCLUDE_STATUS).limit(10000),
  ]);

  const totalVendas = salesKpi?.length ?? 0;
  const receitaTotal = salesKpi?.reduce((s, r) => s + (r.total_amount ?? 0), 0) ?? 0;
  const ticketMedio = totalVendas > 0 ? receitaTotal / totalVendas : 0;

  // Agrupar por mês + contar clientes únicos + ranking — tudo em uma passagem
  const monthMap = new Map<string, { mes: string; total: number; count: number }>();
  const customerMap = new Map<string, { name: string; total: number; count: number }>();
  const clientesUnicos = new Set<string>();

  for (const s of salesAll ?? []) {
    // Gráfico mensal
    if (s.sale_date) {
      const mes = s.sale_date.slice(0, 7);
      const m = monthMap.get(mes);
      if (m) { m.total += s.total_amount ?? 0; m.count += 1; }
      else monthMap.set(mes, { mes, total: s.total_amount ?? 0, count: 1 });
    }

    // Clientes únicos + ranking
    const raw = s.raw_json as { cliente?: { id?: string; nome?: string } } | null;
    const clienteId = raw?.cliente?.id;
    const clienteNome = raw?.cliente?.nome ?? "Sem nome";
    if (clienteId) {
      clientesUnicos.add(clienteId);
      const c = customerMap.get(clienteId);
      if (c) { c.total += s.total_amount ?? 0; c.count += 1; }
      else customerMap.set(clienteId, { name: clienteNome, total: s.total_amount ?? 0, count: 1 });
    }
  }

  const salesByMonth = Array.from(monthMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  const rankingClientes = Array.from(customerMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return NextResponse.json({
    kpis: {
      totalVendas,
      receitaTotal,
      ticketMedio,
      totalClientes: clientesUnicos.size,
    },
    salesByMonth,
    rankingClientes,
  });
}
