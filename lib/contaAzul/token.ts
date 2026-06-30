import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshAccessToken, TokenResponse } from "@/lib/contaAzul/auth";

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

export async function getSavedToken(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("conta_azul_tokens")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

export async function saveToken(companyId: string, token: TokenResponse) {
  const expiresAt = new Date(
    Date.now() + token.expires_in * 1000
  ).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("conta_azul_tokens")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("conta_azul_tokens")
      .update({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw new Error(`Falha ao atualizar token: ${error.message}`);
  } else {
    const { error } = await supabaseAdmin.from("conta_azul_tokens").insert({
      company_id: companyId,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: expiresAt,
    });

    if (error) throw new Error(`Falha ao salvar token: ${error.message}`);
  }
}

export async function refreshSavedToken(companyId: string) {
  const tokenRow = await getSavedToken(companyId);

  if (!tokenRow) {
    throw new Error("Token não encontrado. Conecte a Conta Azul primeiro.");
  }

  const newToken = await refreshAccessToken(tokenRow.refresh_token);
  await saveToken(companyId, newToken);
  return newToken;
}

export async function getValidAccessToken(companyId: string): Promise<string> {
  const tokenRow = await getSavedToken(companyId);

  if (!tokenRow) {
    throw new Error("Token não encontrado. Conecte a Conta Azul primeiro.");
  }

  if (isTokenExpired(tokenRow.expires_at)) {
    const newToken = await refreshSavedToken(companyId);
    return newToken.access_token;
  }

  return tokenRow.access_token;
}
