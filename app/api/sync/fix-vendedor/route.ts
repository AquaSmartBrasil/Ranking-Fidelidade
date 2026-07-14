import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { contaAzulFetch } from "@/lib/contaAzul/client";
import { getValidAccessToken } from "@/lib/contaAzul/token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });

  const accessToken = await getValidAccessToken(company.id);

  // Buscar vendas sem vendedor no raw_json
  const { data: sales } = await supabaseAdmin
    .from("sales")
    .select("id, conta_azul_id, raw_json")
    .eq("company_id", company.id)
    .limit(5000);

  const semVendedor = (sales ?? []).filter(s => {
    const raw = s.raw_json as Record<string, unknown> | null;
    return !raw?.vendedor;
  });

  let updated = 0;
  const BATCH = 5;

  for (let i = 0; i < semVendedor.length; i += BATCH) {
    const batch = semVendedor.slice(i, i + BATCH);
    await Promise.all(batch.map(async (sale) => {
      try {
        const res = await contaAzulFetch(`/v1/venda/${sale.conta_azul_id}`, accessToken);
        if (!res.ok) return;
        const data = await res.json() as { vendedor?: unknown; venda?: unknown };
        if (!data.vendedor) return;

        const raw = sale.raw_json as Record<string, unknown> ?? {};
        const newRaw = { ...raw, vendedor: data.vendedor };

        await supabaseAdmin.from("sales")
          .update({ raw_json: newRaw, updated_at: new Date().toISOString() })
          .eq("id", sale.id);
        updated++;
      } catch { /* ignora erro individual */ }
    }));
  }

  return NextResponse.json({ total: semVendedor.length, updated });
}
