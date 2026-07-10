import { supabaseAdmin } from "@/lib/supabase/admin";
import { contaAzulFetch } from "@/lib/contaAzul/client";
import { getValidAccessToken } from "@/lib/contaAzul/token";

interface ContaAzulVendaCliente {
  id: string;
  nome?: string;
  email?: string | null;
}

interface ContaAzulVenda {
  id: string;
  tipo?: string;
  numero?: number;
  data?: string;
  total?: number;
  cliente?: ContaAzulVendaCliente;
  situacao?: { nome?: string };
}

interface ContaAzulVendasResponse {
  total_itens: number;
  itens: ContaAzulVenda[];
}

interface ContaAzulItemVenda {
  id: string;
  id_item?: string;
  nome?: string;
  tipo?: string;
  quantidade?: number;
  valor?: number;
  custo?: number;
}

interface ContaAzulItensResponse {
  itens: ContaAzulItemVenda[];
}

export async function syncSales(
  companyId: string,
  dataInicio?: string,
  dataFim?: string
): Promise<number> {
  const accessToken = await getValidAccessToken(companyId);

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const fim = dataFim ?? brNow.toISOString().slice(0, 10);
  const inicioAno = `${brNow.getUTCFullYear()}-01-01`;
  const inicio = dataInicio ?? inicioAno;

  let pagina = 1;
  let total = 0;

  while (true) {
    const res = await contaAzulFetch(
      `/v1/venda/busca?pagina=${pagina}&tamanho_pagina=100&data_inicio=${inicio}&data_fim=${fim}`,
      accessToken
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Erro ao buscar vendas: ${res.status} — ${text}`);
    }

    const json: ContaAzulVendasResponse = await res.json();
    const items = json.itens ?? [];

    if (items.length === 0) break;

    const seen = new Set<string>();
    const salesRows = items
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        // Excluir orçamentos e cancelados
        if (s.tipo === "SALE_PROPOSAL") return false;
        const status = s.situacao?.nome ?? "";
        if (status === "CANCELADO" || status === "ESPERANDO_APROVACAO" || status === "ORCAMENTO") return false;
        return true;
      })
      .map((sale) => ({
        company_id: companyId,
        conta_azul_id: String(sale.id),
        sale_date: sale.data ?? null,
        status: sale.situacao?.nome ?? null,
        total_amount: sale.total ?? null,
        discount_amount: 0,
        net_amount: sale.total ?? null,
        raw_json: sale,
        updated_at: new Date().toISOString(),
      }));

    const { error } = await supabaseAdmin
      .from("sales")
      .upsert(salesRows, { onConflict: "company_id,conta_azul_id" });

    if (error) throw new Error(`Erro ao salvar vendas: ${error.message}`);

    total += items.length;
    if (items.length < 100) break;
    pagina++;
  }

  return total;
}

export async function syncSaleItems(
  companyId: string,
  dataInicio?: string,
  dataFim?: string
): Promise<{ itemsSynced: number; hasMore: boolean }> {
  const BATCH = 8; // seguro dentro do timeout de 10s
  const accessToken = await getValidAccessToken(companyId);

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const fim = dataFim ?? brNow.toISOString().slice(0, 10);
  const inicioAno = `${brNow.getUTCFullYear()}-01-01`;
  const inicio = dataInicio ?? inicioAno;

  // Buscar todas as vendas do período
  const { data: allSales } = await supabaseAdmin
    .from("sales")
    .select("id, conta_azul_id")
    .eq("company_id", companyId)
    .gte("sale_date", inicio)
    .lte("sale_date", fim)
    .limit(5000);

  if (!allSales?.length) return { itemsSynced: 0, hasMore: false };

  // Quais já têm itens
  const { data: withItems } = await supabaseAdmin
    .from("sale_items")
    .select("sale_id")
    .in("sale_id", allSales.map((s) => s.id));

  const saleIdsWithItems = new Set((withItems ?? []).map((i) => i.sale_id));
  const pending = allSales.filter((s) => !saleIdsWithItems.has(s.id));

  const toFetch = pending.slice(0, BATCH);
  let itemsSynced = 0;

  for (const sale of toFetch) {
    const res = await contaAzulFetch(`/v1/venda/${sale.conta_azul_id}/itens`, accessToken);
    if (!res.ok) continue;
    const json: ContaAzulItensResponse = await res.json();
    const saleItems = json.itens ?? [];
    if (saleItems.length === 0) {
      // Inserir registro vazio para não tentar de novo
      await supabaseAdmin.from("sale_items").insert([{
        sale_id: sale.id, description: "__empty__", quantity: 0, unit_price: 0, total_amount: 0, raw_json: {},
      }]);
      continue;
    }
    await supabaseAdmin.from("sale_items").delete().eq("sale_id", sale.id);
    await supabaseAdmin.from("sale_items").insert(
      saleItems.map((item) => ({
        sale_id: sale.id,
        description: item.nome ?? null,
        quantity: item.quantidade ?? null,
        unit_price: item.valor ?? null,
        total_amount: (item.quantidade ?? 0) * (item.valor ?? 0),
        raw_json: item,
      }))
    );
    itemsSynced += saleItems.length;
  }

  return { itemsSynced, hasMore: pending.length > BATCH };
}
