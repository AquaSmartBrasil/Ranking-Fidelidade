import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const { data: goals, error: goalsErr } = await supabaseAdmin
    .from("vendedor_goals").select("*").eq("company_id", companyId).order("vendedor_nome");

  if (goalsErr) {
    return NextResponse.json({ goals: [], tableError: goalsErr.message });
  }

  if (goals && goals.length > 0) return NextResponse.json({ goals });

  // Tabela vazia — descobrir vendedores direto das vendas e popular
  const { data: sales } = await supabaseAdmin
    .from("sales").select("raw_json")
    .eq("company_id", companyId)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .limit(5000);

  const vendedoresMap = new Map<string, string>();
  for (const s of sales ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string; nome?: string } } | null;
    const vId = raw?.vendedor?.id;
    const vNome = raw?.vendedor?.nome;
    if (vId && vNome && !vendedoresMap.has(vId)) vendedoresMap.set(vId, vNome);
  }

  if (vendedoresMap.size > 0) {
    const upsertData = Array.from(vendedoresMap.entries()).map(([id, nome]) => ({
      company_id: companyId, vendedor_id: id, vendedor_nome: nome,
      meta_mensal: 0, updated_at: new Date().toISOString(),
    }));
    await supabaseAdmin.from("vendedor_goals").upsert(upsertData, {
      onConflict: "company_id,vendedor_id", ignoreDuplicates: true,
    });
    const { data: fresh } = await supabaseAdmin
      .from("vendedor_goals").select("*").eq("company_id", companyId).order("vendedor_nome");
    return NextResponse.json({ goals: fresh ?? [] });
  }

  return NextResponse.json({ goals: [], noSalesData: true });
}

export async function POST(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });

  const body = await req.json();
  const { vendedor_id, vendedor_nome, meta_mensal, excluido } = body;

  if (!vendedor_id) return NextResponse.json({ error: "vendedor_id obrigatório" }, { status: 400 });

  const payload: Record<string, unknown> = {
    company_id: company.id,
    vendedor_id,
    updated_at: new Date().toISOString(),
  };
  if (vendedor_nome !== undefined) payload.vendedor_nome = vendedor_nome;
  if (meta_mensal !== undefined) payload.meta_mensal = Number(meta_mensal) || 0;
  if (excluido !== undefined) payload.excluido = !!excluido;

  const { error } = await supabaseAdmin.from("vendedor_goals").upsert(payload, {
    onConflict: "company_id,vendedor_id",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
