import { supabaseAdmin } from "@/lib/supabase/admin";
import { contaAzulFetch } from "@/lib/contaAzul/client";
import { getValidAccessToken } from "@/lib/contaAzul/token";

interface ContaAzulPessoa {
  id: string;
  nome?: string;
  email?: string;
  documento?: string;
  telefone?: string;
}

interface ContaAzulPessoasResponse {
  items: ContaAzulPessoa[];
  totalItems: number;
}

export async function syncCustomers(companyId: string): Promise<number> {
  const accessToken = await getValidAccessToken(companyId);
  let pagina = 1;
  let total = 0;
  const seen = new Set<string>();

  while (true) {
    const res = await contaAzulFetch(
      `/v1/pessoas?pagina=${pagina}&tamanho_pagina=100`,
      accessToken
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erro ao buscar pessoas: ${res.status} — ${text}`);
    }

    const json: ContaAzulPessoasResponse = await res.json();
    const items = json.items ?? [];

    if (items.length === 0) break;

    const rows = items
      .filter((p) => {
        const id = String(p.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((p) => ({
        company_id: companyId,
        conta_azul_id: String(p.id),
        name: p.nome ?? null,
        email: p.email ?? null,
        document: p.documento ?? null,
        phone: p.telefone ?? null,
        raw_json: p,
        updated_at: new Date().toISOString(),
      }));

    const { error } = await supabaseAdmin
      .from("customers")
      .upsert(rows, { onConflict: "company_id,conta_azul_id" });

    if (error) throw new Error(`Erro ao salvar customers: ${error.message}`);

    total += items.length;

    if (items.length < 100) break;
    pagina++;
  }

  return total;
}
