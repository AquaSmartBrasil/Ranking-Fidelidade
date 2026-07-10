import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Classificação por categoria do produto (prioridade) ou nome (fallback)
function classifyByCategory(categoria: string): 1 | 2 | 3 | null {
  const c = categoria.toUpperCase();
  if (/(MICROVIDA|PLANCTON|PLÂNCTON|ALGA|ROTIFER|COPEPOD|ARTEMIA|MICROALG|ZOOPLANCTON|FITOPLANCTON)/.test(c)) return 3;
  if (/(PEIXE|FISH|ORNAMENTAL|CORAL|INVERTEBRADO|CAMARAO|CAMARÃO|LAGOSTA)/.test(c)) return 2;
  if (/(CONGEL|FROZEN|ALIMENTO|RAÇÃO|RACAO|BLOODWORM|BRINE|KRILL|TUBIFEX|MINHOCA|MYSIS)/.test(c)) return 1;
  return null;
}

function classifyByName(name: string): 1 | 2 | 3 | null {
  const n = name.toUpperCase();
  if (/(MICROVIDA|PLÂNCTON|PLANCTON|ROTÍFER|ROTIFER|COPÉPOD|COPEPOD|ARTEMIA|ALGA|NANNOCHLOROP|MICROALG|ZOOPLANCTON|FITOPLANCTON|NANNO|ISOCHRYSIS|TETRASELMIS|CHAETOCEROS)/.test(n)) return 3;
  if (/(PEIXE|FISH|ORNAMENTAL|AMPHIPRION|CLOWN|CORYDORAS|TETRA|DISCUS|BETTA|GUPPY|MOLLY|CICHLID|ACARA|NEON|CARDINAL|OSCAR|LOACH|DANIO|RASBORA|CORAL|CAMARÃO|CAMARAO|LAGOSTA)/.test(n)) return 2;
  if (/(CONGEL|FROZEN|ALIMENTO|RAÇÃO|RACAO|BLOODWORM|BRINE|DAPHNIA|KRILL|TUBIFEX|MINHOCA|MYSIS)/.test(n)) return 1;
  return null;
}

// Modelo: 1pt/linha + 3pts/compra + 3pts/R$1000 - 5pts/inadimplência
const LEVELS = [
  { name: "Bronze",   min: 0,  max: 14,  color: "#cd7f32" },
  { name: "Silver",   min: 15, max: 19,  color: "#9ca3af" },
  { name: "Gold",     min: 20, max: 24,  color: "#eab308" },
  { name: "Platinum", min: 25, max: 29,  color: "#8b5cf6" },
  { name: "Diamante", min: 30, max: Infinity, color: "#06b6d4" },
];

function calcScore(value: number, purchases: number, lineCount: number, inadimplente: boolean) {
  const ptLinhas    = lineCount;                           // 1pt por linha
  const ptCompras   = purchases * 3;                       // 3pts por compra
  const ptValor     = Math.floor(value / 1000);            // 1pt por R$1000
  const penalidade  = inadimplente ? 5 : 0;               // -5pts inadimplência
  return Math.max(0, ptLinhas + ptCompras + ptValor - penalidade);
}

function getLevel(score: number) {
  return LEVELS.find(l => score >= l.min && score <= l.max) ?? LEVELS[0];
}

