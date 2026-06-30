import { supabaseAdmin } from "@/lib/supabase/admin";
import { contaAzulFetch } from "@/lib/contaAzul/client";
import { getValidAccessToken } from "@/lib/contaAzul/token";

interface ContaAzulReceivable {
  id: string;
  pessoa_id?: string;
  venda_id?: string;
  data_vencimento?: string;
  data_pagamento?: string;
  status?: string;
  valor?: number;
  valor_pago?: number;
}

interface ContaAzulReceivablesResponse {
  data: ContaAzulReceivable[];
  pagina: number;
  tamanho_pagina: number;
  total: number;
}

export async function syncReceivables(companyId: string): Promise<number> {
  const accessToken = await getValidAccessToken(companyId);
  let pagina = 1;
  let total = 0;

  while (true) {
    const res = await contaAzulFetch(
      `/v1/receivables?pagina=${pagina}&tamanho_pagina=100`,
      accessToken
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erro ao buscar recebíveis: ${res.status} — ${text}`);
    }

    const json: ContaAzulReceivablesResponse = await res.json();
    const items = json.data ?? [];

    if (items.length === 0) break;

    for (const rec of items) {
      let customerId: string | null = null;
      if (rec.pessoa_id) {
        const { data: customer } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("company_id", companyId)
          .eq("conta_azul_id", String(rec.pessoa_id))
          .single();
        customerId = customer?.id ?? null;
      }

      let saleId: string | null = null;
      if (rec.venda_id) {
        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("id")
          .eq("company_id", companyId)
          .eq("conta_azul_id", String(rec.venda_id))
          .single();
        saleId = sale?.id ?? null;
      }

      const { error } = await supabaseAdmin
        .from("receivables")
        .upsert(
          {
            company_id: companyId,
            conta_azul_id: String(rec.id),
            customer_id: customerId,
            sale_id: saleId,
            due_date: rec.data_vencimento ?? null,
            payment_date: rec.data_pagamento ?? null,
            status: rec.status ?? null,
            amount: rec.valor ?? null,
            paid_amount: rec.valor_pago ?? null,
            raw_json: rec,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,conta_azul_id" }
        );

      if (error) throw new Error(`Erro ao salvar recebível: ${error.message}`);
    }

    total += items.length;

    if (items.length < 100) break;
    pagina++;
  }

  return total;
}
