import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncSales } from "@/lib/sync/sales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Proteção: só Vercel Cron ou chamada interna
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: company } = await supabaseAdmin
    .from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Sem empresa conectada" }, { status: 400 });

  // Sincroniza apenas ontem e hoje (para não perder vendas que chegam tarde)
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hoje = brNow.toISOString().slice(0, 10);
  const ontem = new Date(brNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const total = await syncSales(company.id, ontem, hoje);
    console.log(`[cron/sync-daily] Sincronizadas ${total} vendas (${ontem} → ${hoje})`);
    return NextResponse.json({ success: true, records: total, periodo: { ontem, hoje } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-daily]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