function getNextLevel(score: number) {
  const idx = LEVELS.findIndex(l => score >= l.min && score <= l.max);
  return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

export async function GET(req: NextRequest) {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const now = new Date();
  const mesParam = req.nextUrl.searchParams.get("mes"); // YYYY-MM
  const [ano, mes] = mesParam
    ? mesParam.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  // Buscar 4 meses: mês atual + 3 anteriores (para calcular recorrência)
  const inicio4m = new Date(ano, mes - 4, 1).toISOString().slice(0, 10);
  // Buscar 6 meses anteriores (para calcular meses de inatividade)
  const inicio6m = new Date(ano, mes - 7, 1).toISOString().slice(0, 10);
  const fimMesAnterior = new Date(ano, mes - 1, 0).toISOString().slice(0, 10);

  const EXCLUDE = '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")';

  const [{ data: sales4m }, { data: sales6mAnt }] = await Promise.all([
    supabaseAdmin.from("sales").select("id, sale_date, total_amount, raw_json")
      .eq("company_id", companyId).gte("sale_date", inicio4m).lte("sale_date", fimMes)
      .not("status", "in", EXCLUDE).limit(5000),
    supabaseAdmin.from("sales").select("sale_date, total_amount, raw_json")
      .eq("company_id", companyId).gte("sale_date", inicio6m).lte("sale_date", fimMesAnterior)
      .not("status", "in", EXCLUDE).limit(5000),
  ]);
  // salesAnt = apenas o mês imediatamente anterior (usado para prevValues)
  const mesAnteriorStr = new Date(ano, mes - 2, 1).toISOString().slice(0, 7);
  const salesAnt = (sales6mAnt ?? []).filter(s => (s.sale_date ?? "").slice(0,7) === mesAnteriorStr);

  const salesMes = (sales4m ?? []).filter(s => s.sale_date >= inicioMes);

  const saleIds = (salesMes ?? []).map(s => s.id);
  const [{ data: allItems }, { data: allProducts }] = await Promise.all([
    saleIds.length > 0
      ? supabaseAdmin.from("sale_items").select("sale_id, description, raw_json")
          .in("sale_id", saleIds).neq("description", "__empty__").limit(20000)
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from("products").select("conta_azul_id, raw_json")
      .eq("company_id", companyId).limit(2000),
  ]);

  // Mapa produto_id → categoria
  const productCategoryMap = new Map<string, string>();
  for (const p of allProducts ?? []) {
    const cat = (p.raw_json as { categoria?: { descricao?: string } } | null)?.categoria?.descricao;
    if (cat && cat !== "__none__") productCategoryMap.set(p.conta_azul_id, cat);
  }

  // Mapa de itens por sale_id com linha já resolvida
  const itemsBySale = new Map<string, { line: 1 | 2 | 3 | null }[]>();
  for (const item of allItems ?? []) {
    const raw = item.raw_json as { id_item?: string } | null;
    const productId = raw?.id_item ?? "";
    const categoria = productCategoryMap.get(productId);
    const line = categoria
      ? classifyByCategory(categoria)
      : classifyByName(item.description ?? "");
    const list = itemsBySale.get(item.sale_id) ?? [];
    list.push({ line });
    itemsBySale.set(item.sale_id, list);
  }

  // Agrupar vendas do mês por cliente
  type CustomerData = {
    id: string; name: string; value: number; purchases: number;
    lines: Set<number>; saleIds: string[];
  };
  const customersMes = new Map<string, CustomerData>();
  for (const s of salesMes ?? []) {
    const raw = s.raw_json as { cliente?: { id?: string; nome?: string } } | null;
    const cid = raw?.cliente?.id ?? "unknown";
    const cname = raw?.cliente?.nome ?? "Sem nome";
    const existing = customersMes.get(cid);
    if (existing) {
      existing.value += s.total_amount ?? 0;
      existing.purchases += 1;
      existing.saleIds.push(s.id);
    } else {
      customersMes.set(cid, { id: cid, name: cname, value: s.total_amount ?? 0, purchases: 1, lines: new Set(), saleIds: [s.id] });
    }
  }

  // Classificar linhas dos itens
  for (const [cid, cdata] of customersMes) {
    for (const saleId of cdata.saleIds) {
      const items = itemsBySale.get(saleId) ?? [];
      for (const item of items) {
        if (item.line) cdata.lines.add(item.line);
      }
    }
  }

  // Mês anterior: valor por cliente
  const prevValues = new Map<string, number>();
  for (const s of salesAnt ?? []) {
    const raw = s.raw_json as { cliente?: { id?: string } } | null;
    const cid = raw?.cliente?.id ?? "unknown";
    prevValues.set(cid, (prevValues.get(cid) ?? 0) + (s.total_amount ?? 0));
  }

  // Mapear meses em que cada cliente comprou nos últimos 6 meses anteriores
  const clienteMesesHist = new Map<string, { nome: string; meses: Set<string>; lastValue: number }>();
  for (const s of sales6mAnt ?? []) {
    const raw = s.raw_json as { cliente?: { id?: string; nome?: string } } | null;
    const cid = raw?.cliente?.id ?? "unknown";
    const mesSale = (s.sale_date ?? "").slice(0, 7);
    const cur = clienteMesesHist.get(cid) ?? { nome: raw?.cliente?.nome ?? "Sem nome", meses: new Set(), lastValue: 0 };
    cur.meses.add(mesSale);
    if (mesSale === mesAnteriorStr) cur.lastValue += s.total_amount ?? 0;
    clienteMesesHist.set(cid, cur);
  }

  // Calcular meses consecutivos de inatividade (contando para trás a partir do mês atual)
  function mesesInativos(mesesComCompra: Set<string>): number {
    let count = 0;
    for (let i = 1; i <= 6; i++) {
      const d = new Date(ano, mes - 1 - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (mesesComCompra.has(key)) break;
      count++;
    }
    return count;
  }

  // Inativos: compraram nos últimos 6 meses mas não neste mês
  const inactivos: { id: string; name: string; prevValue: number; mesesInativos: number }[] = [];
  for (const [cid, hist] of clienteMesesHist) {
    if (customersMes.has(cid)) continue; // comprou neste mês, não é inativo
    const inativos = mesesInativos(hist.meses);
    if (inativos === 0) continue;
    inactivos.push({ id: cid, name: hist.nome, prevValue: hist.lastValue, mesesInativos: inativos });
  }
  inactivos.sort((a, b) => a.mesesInativos - b.mesesInativos);

  // Calcular meses ativos nos últimos 3 meses (excluindo mês atual) por cliente
  const mesAtualStr = `${ano}-${String(mes).padStart(2, "0")}`;
  const mesesAnteriores3 = [1, 2, 3].map(i => {
    const d = new Date(ano, mes - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const clienteMesesAtivos = new Map<string, Set<string>>();
  const clienteInadimplente = new Map<string, boolean>();
  for (const s of sales4m ?? []) {
    const raw = s.raw_json as { cliente?: { id?: string }; tipo_pendencia?: { nome?: string } } | null;
    const cid = raw?.cliente?.id ?? "unknown";
    const mesSale = (s.sale_date ?? "").slice(0, 7);
    if (mesSale !== mesAtualStr) {
      const set = clienteMesesAtivos.get(cid) ?? new Set();
      set.add(mesSale);
      clienteMesesAtivos.set(cid, set);
    }
    // Inadimplência: tipo_pendencia diferente de NENHUMA
    if (raw?.tipo_pendencia?.nome && raw.tipo_pendencia.nome !== "NENHUMA") {
      clienteInadimplente.set(cid, true);
    }
  }

  // Calcular ranking
  const ranking = Array.from(customersMes.values()).map(c => {
    const prevValue = prevValues.get(c.id) ?? 0;
    const lineCount = c.lines.size === 0 ? 1 : c.lines.size;
    const mesesAtivos = (clienteMesesAtivos.get(c.id) ?? new Set()).size;
    const inadimplente = clienteInadimplente.get(c.id) ?? false;
    const score = calcScore(c.value, c.purchases, lineCount, inadimplente);
    const level = getLevel(score);
    const nextLevel = getNextLevel(score);
    const pointsToNext = nextLevel ? nextLevel.min - score : 0;
    const progressPct = nextLevel
      ? Math.round(((score - level.min) / (nextLevel.min - level.min)) * 100)
      : 100;
    return {
      id: c.id, name: c.name, value: c.value, purchases: c.purchases,
      lines: Array.from(c.lines).sort(),
      lineCount, prevValue, mesesAtivos, inadimplente,
      score, level: level.name, levelColor: level.color,
      nextLevel: nextLevel?.name ?? null, nextLevelColor: nextLevel?.color ?? null,
      pointsToNext, progressPct,
    };
  }).sort((a, b) => b.score - a.score);

  // Contar por nível
  const levelCounts: Record<string, number> = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, Diamante: 0 };
  for (const c of ranking) levelCounts[c.level] = (levelCounts[c.level] ?? 0) + 1;

  // Oportunidades
  const opportunities = ranking
    .filter(c => c.lineCount < 3 || c.pointsToNext <= 15 || c.mesesAtivos < 2 || c.inadimplente)
    .slice(0, 20)
    .map(c => {
      const actions: string[] = [];
      if (c.mesesAtivos === 0) actions.push("Novo cliente — garantir recompra no próximo mês");
      else if (c.mesesAtivos === 1) actions.push("Comprou só 1 dos últimos 3 meses — fortalecer recorrência");
      if (!c.lines.includes(1)) actions.push("Oferecer linha Congelados");
      if (!c.lines.includes(2)) actions.push("Oferecer Peixes ornamentais");
      if (!c.lines.includes(3)) actions.push("Oferecer Microvida / plâncton");
      if (c.inadimplente) actions.push("⚠ Pendência financeira — acionar financeiro");
      if (c.pointsToNext > 0 && c.pointsToNext <= 15) actions.push(`Faltam ${c.pointsToNext} pts para ${c.nextLevel}`);
      return { ...c, actions };
    });

  return NextResponse.json({
    mes: `${ano}-${String(mes).padStart(2, "0")}`,
    ranking,
    levelCounts,
    totalAtivos: ranking.length,
    inactivos: inactivos.slice(0, 20),
  });
}
