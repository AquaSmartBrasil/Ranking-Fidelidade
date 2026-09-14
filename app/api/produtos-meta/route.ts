import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function diasUteisRestantes(brNow: Date): number {
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth();
  const hoje = brNow.getUTCDate();
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = hoje; d <= ultimoDia; d++) {
    const dow = new Date(Date.UTC(ano, mes, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count || 1;
}

function classifyLine(name: string): 1 | 2 | 3 | null {
  const n = name.toUpperCase();
  if (/(MICROVIDA|PLÂNCTON|PLANCTON|ROTÍFER|ROTIFER|COPÉPOD|COPEPOD|ARTEMIA|ALGA|NANNOCHLOROP|MICROALG|ZOOPLANCTON|FITOPLANCTON|NANNO|ISOCHRYSIS|TETRASELMIS|CHAETOCEROS)/.test(n)) return 3;
  if (/(PEIXE|FISH|ORNAMENTAL|AMPHIPRION|CLOWN|CORYDORAS|TETRA|DISCUS|BETTA|GUPPY|MOLLY|CORAL|CAMARÃO|CAMARAO|LAGOSTA)/.test(n)) return 2;
  if (/(CONGEL|FROZEN|ALIMENTO|RAÇÃO|RACAO|BLOODWORM|BRINE|DAPHNIA|KRILL|TUBIFEX|MINHOCA|MYSIS)/.test(n)) return 1;
  return null;
}

const LINE_NAMES: Record<number, string> = { 1: "Congelados", 2: "Peixes", 3: "Microvida" };
const LINE_EMOJI: Record<number, string> = { 1: "🧊", 2: "🐟", 3: "🦠" };
const EXCLUDE = '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")';
const TOP_N = 30;

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth() + 1;
  const mesAtualStr = `${ano}-${String(mes).padStart(2, "0")}`;
  const inicioMes = `${mesAtualStr}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const diasRestantes = diasUteisRestantes(brNow);

  // Últimos 12 meses completos para histórico
  const d12 = new Date(Date.UTC(ano, mes - 13, 1));
  const inicioHist = `${d12.getUTCFullYear()}-${String(d12.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const fimHist = new Date(ano, mes - 1, 0).toISOString().slice(0, 10);

  // Metas dos vendedores
  const { data: goals } = await supabaseAdmin
    .from("vendedor_goals")
    .select("vendedor_id, vendedor_nome, meta_mensal")
    .eq("company_id", companyId)
    .eq("excluido", false);

  if (!goals?.length) return NextResponse.json({ produtos: [], vendedores: [], diasRestantes, mes: mesAtualStr });

  // Vendas históricas + mês atual
  const [{ data: salesHist }, { data: salesMes }] = await Promise.all([
    supabaseAdmin.from("sales").select("id, raw_json")
      .eq("company_id", companyId).gte("sale_date", inicioHist).lte("sale_date", fimHist)
      .not("status", "in", EXCLUDE).limit(10000),
    supabaseAdmin.from("sales").select("id, raw_json")
      .eq("company_id", companyId).gte("sale_date", inicioMes).lte("sale_date", fimMes)
      .not("status", "in", EXCLUDE).limit(5000),
  ]);

  const allSaleIds = [...(salesHist ?? []), ...(salesMes ?? [])].map(s => s.id);

  // Itens de todas as vendas
  type RawItem = { sale_id: string; description: string | null; quantity: number | null; unit_price: number | null; total_amount: number | null };
  let allItems: RawItem[] = [];
  for (let i = 0; i < allSaleIds.length; i += 100) {
    const { data } = await supabaseAdmin.from("sale_items")
      .select("sale_id, description, quantity, unit_price, total_amount")
      .in("sale_id", allSaleIds.slice(i, i + 100))
      .neq("description", "__empty__");
    allItems.push(...(data ?? []));
  }

  const itemsBySale = new Map<string, RawItem[]>();
  for (const item of allItems) {
    const cur = itemsBySale.get(item.sale_id) ?? [];
    cur.push(item);
    itemsBySale.set(item.sale_id, cur);
  }

  // ── Histórico por produto e por vendedor ──────────────────────────────────
  // hist[produto][vendedor] = { receita, unidades }
  type VendHist = { receita: number; unidades: number };
  const histProdVend = new Map<string, Map<string, VendHist>>();
  // receita total por vendedor (para calcular proporção)
  const receitaTotalVend = new Map<string, number>();

  for (const s of salesHist ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: unknown } } | null;
    const vId = String(raw?.vendedor?.id ?? "");
    if (!vId || vId === "undefined") continue;
    for (const item of itemsBySale.get(s.id) ?? []) {
      if (!item.description) continue;
      const key = item.description.trim();
      const qty = item.quantity ?? 0;
      const receita = item.total_amount ?? (qty * (item.unit_price ?? 0));

      // por produto/vendedor
      if (!histProdVend.has(key)) histProdVend.set(key, new Map());
      const byVend = histProdVend.get(key)!;
      const cur = byVend.get(vId);
      if (cur) { cur.receita += receita; cur.unidades += qty; }
      else byVend.set(vId, { receita, unidades: qty });

      // receita total do vendedor
      receitaTotalVend.set(vId, (receitaTotalVend.get(vId) ?? 0) + receita);
    }
  }

  // ── Progresso do mês atual por produto e vendedor ─────────────────────────
  // mes[produto][vendedor] = unidades
  const mesProdVend = new Map<string, Map<string, number>>();
  for (const s of salesMes ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: unknown } } | null;
    const vId = String(raw?.vendedor?.id ?? "");
    if (!vId || vId === "undefined") continue;
    for (const item of itemsBySale.get(s.id) ?? []) {
      if (!item.description) continue;
      const key = item.description.trim();
      const qty = item.quantity ?? 0;
      if (!mesProdVend.has(key)) mesProdVend.set(key, new Map());
      const byVend = mesProdVend.get(key)!;
      byVend.set(vId, (byVend.get(vId) ?? 0) + qty);
    }
  }

  // ── Calcular meta e progresso por produto ─────────────────────────────────
  type VendedorMeta = { id: string; nome: string; metaUnidades: number; vendidoMes: number; pctMes: number | null };
  type ProdutoOut = {
    nome: string; linha: number | null; linhaLabel: string; linhaEmoji: string;
    receitaHistTotal: number; precoMedio: number;
    empresa: { metaUnidades: number; vendidoMes: number; pctMes: number | null; metaDia: number };
    vendedores: VendedorMeta[];
  };

  const produtos: ProdutoOut[] = [];

  for (const [nomeProd, byVend] of histProdVend.entries()) {
    const linha = classifyLine(nomeProd);
    let receitaHistTotal = 0;
    let unidadesHistTotal = 0;
    for (const v of byVend.values()) { receitaHistTotal += v.receita; unidadesHistTotal += v.unidades; }
    const precoMedio = unidadesHistTotal > 0 ? receitaHistTotal / unidadesHistTotal : 0;

    const vendedoresOut: VendedorMeta[] = [];
    let metaEmpresaTotal = 0;
    let vendidoEmpresaTotal = 0;

    for (const g of goals) {
      const vId = g.vendedor_id;
      const metaMensal = g.meta_mensal ?? 0;
      const receitaTotalV = receitaTotalVend.get(vId) ?? 0;
      const histV = byVend.get(vId);
      if (!histV) continue; // esse vendedor não vendeu esse produto no histórico

      const propReceita = receitaTotalV > 0 ? histV.receita / receitaTotalV : 0;
      const metaReceitaProd = metaMensal * propReceita;
      const metaUnidades = precoMedio > 0 ? Math.ceil(metaReceitaProd / precoMedio) : 0;
      const vendidoMes = mesProdVend.get(nomeProd)?.get(vId) ?? 0;
      const pctMes = metaUnidades > 0 ? Math.round((vendidoMes / metaUnidades) * 100) : null;

      vendedoresOut.push({ id: vId, nome: g.vendedor_nome, metaUnidades, vendidoMes, pctMes });
      metaEmpresaTotal += metaUnidades;
      vendidoEmpresaTotal += vendidoMes;
    }

    if (metaEmpresaTotal === 0 && vendidoEmpresaTotal === 0) continue;

    const pctEmpresa = metaEmpresaTotal > 0 ? Math.round((vendidoEmpresaTotal / metaEmpresaTotal) * 100) : null;
    const restante = Math.max(0, metaEmpresaTotal - vendidoEmpresaTotal);
    const metaDia = Math.ceil(restante / diasRestantes);

    produtos.push({
      nome: nomeProd,
      linha,
      linhaLabel: linha ? LINE_NAMES[linha] : "Outros",
      linhaEmoji: linha ? LINE_EMOJI[linha] : "📦",
      receitaHistTotal,
      precoMedio: Math.round(precoMedio * 100) / 100,
      empresa: { metaUnidades: metaEmpresaTotal, vendidoMes: vendidoEmpresaTotal, pctMes: pctEmpresa, metaDia },
      vendedores: vendedoresOut,
    });
  }

  // Ordenar por receita histórica total (os mais importantes primeiro) → top 30
  produtos.sort((a, b) => b.receitaHistTotal - a.receitaHistTotal);
  const top30 = produtos.slice(0, TOP_N);

  const vendedorNomes = goals.map(g => ({ id: g.vendedor_id, nome: g.vendedor_nome }));

  return NextResponse.json({ produtos: top30, vendedores: vendedorNomes, diasRestantes, mes: mesAtualStr });
}
