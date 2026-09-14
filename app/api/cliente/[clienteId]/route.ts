import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clienteId: string }> }) {
  const { clienteId } = await params;
  const vendedorId = req.nextUrl.searchParams.get("vendedor");

  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth() + 1;
  // Últimos 12 meses de histórico
  const d12 = new Date(Date.UTC(ano, mes - 13, 1));
  const inicioHist = `${d12.getUTCFullYear()}-${String(d12.getUTCMonth() + 1).padStart(2, "0")}-01`;

  // Buscar vendas do cliente — últimos 12 meses
  const { data: vendas } = await supabaseAdmin.from("sales")
    .select("id, sale_date, total_amount, status, raw_json")
    .eq("company_id", companyId)
    .gte("sale_date", inicioHist)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .order("sale_date", { ascending: false })
    .limit(2000);

  // Filtrar pelo cliente (comparar como string pois CA pode retornar id como número)
  const vendasCliente = (vendas ?? []).filter(v => {
    const raw = v.raw_json as { cliente?: { id?: unknown }; vendedor?: { id?: unknown } } | null;
    const clienteOk = String(raw?.cliente?.id) === clienteId;
    const vendedorOk = vendedorId ? String(raw?.vendedor?.id) === vendedorId : true;
    return clienteOk && vendedorOk;
  });

  if (!vendasCliente.length) {
    return NextResponse.json({ pedidos: [], sugestao: [], nomeCliente: "?" });
  }

  const nomeCliente = (vendasCliente[0].raw_json as { cliente?: { nome?: string } } | null)?.cliente?.nome ?? "?";

  // Buscar itens de todas as vendas
  const saleIds = vendasCliente.map(v => v.id);
  type Item = { sale_id: string; description: string | null; quantity: number | null; unit_price: number | null; raw_json: unknown };
  let allItems: Item[] = [];
  const CHUNK = 100;
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin.from("sale_items")
      .select("sale_id, description, quantity, unit_price, raw_json")
      .in("sale_id", chunk)
      .neq("description", "__empty__");
    allItems.push(...(data ?? []));
  }

  const itemsBySale = new Map<string, Item[]>();
  for (const item of allItems) {
    const cur = itemsBySale.get(item.sale_id) ?? [];
    cur.push(item);
    itemsBySale.set(item.sale_id, cur);
  }

  // Montar pedidos formatados
  const pedidos = vendasCliente.map(v => ({
    id: v.id,
    data: v.sale_date,
    total: v.total_amount,
    itens: (itemsBySale.get(v.id) ?? []).map(it => ({
      nome: it.description ?? "?",
      qty: it.quantity ?? 1,
      preco: it.unit_price ?? 0,
    })),
  }));

  // ---- SUGESTÃO DE PRÉ-PEDIDO ----
  // Analisar produtos comprados nos últimos 3 pedidos (ou últimos 3 meses)
  const pedidosRecentes = pedidos.slice(0, 6); // últimos 6 pedidos para análise
  const totalPedidos = pedidosRecentes.length;

  // Mapa: nome do produto → { ocorrências, qtd total }
  const prodMap = new Map<string, { nome: string; ocorrencias: number; qtdTotal: number; precoUnitario: number }>();
  for (const p of pedidosRecentes) {
    // Um produto por pedido conta uma vez para frequência
    const produtosPedido = new Set<string>();
    for (const it of p.itens) {
      const key = it.nome.trim().toUpperCase();
      produtosPedido.add(key);
      const cur = prodMap.get(key);
      if (cur) {
        cur.qtdTotal += it.qty;
        cur.precoUnitario = it.preco || cur.precoUnitario;
      } else {
        prodMap.set(key, { nome: it.nome, ocorrencias: 0, qtdTotal: it.qty, precoUnitario: it.preco });
      }
    }
    for (const key of produtosPedido) {
      const cur = prodMap.get(key);
      if (cur) cur.ocorrencias += 1;
    }
  }

  // Sugestão: produtos que aparecem em ≥33% dos pedidos recentes, ordenados por frequência
  const sugestao = Array.from(prodMap.values())
    .filter(p => totalPedidos === 0 || p.ocorrencias / totalPedidos >= 0.33)
    .map(p => ({
      nome: p.nome,
      qtdSugerida: Math.ceil(p.qtdTotal / p.ocorrencias), // média por pedido
      frequencia: Math.round((p.ocorrencias / totalPedidos) * 100),
      preco: p.precoUnitario,
    }))
    .sort((a, b) => b.frequencia - a.frequencia);

  return NextResponse.json({ pedidos, sugestao, nomeCliente, totalPedidos });
}
