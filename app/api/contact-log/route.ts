import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vendedorId, vendedorNome, clienteId, clienteNome, result } = body;

  if (!vendedorId || !clienteId || !result) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 400 });

  // Brasília date
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const contactDate = brNow.toISOString().slice(0, 10);

  // Upsert: one log per vendedor/client/date (replace if re-clicked)
  const { error } = await supabaseAdmin
    .from("contact_logs")
    .upsert(
      {
        company_id: company.id,
        vendedor_id: vendedorId,
        vendedor_nome: vendedorNome,
        cliente_ca_id: clienteId,
        cliente_nome: clienteNome,
        contact_date: contactDate,
        result,
        logged_at: new Date().toISOString(),
      },
      { onConflict: "company_id,vendedor_id,cliente_ca_id,contact_date" }
    );

  if (error) {
    // If upsert fails due to no unique constraint, just insert
    await supabaseAdmin.from("contact_logs").insert({
      company_id: company.id,
      vendedor_id: vendedorId,
      vendedor_nome: vendedorNome,
      cliente_ca_id: clienteId,
      cliente_nome: clienteNome,
      contact_date: contactDate,
      result,
      logged_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, date: contactDate });
}

export async function GET(req: NextRequest) {
  const vendedorId = req.nextUrl.searchParams.get("vendedor");
  const date = req.nextUrl.searchParams.get("date");

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (!company) return NextResponse.json({ logs: [] });

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const today = date ?? brNow.toISOString().slice(0, 10);

  let query = supabaseAdmin
    .from("contact_logs")
    .select("*")
    .eq("company_id", company.id)
    .eq("contact_date", today);

  if (vendedorId) query = query.eq("vendedor_id", vendedorId);

  const { data } = await query.order("logged_at", { ascending: false });

  return NextResponse.json({ logs: data ?? [] });
}
