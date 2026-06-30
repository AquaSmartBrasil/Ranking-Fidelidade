import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isTokenExpired } from "@/lib/contaAzul/token";

export async function GET() {
  try {
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("id")
      .limit(1)
      .single();

    if (!company) {
      return NextResponse.json({ connected: false });
    }

    const { data: tokenRow } = await supabaseAdmin
      .from("conta_azul_tokens")
      .select("access_token, expires_at")
      .eq("company_id", company.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      expires_at: tokenRow.expires_at,
      token_expired: isTokenExpired(tokenRow.expires_at),
    });
  } catch (err) {
    console.error("[conta-azul/status] Erro:", err);
    return NextResponse.json({ connected: false });
  }
}
