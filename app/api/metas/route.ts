import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function classifyByCategory(cat: string): 1 | 2 | 3 | null {
  const c = cat.toUpperCase();
  if (/(MICROVIDA|PLANCTON|PLÂNCTON|ALGA|ROTIFER|COPEPOD|ARTEMIA|MICROALG|ZOOPLANCTON|FITOPLANCTON)/.test(c)) return 3;
  if (/(PEIXE|FISH|ORNAMENTAL|CORAL|INVERTEBRADO|CAMARAO|CAMARÃO|LAGOSTA)/.test(c)) return 2;
  if (/(CONGEL|FROZEN|ALIMENTO|RAÇÃO|RACAO|BLOODWORM|BRINE|KRILL|TUBIFEX|MINHOCA|MYSIS)/.test(c)) return 1;
  return null;
}
function classifyByName(name: string): 1 | 2 | 3 | null {
  const n = name.toUpperCase();
  if (/(MICROVIDA|PLÂNCTON|PLANCTON|ROTÍFER|ROTIFER|COPÉPOD|COPEPOD|ARTEMIA|ALGA|NANNOCHLOROP|MICROALG|ZOOPLANCTON|FITOPLANCTON|NANNO|ISOCHRYSIS|TETRASELMIS|CHAETOCEROS)/.test(n)) return 3;
  if (/(PEIXE|FISH|ORNAMENTAL|AMPHIPRION|CLOWN|CORYDORAS|TETRA|DISCUS|BETTA|GUPPY|MOLLY|CORAL|CAMARÃO|CAMARAO|LAGOSTA)/.test(n)) return 2;
  if (/(CONGEL|FROZEN|ALIMENTO|RAÇÃO|RACAO|BLOODWORM|BRINE|DAPHNIA|KRILL|TUBIFEX|MINHOCA|MYSIS)/.test(n)) return 1;
  return null;
}

// Brasília = UTC-3
function nowBrasilia() {
  const utc = Date.now();
  const br = new Date(utc - 3 * 60 * 60 * 1000);
  return { y: br.getUTCFullYear(), m: br.getUTCMonth() + 1, hoje: br.toISOString().slice(0, 10) };
}

function getPeriodBounds(periodo: string, inicioCustom?: string, fimCustom?: string) {
  const { y, m, hoje } = nowBrasilia();
  if (periodo === "mes") return { inicio: `${y}-${String(m).padStart(2,"0")}-01`, fim: hoje };
  if (periodo === "trimestre") {
    const trimM = Math.floor((m-1)/3)*3 + 1;
    return { inicio: `${y}-${String(trimM).padStart(2,"0")}-01`, fim: hoje };
  }
  if (periodo === "semestre") {
    return { inicio: m <= 6 ? `${y}-01-01` : `${y}-07-01`, fim: hoje };
  }
  if (periodo === "ano") return { inicio: `${y}-01-01`, fim: hoje };
  if (periodo === "custom" && inicioCustom && fimCustom) return { inicio: inicioCustom, fim: fimCustom };
  return { inicio: `${y}-${String(m).padStart(2,"0")}-01`, fim: hoje };
}

