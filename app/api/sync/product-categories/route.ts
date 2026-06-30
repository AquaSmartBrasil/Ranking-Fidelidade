import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/contaAzul/token";
import { contaAzulFetch } from "@/lib/contaAzul/client";

const BATCH = 15;

export async function POST() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });

  const accessToken = await getValidAccessToken(company.id);

  // Produtos que ainda não têm categoria salva
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, conta_azul_id, raw_json")
    .eq("company_id", company.id)
    .is("raw_json->categoria", null)
    .limit(BATCH);

  if (!products?.length) return NextResponse.json({ success: true, records: 0, hasMore: false });

  let synced = 0;
  for (const product of products) {
    const res = await contaAzulFetch(`/v1/produtos/${product.conta_azul_id}`, accessToken);
    if (!res.ok) continue;
    const detail = await res.json().catch(() => null);
    if (!detail?.categoria) {
      // Marcar como sem categoria para não tentar de novo
      await supabaseAdmin.from("products").update({
        raw_json: { ...(product.raw_json as object), categoria: { descricao: "__none__" } }
      }).eq("id", product.id);
      continue;
    }
    await supabaseAdmin.from("products").update({
      raw_json: { ...(product.raw_json as object), categoria: detail.categoria }
    }).eq("id", product.id);
    synced++;
  }

  // Verificar se ainda tem mais
  const { count } = await supabaseAdmin
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("company_id", company.id)
    .is("raw_json->categoria", null);

  return NextResponse.json({ success: true, records: synced, hasMore: (count ?? 0) > 0 });
}
