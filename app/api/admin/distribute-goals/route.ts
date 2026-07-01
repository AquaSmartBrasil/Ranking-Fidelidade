import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const body = await req.json().catch(() => ({}));
  const metaAnual: number = Number(body.meta_anual) || 0;
  if (metaAnual <= 0) return NextResponse.json({ error: "meta_anual inválida" }, { status: 400 });

  const now = new Date();
  const anoAtual = now.getFullYear();
  const mesAtual = now.getMonth() + 1;

  // Histórico de 6 meses para medir o peso de cada vendedor (carteira + desempenho)
  const inicio6m = new Date(anoAtual, mesAtual - 7, 1).toISOString().slice(0, 10);
  const { data: sales } = await supabaseAdmin
    .from("sales").select("sale_date, total_amount, raw_json")
    .eq("company_id", companyId)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .gte("sale_date", inicio6m).limit(10000);

  // Vendedores excluídos não entram na distribuição
  const { data: excludedRows } = await supabaseAdmin
    .from("vendedor_goals").select("vendedor_id").eq("company_id", companyId).eq("excluido", true);
  const excludedIds = new Set((excludedRows ?? []).map(r => r.vendedor_id));

  type VendStats = { id: string; nome: string; total: number; clientes: Set<string> };
  const vendMap = new Map<string, VendStats>();
  for (const s of sales ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string; nome?: string }; cliente?: { id?: string } } | null;
    const vId = raw?.vendedor?.id;
    if (!vId || excludedIds.has(vId)) continue;
    if (!vendMap.has(vId)) vendMap.set(vId, { id: vId, nome: raw?.vendedor?.nome ?? "—", total: 0, clientes: new Set() });
    const v = vendMap.get(vId)!;
    v.total += s.total_amount ?? 0;
    if (raw?.cliente?.id) v.clientes.add(raw.cliente.id);
  }

  const vendedores = Array.from(vendMap.values());
  if (vendedores.length === 0) {
    return NextResponse.json({ error: "Nenhum vendedor com histórico encontrado" }, { status: 400 });
  }

  // Peso: 70% baseado em valor vendido, 30% baseado em tamanho da carteira (nº clientes)
  const totalValor = vendedores.reduce((s, v) => s + v.total, 0) || 1;
  const totalClientes = vendedores.reduce((s, v) => s + v.clientes.size, 0) || 1;

  const distribuicao = vendedores.map(v => {
    const shareValor = v.total / totalValor;
    const shareClientes = v.clientes.size / totalClientes;
    const peso = shareValor * 0.7 + shareClientes * 0.3;
    const metaAnualVendedor = Math.round(metaAnual * peso);
    const metaMensalVendedor = Math.round(metaAnualVendedor / 12);
    return {
      vendedor_id: v.id, vendedor_nome: v.nome,
      peso: Math.round(peso * 1000) / 10,
      historico6m: Math.round(v.total), clientes: v.clientes.size,
      metaMensal: metaMensalVendedor, metaAnual: metaAnualVendedor,
    };
  }).sort((a, b) => b.metaAnual - a.metaAnual);

  // Salvar nas metas dos vendedores
  const upsertData = distribuicao.map(d => ({
    company_id: companyId, vendedor_id: d.vendedor_id, vendedor_nome: d.vendedor_nome,
    meta_mensal: d.metaMensal, updated_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin.from("vendedor_goals").upsert(upsertData, {
    onConflict: "company_id,vendedor_id",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, distribuicao });
}
