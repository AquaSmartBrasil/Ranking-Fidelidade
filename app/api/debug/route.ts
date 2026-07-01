import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  const companyId = company?.id;

  const { data: junSales } = await supabaseAdmin
    .from("sales").select("id, total_amount, status, raw_json")
    .eq("company_id", companyId)
    .gte("sale_date", "2026-06-01").lte("sale_date", "2026-06-30")
    .limit(500);

  const byStatus: Record<string, { count: number; valor: number }> = {};
  for (const s of junSales ?? []) {
    const st = s.status ?? "null";
    if (!byStatus[st]) byStatus[st] = { count: 0, valor: 0 };
    byStatus[st].count++;
    byStatus[st].valor += s.total_amount ?? 0;
  }

  return NextResponse.json({ total: junSales?.length, byStatus });
}