export async function GET(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const vendedorId = req.nextUrl.searchParams.get("vendedor");
  const periodo = req.nextUrl.searchParams.get("periodo") ?? "mes";
  const inicioCustom = req.nextUrl.searchParams.get("inicio") ?? undefined;
  const fimCustom = req.nextUrl.searchParams.get("fim") ?? undefined;

  const { y: anoAtual, m: mesAtual, hoje } = nowBrasilia();

  // Período selecionado
  const { inicio, fim } = getPeriodBounds(periodo, inicioCustom, fimCustom);

  // Para os % de metas, buscar os 4 períodos fixos sempre
  const inicioAno = `${anoAtual}-01-01`;
  const m = mesAtual;
  const inicioTrim = new Date(anoAtual, Math.floor((m-1)/3)*3, 1).toISOString().slice(0,10);
  const inicioSem = m <= 6 ? `${anoAtual}-01-01` : `${anoAtual}-07-01`;
  const inicioMes = `${anoAtual}-${String(m).padStart(2,"0")}-01`;

  // Query 1: ano atual (para totalMes/Trim/Sem/Ano/Periodo)
  const { data: allSales } = await supabaseAdmin.from("sales")
    .select("id, sale_date, total_amount, raw_json")
    .eq("company_id", companyId)
    .gte("sale_date", inicioAno).lte("sale_date", hoje)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .limit(5000);

  // Query 2: 6 meses anteriores (só para calcular meta automática por histórico)
  const inicio6mHist = new Date(anoAtual, mesAtual - 7, 1).toISOString().slice(0, 10);
  const { data: salesHist } = await supabaseAdmin.from("sales")
    .select("sale_date, total_amount, raw_json")
    .eq("company_id", companyId)
    .gte("sale_date", inicio6mHist).lt("sale_date", inicioAno)
    .not("status", "in", '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")')
    .limit(3000);

  // Totais por vendedor para cada período
  type VendedorStats = {
    id: string; nome: string; clientes: Set<string>;
    totalPeriodo: number; totalMes: number; totalTrim: number; totalSem: number; totalAno: number;
  };
  const vendedoresMap = new Map<string, VendedorStats>();

  for (const s of allSales ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string; nome?: string }; cliente?: { id?: string } } | null;
    const vId = raw?.vendedor?.id;
    if (!vId) continue;
    if (!vendedoresMap.has(vId)) vendedoresMap.set(vId, {
      id: vId, nome: raw?.vendedor?.nome ?? "—", clientes: new Set(),
      totalPeriodo: 0, totalMes: 0, totalTrim: 0, totalSem: 0, totalAno: 0,
    });
    const v = vendedoresMap.get(vId)!;
    const d = s.sale_date ?? "";
    const amt = s.total_amount ?? 0;
    if (d >= inicio && d <= fim) v.totalPeriodo += amt;
    if (d >= inicioMes) v.totalMes += amt;
    if (d >= inicioTrim) v.totalTrim += amt;
    if (d >= inicioSem) v.totalSem += amt;
    if (d >= inicioAno) v.totalAno += amt;
    if (raw?.cliente?.id) v.clientes.add(raw.cliente.id);
  }

  // Buscar metas manuais dos vendedores (se existirem) e quais estão excluídos
  const { data: goalsRows } = await supabaseAdmin
    .from("vendedor_goals").select("vendedor_id, meta_mensal, excluido").eq("company_id", companyId);
  const goalsMap = new Map<string, number>();
  const excludedIds = new Set<string>();
  for (const g of goalsRows ?? []) {
    goalsMap.set(g.vendedor_id, Number(g.meta_mensal) || 0);
    if (g.excluido) excludedIds.add(g.vendedor_id);
  }

  // Remover vendedores excluídos da lista ativa
  for (const id of excludedIds) vendedoresMap.delete(id);

  // Upsert vendedores detectados nas vendas para a tabela de goals (para aparecer no admin)
  const upsertData = Array.from(vendedoresMap.values()).map(v => ({
    company_id: companyId, vendedor_id: v.id, vendedor_nome: v.nome,
    meta_mensal: goalsMap.get(v.id) ?? 0,
    updated_at: new Date().toISOString(),
  }));
  if (upsertData.length > 0) {
    await supabaseAdmin.from("vendedor_goals").upsert(upsertData, {
      onConflict: "company_id,vendedor_id", ignoreDuplicates: false,
    });
  }

  // Meta = manual se existir, senão média dos 6 meses anteriores ao ano (salesHist)
  const mesesCount6 = 6;

  const vendedores = Array.from(vendedoresMap.values()).map(v => {
    const manualMensal = goalsMap.get(v.id) ?? 0;
    const total6m = (salesHist ?? [])
      .filter(s => {
        const raw = s.raw_json as { vendedor?: { id?: string } } | null;
        return raw?.vendedor?.id === v.id;
      })
      .reduce((acc, s) => acc + (s.total_amount ?? 0), 0);
    const mediaMensal = manualMensal > 0 ? manualMensal : total6m / mesesCount6;
    const metaAnual = Math.round(mediaMensal * 12);
    const metaSemestre = Math.round(mediaMensal * 6);
    const metaTrimestre = Math.round(mediaMensal * 3);
    const metaMes = Math.round(mediaMensal);
    const metaManual = manualMensal > 0;

    return {
      id: v.id, nome: v.nome,
      totalClientes: v.clientes.size,
      totalPeriodo: v.totalPeriodo,
      totalMes: v.totalMes, totalTrim: v.totalTrim, totalSem: v.totalSem, totalAno: v.totalAno,
      metaMes, metaTrimestre, metaSemestre, metaAnual, metaManual,
      pctMes: metaMes > 0 ? Math.round((v.totalMes / metaMes) * 100) : null,
      pctTrim: metaTrimestre > 0 ? Math.round((v.totalTrim / metaTrimestre) * 100) : null,
      pctSem: metaSemestre > 0 ? Math.round((v.totalSem / metaSemestre) * 100) : null,
      pctAno: metaAnual > 0 ? Math.round((v.totalAno / metaAnual) * 100) : null,
    };
  }).sort((a, b) => b.totalPeriodo - a.totalPeriodo);

  if (!vendedorId) return NextResponse.json({ vendedores, periodo, inicio, fim, _debug: { hoje, inicioMes, inicioTrim, inicioQuery, allSalesCount: allSales?.length } });

  // === Carteira de um vendedor ===
  const vendasVendedor = (allSales ?? []).filter(s => {
    const raw = s.raw_json as { vendedor?: { id?: string } } | null;
    return raw?.vendedor?.id === vendedorId && (s.sale_date ?? "") >= inicio && (s.sale_date ?? "") <= fim;
  });

  const vendasHistorico = (allSales ?? []).filter(s => {
    const raw = s.raw_json as { vendedor?: { id?: string } } | null;
    return raw?.vendedor?.id === vendedorId;
  });

  const { data: allProducts } = await supabaseAdmin.from("products")
    .select("conta_azul_id, name, raw_json").eq("company_id", companyId).limit(2000);
  const productCatMap = new Map<string, string>();
  for (const p of allProducts ?? []) {
    const cat = (p.raw_json as { categoria?: { descricao?: string } } | null)?.categoria?.descricao;
    if (cat && cat !== "__none__") productCatMap.set(p.conta_azul_id, cat);
  }

  type MonthData = { mes: string; total: number; count: number };
  type ClientData = {
    id: string; nome: string; email: string;
    meses: Map<string, MonthData>; saleIdsPeriodo: string[]; saleIdsHistorico: string[]; lines: Set<number>;
  };
  const clientesMap = new Map<string, ClientData>();

  for (const s of vendasHistorico) {
    const raw = s.raw_json as { cliente?: { id?: string; nome?: string; email?: string } } | null;
    const cid = raw?.cliente?.id ?? "unknown";
    if (!clientesMap.has(cid)) clientesMap.set(cid, { id: cid, nome: raw?.cliente?.nome ?? "Sem nome", email: raw?.cliente?.email ?? "", meses: new Map(), saleIdsPeriodo: [], saleIdsHistorico: [], lines: new Set() });
    const c = clientesMap.get(cid)!;
    const mes = (s.sale_date ?? "").slice(0, 7);
    c.saleIdsHistorico.push(s.id);
    const m2 = c.meses.get(mes) ?? { mes, total: 0, count: 0 };
    m2.total += s.total_amount ?? 0;
    m2.count += 1;
    c.meses.set(mes, m2);
  }
  for (const s of vendasVendedor) {
    const raw = s.raw_json as { cliente?: { id?: string } } | null;
    const cid = raw?.cliente?.id ?? "unknown";
    clientesMap.get(cid)?.saleIdsPeriodo.push(s.id);
  }

  // Buscar itens para classificar linhas
  const allSaleIds = vendasHistorico.map(s => s.id).slice(0, 500);
  if (allSaleIds.length > 0) {
    const { data: items } = await supabaseAdmin.from("sale_items")
      .select("sale_id, description, raw_json").in("sale_id", allSaleIds).neq("description", "__empty__");
    const saleClientMap = new Map<string, string>();
    for (const s of vendasHistorico) {
      const raw = s.raw_json as { cliente?: { id?: string } } | null;
      saleClientMap.set(s.id, raw?.cliente?.id ?? "unknown");
    }
    for (const item of items ?? []) {
      const cid = saleClientMap.get(item.sale_id);
      if (!cid) continue;
      const c = clientesMap.get(cid);
      if (!c) continue;
      const idItem = (item.raw_json as { id_item?: string } | null)?.id_item ?? "";
      const cat = productCatMap.get(idItem);
      const line = cat ? classifyByCategory(cat) : classifyByName(item.description ?? "");
      if (line) c.lines.add(line);
    }
  }

  const mesAtualStr = `${anoAtual}-${String(mesAtual).padStart(2,"0")}`;
  const mesesCompletos3 = [1,2,3].map(i => {
    const d = new Date(anoAtual, mesAtual - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });

  const carteira = Array.from(clientesMap.values()).map(c => {
    const historico = Array.from(c.meses.values()).sort((a,b) => a.mes.localeCompare(b.mes));
    const ultimos3 = mesesCompletos3.map(m => c.meses.get(m)?.total ?? 0);
    const mediaUlt3 = ultimos3.reduce((s,v) => s+v, 0) / 3;
    const metaMes = Math.round(mediaUlt3 * 1.05);
    const realizadoPeriodo = (c.saleIdsPeriodo.length > 0)
      ? vendasVendedor.filter(s => c.saleIdsPeriodo.includes(s.id)).reduce((acc,s) => acc + (s.total_amount ?? 0), 0)
      : 0;
    const comprou = c.saleIdsPeriodo.length > 0;
    const pctMeta = metaMes > 0 && periodo === "mes" ? Math.round((realizadoPeriodo / metaMes) * 100) : null;
    return {
      id: c.id, nome: c.nome, email: c.email, historico,
      metaMes, realizadoPeriodo, pctMeta, comprou,
      lines: Array.from(c.lines).sort(), ultimaCompra: historico.at(-1)?.mes ?? null,
    };
  })
  .filter(c => c.comprou || c.metaMes > 0)
  .sort((a,b) => (b.realizadoPeriodo || b.metaMes) - (a.realizadoPeriodo || a.metaMes));

  return NextResponse.json({ vendedores, carteira, periodo, inicio, fim });
}
