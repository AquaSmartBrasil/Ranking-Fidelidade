import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncReceivables } from "@/lib/sync/receivables";

export async function POST() {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Conta Azul não conectada." }, { status: 400 });
  }

  try {
    const total = await syncReceivables(company.id);
    return NextResponse.json({ success: true, records: total });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
