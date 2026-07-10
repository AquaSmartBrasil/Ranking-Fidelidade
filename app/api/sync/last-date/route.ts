import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ lastDate: null });

  const { data } = await supabaseAdmin
    .from("sales")
    .select("sale_date")
    .eq("company_id", company.id)
    .order("sale_date", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ lastDate: data?.sale_date ?? null });
}
