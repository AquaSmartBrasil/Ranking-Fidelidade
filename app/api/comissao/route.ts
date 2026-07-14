import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

function calcScore(value: number, purchases: number, lineCount: number, inadimplente: boolean) {
  return Math.max(0,
    lineCount +
    purchases * 3 +
    Math.floor(value / 1000) -
    (inadimplente ? 5 : 0)
  );
}

function getLevel(value: number, purchases: number, lineCount: number): string {
  if (lineCount >= 3 && purchases > 2 && value > 5000) return "Platinum";
  if (lineCount >= 3 && purchases > 2)                 return "Gold";
  if (lineCount >= 3)                                  return "Silver";
  return "Bronze";
}

export async function GET(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  // Mês selecionado (default: mês atual em BRT)
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const mesParam = req.nextUrl.searchParams.get("mes");
  const [ano, mes] = mesParam
    ? mesParam.split("-").map(Number)
    : [brNow.getUTCFullYear(), brNow.getUTCMonth() + 1];

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  // Mês anterior (para comparar ranking)
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const inicioMesAnt = `${anoAnt}-${String(mesAnt).padStart(2, "0")}-01`;
  const fimMesAnt = new Date(anoAnt, mesAnt, 0).toISOString().slice(0, 10);

  const EXCLUDE = '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")';

  // Metas dos vendedores
  const { data: goalsRows } = await supabaseAdmin
    .from("vendedor_goals").select("vendedor_id, vendedor_nome, meta_mensal, meta_clientes, excluido")
    .eq("company_id", companyId);

  const goalsMap = new Map<string, { metaMensal: number; metaClientes: number; nome: string }>();
  for (const g of goalsRows ?? []) {
    if (!g.excluido) goalsMap.set(g.vendedor_id, {
      metaMensal: Number(g.meta_mensal) || 0,
      metaClientes: Number(g.meta_clientes) || 0,
      nome: g.vendedor_nome ?? g.vendedor_id,
    });
  }

  // Vendas do mês atual e anterior
  const [{ data: salesMes }, { data: salesAnt }] = await Promise.all([
    supabaseAdmin.from("sales").select("id, sale_date, total_amount, raw_json")
      .eq("company_id", companyId).gte("sale_date", inicioMes).lte("sale_date", fimMes)
      .not("status", "in", EXCLUDE).limit(5000),
    supabaseAdmin.from("sales").select("id, sale_date, total_amount, raw_json")
      .eq("company_id", companyId).gte("sale_date", inicioMesAnt).lte("sale_date", fimMesAnt)
      .not("status", "in", EXCLUDE).limit(5000),
  ]);

  // Produtos para classificação
  const { data: allProducts } = await supabaseAdmin
    .from("products").select("conta_azul_id, raw_json").eq("company_id", companyId).limit(2000);
  const productCatMap = new Map<string, string>();
  for (const p of allProducts ?? []) {
    const cat = (p.raw_json as { categoria?: { descricao?: string } } | null)?.categoria?.descricao;
    if (cat && cat !== "__none__") productCatMap.set(p.conta_azul_id, cat);
  }

  // Itens das vendas dos dois meses para calcular ranking
  const allSaleIds = [
    ...(salesMes ?? []).map(s => s.id),
    ...(salesAnt ?? []).map(s => s.id),
  ];
  const { data: allItems } = allSaleIds.length > 0
    ? await supabaseAdmin.from("sale_items").select("sale_id, description, raw_json")
        .in("sale_id", allSaleIds).neq("description", "__empty__").limit(20000)
    : { data: [] };

  // Mapa itens por venda
  const itemsBySale = new Map<string, Set<number>>();
  for (const item of allItems ?? []) {
    const raw = item.raw_json as { id_item?: string } | null;
    const cat = productCatMap.get(raw?.id_item ?? "");
    const line = cat ? classifyByCategory(cat) : classifyByName(item.description ?? "");
    if (!line) continue;
    const set = itemsBySale.get(item.sale_id) ?? new Set();
    set.add(line);
    itemsBySale.set(item.sale_id, set);
  }

  // Calcular score de cada cliente por mês
  type ClientScore = { value: number; purchases: number; lines: Set<number>; inadimplente: boolean };

  function buildClientScores(sales: typeof salesMes) {
    const map = new Map<string, ClientScore>();
    for (const s of sales ?? []) {
      const raw = s.raw_json as { cliente?: { id?: string }; tipo_pendencia?: { nome?: string } } | null;
      const cid = raw?.cliente?.id ?? "unknown";
      const cur = map.get(cid) ?? { value: 0, purchases: 0, lines: new Set(), inadimplente: false };
      cur.value += s.total_amount ?? 0;
      cur.purchases += 1;
      const lines = itemsBySale.get(s.id) ?? new Set();
      lines.forEach(l => cur.lines.add(l));
      if (raw?.tipo_pendencia?.nome && raw.tipo_pendencia.nome !== "NENHUMA") cur.inadimplente = true;
      map.set(cid, cur);
    }
    return map;
  }

  // Agrupar por vendedor
  type VendedorMes = {
    id: string; nome: string;
    totalVendido: number; clientesAtendidos: Set<string>;
    temInadimplencia: boolean; saleIds: string[];
  };

  function buildVendedorData(sales: typeof salesMes) {
    const map = new Map<string, VendedorMes>();
    for (const s of sales ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string; nome?: string }; cliente?: { id?: string }; tipo_pendencia?: { nome?: string } } | null;
      const vId = raw?.vendedor?.id; if (!vId) continue;
      if (!goalsMap.has(vId)) continue;
      const cur = map.get(vId) ?? { id: vId, nome: raw?.vendedor?.nome ?? "—", totalVendido: 0, clientesAtendidos: new Set(), temInadimplencia: false, saleIds: [] };
      cur.totalVendido += s.total_amount ?? 0;
      if (raw?.cliente?.id) cur.clientesAtendidos.add(raw.cliente.id);
      if (raw?.tipo_pendencia?.nome && raw.tipo_pendencia.nome !== "NENHUMA") cur.temInadimplencia = true;
      cur.saleIds.push(s.id);
      map.set(vId, cur);
    }
    return map;
  }

  const vendMes = buildVendedorData(salesMes);
  const vendAnt = buildVendedorData(salesAnt);

  // Scores por cliente em cada mês
  const scoresMes = buildClientScores(salesMes);
  const scoresAnt = buildClientScores(salesAnt);

  // Vendedor de cada cliente no mês atual
  const clienteVendedor = new Map<string, string>();
  for (const s of salesMes ?? []) {
    const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string } } | null;
    if (raw?.cliente?.id && raw?.vendedor?.id) clienteVendedor.set(raw.cliente.id, raw.vendedor.id);
  }

  // Clientes que subiram do Bronze
  const bronzeUpgrades = new Map<string, number>(); // vendedorId → count
  for (const [cid, scoreMesData] of scoresMes) {
    const scoreAntData = scoresAnt.get(cid);
    const nivelAnt = scoreAntData ? getLevel(scoreAntData.value, scoreAntData.purchases, scoreAntData.lines.size || 1) : "Bronze";
    const nivelMes = getLevel(scoreMesData.value, scoreMesData.purchases, scoreMesData.lines.size || 1);
    if (nivelAnt === "Bronze" && nivelMes !== "Bronze") {
      const vId = clienteVendedor.get(cid);
      if (vId) bronzeUpgrades.set(vId, (bronzeUpgrades.get(vId) ?? 0) + 1);
    }
  }

  // Calcular comissão por vendedor
  const BONUS_BRONZE = 50;
  const PCT_FATURAMENTO = 0.02;
  const PCT_CLIENTES = 0.02;
  const PCT_INADIMPLENCIA = 0.02;

  const vendedores = Array.from(goalsMap.entries()).map(([vId, goal]) => {
    const mes = vendMes.get(vId);
    const totalVendido = mes?.totalVendido ?? 0;
    const clientesAtendidos = mes?.clientesAtendidos.size ?? 0;
    const temInadimplencia = mes?.temInadimplencia ?? false;
    const metaMensal = goal.metaMensal;
    const metaClientes = goal.metaClientes;

    const bateuFaturamento = true;
    const bateuClientes = metaClientes > 0 && clientesAtendidos >= metaClientes;
    const semInadimplencia = !temInadimplencia;

    const comissaoFaturamento = bateuFaturamento ? Math.round(totalVendido * PCT_FATURAMENTO) : 0;
    const comissaoClientes = bateuClientes ? Math.round(totalVendido * PCT_CLIENTES) : 0;
    const comissaoInadimplencia = semInadimplencia ? Math.round(totalVendido * PCT_INADIMPLENCIA) : 0;
    const upgrades = 0;
    const bonusRanking = 0;
    const totalComissao = comissaoFaturamento + comissaoClientes + comissaoInadimplencia;

    const pctFaturamento = metaMensal > 0 ? Math.round((totalVendido / metaMensal) * 100) : null;
    const pctClientes = metaClientes > 0 ? Math.round((clientesAtendidos / metaClientes) * 100) : null;

    return {
      id: vId, nome: goal.nome,
      totalVendido, clientesAtendidos,
      metaMensal, metaClientes,
      pctFaturamento, pctClientes,
      bateuFaturamento, bateuClientes, semInadimplencia, temInadimplencia,
      comissaoFaturamento, comissaoClientes, comissaoInadimplencia,
      upgrades, bonusRanking, totalComissao,
    };
  }).sort((a, b) => b.totalComissao - a.totalComissao);

  return NextResponse.json({
    mes: `${ano}-${String(mes).padStart(2, "0")}`,
    vendedores,
    regras: {
      pctFaturamento: PCT_FATURAMENTO * 100,
      pctClientes: PCT_CLIENTES * 100,
      pctInadimplencia: PCT_INADIMPLENCIA * 100,
      bonusBronze: BONUS_BRONZE,
    },
  });
}
