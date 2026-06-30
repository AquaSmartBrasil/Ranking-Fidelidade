import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncCustomers } from "@/lib/sync/customers";
import { syncProducts } from "@/lib/sync/products";
import { syncSales } from "@/lib/sync/sales";

export async function POST() {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (!company) {
    return NextResponse.json(
      { error: "Conta Azul não conectada. Faça a integração primeiro." },
      { status: 400 }
    );
  }

  const companyId = company.id;
  const logId = crypto.randomUUID();

  await supabaseAdmin.from("sync_logs").insert({
    id: logId,
    company_id: companyId,
    sync_type: "all",
    status: "running",
    started_at: new Date().toISOString(),
  });

  try {
    const customers = await syncCustomers(companyId);
    const products = await syncProducts(companyId);
    const sales = await syncSales(companyId);
    const total = customers + products + sales;

    await supabaseAdmin
      .from("sync_logs")
      .update({ status: "success", finished_at: new Date().toISOString(), records_processed: total })
      .eq("id", logId);

    return NextResponse.json({ success: true, customers, products, sales });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("sync_logs")
      .update({ status: "error", finished_at: new Date().toISOString(), error_message: message })
      .eq("id", logId);

    console.error("[sync/all]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
