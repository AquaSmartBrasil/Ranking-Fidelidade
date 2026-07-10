import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncSales } from "@/lib/sync/sales";

export async function POST(req: NextRequest) {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Conta Azul não conectada." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const dataInicio: string | undefined = body.data_inicio;
  const dataFim: string | undefined = body.data_fim;

  try {
    const total = await syncSales(company.id, dataInicio, dataFim);
    return NextResponse.json({ success: true, records: total });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
