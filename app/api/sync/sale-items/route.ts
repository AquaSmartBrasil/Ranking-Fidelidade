import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/contaAzul/token";
import { contaAzulFetch } from "@/lib/contaAzul/client";

export const dynamic = "force-dynamic";

const BATCH = 8;

export async function POST(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const body = await req.json().catch(() => ({}));
  // offset: qual página de vendas processar (0, 8, 16, ...)
  const offset: number = body.offset ?? 0;

  try {
    const { data: sales, error: salesErr } = await supabaseAdmin
      .from("sales").select("id, conta_azul_id")
      .eq("company_id", companyId)
      .order("sale_date", { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 });
    if (!sales?.length) return NextResponse.json({ success: true, records: 0, hasMore: false, offset });

    const { count: totalSales } = await supabaseAdmin.from("sales")
      .select("*", { count: "exact", head: true }).eq("company_id", companyId);

    const accessToken = await getValidAccessToken(companyId);
    let itemsSynced = 0;
    const errors: string[] = [];

    for (const sale of sales) {
      await supabaseAdmin.from("sale_items").delete().eq("sale_id", sale.id);

      // Buscar detalhe da venda para obter vendedor
      const detailRes = await contaAzulFetch(`/v1/venda/${sale.conta_azul_id}`, accessToken);
      if (detailRes.ok) {
        const detail = await detailRes.json().catch(() => null);
        const vendedor = detail?.vendedor ?? null;
        if (vendedor) {
          const { data: currentSale } = await supabaseAdmin.from("sales")
            .select("raw_json").eq("id", sale.id).single();
          const merged = { ...(currentSale?.raw_json as object ?? {}), vendedor };
          await supabaseAdmin.from("sales").update({ raw_json: merged }).eq("id", sale.id);
        }
      }

      const res = await contaAzulFetch(`/v1/venda/${sale.conta_azul_id}/itens`, accessToken);
      if (!res.ok) {
        await supabaseAdmin.from("sale_items").insert([{
          sale_id: sale.id, description: "__empty__", quantity: 0, unit_price: 0, total_amount: 0, raw_json: {}
        }]);
        continue;
      }

      const json = await res.json().catch(() => null);
      const itens = json?.itens ?? [];

      if (itens.length === 0) {
        await supabaseAdmin.from("sale_items").insert([{
          sale_id: sale.id, description: "__empty__", quantity: 0, unit_price: 0, total_amount: 0, raw_json: {}
        }]);
        continue;
      }

      const { error: insertErr } = await supabaseAdmin.from("sale_items").insert(
        itens.map((item: { nome?: string; quantidade?: number; valor?: number }) => ({
          sale_id: sale.id,
          description: item.nome ?? null,
          quantity: item.quantidade ?? null,
          unit_price: item.valor ?? null,
          total_amount: (item.quantidade ?? 0) * (item.valor ?? 0),
          raw_json: item,
        }))
      );

      if (insertErr) { errors.push(insertErr.message); continue; }
      itemsSynced += itens.length;
    }

    const nextOffset = offset + BATCH;
    const hasMore = nextOffset < (totalSales ?? 0);

    return NextResponse.json({
      success: true, records: itemsSynced, hasMore,
      offset, nextOffset, total: totalSales,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
