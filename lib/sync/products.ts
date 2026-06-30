import { supabaseAdmin } from "@/lib/supabase/admin";
import { contaAzulFetch } from "@/lib/contaAzul/client";
import { getValidAccessToken } from "@/lib/contaAzul/token";

interface ContaAzulProduct {
  id: string;
  nome?: string;
  codigo?: string;
  valor_venda?: number;
  custo_medio?: number;
}

interface ContaAzulProductsResponse {
  items: ContaAzulProduct[];
  totalItems: number;
}

export async function syncProducts(companyId: string): Promise<number> {
  const accessToken = await getValidAccessToken(companyId);
  let pagina = 1;
  let total = 0;

  while (true) {
    const res = await contaAzulFetch(
      `/v1/produtos?pagina=${pagina}&tamanho_pagina=100`,
      accessToken
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erro ao buscar produtos: ${res.status} — ${text}`);
    }

    const json: ContaAzulProductsResponse = await res.json();
    const items = json.items ?? [];

    if (items.length === 0) break;

    const seen = new Set<string>();
    const rows = items
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map((p) => ({
      company_id: companyId,
      conta_azul_id: String(p.id),
      name: p.nome ?? null,
      sku: p.codigo ?? null,
      price: p.valor_venda ?? null,
      cost: p.custo_medio ?? null,
      raw_json: p,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from("products")
      .upsert(rows, { onConflict: "company_id,conta_azul_id" });

    if (error) throw new Error(`Erro ao salvar products: ${error.message}`);

    total += items.length;

    if (items.length < 100) break;
    pagina++;
  }

  return total;
}
