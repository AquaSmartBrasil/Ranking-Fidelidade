import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const { data: goals, error: goalsErr } = await supabaseAdmin
    .from("vendedor_goals").select("*").eq("company_id", companyId).order("vendedor_nome");

  if (goalsErr) return NextResponse.json({ goals: [], tableError: goalsErr.message });

  // Calcular média histórica de clientes atendidos por vendedor (últimos 6 meses)
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const inicio6m = new Date(brNow.getUTCFullYear(), brNow.getUTCMonth() - 6, 1).toISOString().slice(0, 10);
  const fimOntem = new Date(brNow.getTime() - 24*60*60*1000).toISOString().slice(0, 10);

  const { data: salesHist } = await supabaseAdmin
    .from("sales").select("sale_date, raw_json")
    .eq("company_id", companyId)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .gte("sale_date", inicio6m).lte("sale_date", fimOntem)
    .limit(5000);

  // Agrupar clientes únicos por vendedor por mês
  type VendHist = { meses: Map<string, Set<string>> };
  const vendHist = new Map<string, VendHist>();
  for (const s of salesHist ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string } } | null;
    const vId = raw?.vendedor?.id;
    const cId = raw?.cliente?.id;
    const mes = (s.sale_date ?? "").slice(0, 7);
    if (!vId || !cId || !mes) continue;
    const h = vendHist.get(vId) ?? { meses: new Map() };
    const clientesMes = h.meses.get(mes) ?? new Set();
    clientesMes.add(cId);
    h.meses.set(mes, clientesMes);
    vendHist.set(vId, h);
  }

  // Média de clientes por mês por vendedor
  const mediaClientesMap = new Map<string, number>();
  for (const [vId, h] of vendHist) {
    const mesesComVenda = Array.from(h.meses.values());
    if (mesesComVenda.length === 0) continue;
    const total = mesesComVenda.reduce((s, set) => s + set.size, 0);
    mediaClientesMap.set(vId, Math.round(total / mesesComVenda.length));
  }

  if (goals && goals.length > 0) {
    return NextResponse.json({ goals, mediaClientes: Object.fromEntries(mediaClientesMap) });
  }

  // Tabela vazia — popular com vendedores das vendas
  const vendedoresMap = new Map<string, string>();
  for (const s of salesHist ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string; nome?: string } } | null;
    const vId = raw?.vendedor?.id;
    const vNome = raw?.vendedor?.nome;
    if (vId && vNome && !vendedoresMap.has(vId)) vendedoresMap.set(vId, vNome);
  }

  if (vendedoresMap.size > 0) {
    const upsertData = Array.from(vendedoresMap.entries()).map(([id, nome]) => ({
      company_id: companyId, vendedor_id: id, vendedor_nome: nome,
      meta_mensal: 0, meta_clientes: 0, updated_at: new Date().toISOString(),
    }));
    await supabaseAdmin.from("vendedor_goals").upsert(upsertData, {
      onConflict: "company_id,vendedor_id", ignoreDuplicates: true,
    });
    const { data: fresh } = await supabaseAdmin
      .from("vendedor_goals").select("*").eq("company_id", companyId).order("vendedor_nome");
    return NextResponse.json({ goals: fresh ?? [], mediaClientes: Object.fromEntries(mediaClientesMap) });
  }

  return NextResponse.json({ goals: [], mediaClientes: {} });
}

export async function POST(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });

  const body = await req.json();
  const { vendedor_id, vendedor_nome, meta_mensal, meta_clientes, excluido } = body;

  if (!vendedor_id) return NextResponse.json({ error: "vendedor_id obrigatório" }, { status: 400 });

  const payload: Record<string, unknown> = {
    company_id: company.id, vendedor_id,
    updated_at: new Date().toISOString(),
  };
  if (vendedor_nome !== undefined) payload.vendedor_nome = vendedor_nome;
  if (meta_mensal !== undefined) payload.meta_mensal = Number(meta_mensal) || 0;
  if (meta_clientes !== undefined) payload.meta_clientes = Number(meta_clientes) || 0;
  if (excluido !== undefined) payload.excluido = !!excluido;

  const { error } = await supabaseAdmin.from("vendedor_goals").upsert(payload, {
    onConflict: "company_id,vendedor_id",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
