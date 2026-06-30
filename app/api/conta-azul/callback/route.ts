import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/contaAzul/auth";
import { saveToken } from "@/lib/contaAzul/token";
import { supabaseAdmin } from "@/lib/supabase/admin";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      `${APP_URL}/integrations?error=${errorParam}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${APP_URL}/integrations?error=missing_code`
    );
  }

  try {
    const tokenResponse = await exchangeCodeForToken(code);

    const { data: existingCompany, error: fetchError } = await supabaseAdmin
      .from("companies")
      .select("id")
      .limit(1)
      .single();

    let companyId: string;

    if (fetchError || !existingCompany) {
      const { data: newCompany, error: createError } = await supabaseAdmin
        .from("companies")
        .insert({ name: "Default Company" })
        .select("id")
        .single();

      if (createError || !newCompany) {
        throw new Error("Falha ao criar empresa padrão no Supabase.");
      }

      companyId = newCompany.id;
    } else {
      companyId = existingCompany.id;
    }

    await saveToken(companyId, tokenResponse);

    return NextResponse.redirect(`${APP_URL}/integrations?connected=1`);
  } catch (err) {
    console.error("[conta-azul/callback] Erro:", err);
    return NextResponse.redirect(
      `${APP_URL}/integrations?error=conta_azul_callback`
    );
  }
}
