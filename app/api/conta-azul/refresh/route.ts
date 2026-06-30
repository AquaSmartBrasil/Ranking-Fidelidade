import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshSavedToken } from "@/lib/contaAzul/token";

export async function POST() {
  try {
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("id")
      .limit(1)
      .single();

    if (!company) {
      return NextResponse.json(
        { error: "Nenhuma empresa encontrada. Conecte a Conta Azul primeiro." },
        { status: 400 }
      );
    }

    await refreshSavedToken(company.id);

    return NextResponse.json({ success: true, message: "Token renovado com sucesso." });
  } catch (err) {
    console.error("[conta-azul/refresh] Erro:", err);
    const message = err instanceof Error ? err.message : "Erro ao renovar token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
