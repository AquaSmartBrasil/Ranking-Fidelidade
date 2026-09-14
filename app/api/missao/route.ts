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

function diasUteisMes(brNow: Date): number {
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= ultimoDia; d++) {
    const dow = new Date(Date.UTC(ano, mes, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count || 1;
}

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

const EXCLUDE = '("CANCELADO","ORCAMENTO","ESPERANDO_APROVACAO")';
const LINE_NAMES: Record<number, string> = { 1: "Congelados", 2: "Peixes", 3: "Microvida" };
const LINE_EMOJI: Record<number, string> = { 1: "🧊", 2: "🐟", 3: "🦠" };

export async function GET() {
  const { data: company } = await supabaseAdmin.from("companies").select("id").limit(1).single();
  if (!company) return NextResponse.json({ error: "Não conectado" }, { status: 400 });
  const companyId = company.id;

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ano = brNow.getUTCFullYear();
  const mes = brNow.getUTCMonth() + 1;
  const hojeStr = `${ano}-${String(mes).padStart(2, "0")}-${String(brNow.getUTCDate()).padStart(2, "0")}`;
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  // Últimos 3 meses completos para histórico
  const hist3: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    hist3.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const inicioHist = `${hist3[2]}-01`;
  const fimHist = `${hist3[0]}-${new Date(Number(hist3[0].split("-")[0]), Number(hist3[0].split("-")[1]), 0).getDate()}`;

  // Carteira ativa = últimos 3 meses completos
  const d3 = new Date(Date.UTC(ano, mes - 4, 1));
  const inicioCarteira = `${d3.getUTCFullYear()}-${String(d3.getUTCMonth() + 1).padStart(2, "0")}-01`;
  // Urgência = meses 4-6 atrás
  const d6 = new Date(Date.UTC(ano, mes - 7, 1));
  const inicioUrgencia = `${d6.getUTCFullYear()}-${String(d6.getUTCMonth() + 1).padStart(2, "0")}-01`;
  // Mês anterior (para checar se comprou nos últimos 2 meses)
  const mesAnterior = new Date(Date.UTC(ano, mes - 2, 1));
  const mesAnteriorStr = `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, "0")}`;

  const diasRestantes = diasUteisRestantes(brNow);
  const diasTotais = diasUteisMes(brNow);
  const mesAtualStr = `${ano}-${String(mes).padStart(2, "0")}`;

  // Metas dos vendedores ativos
  const { data: goals } = await supabaseAdmin
    .from("vendedor_goals")
    .select("vendedor_id, vendedor_nome, meta_mensal, meta_clientes")
    .eq("company_id", companyId)
    .eq("excluido", false);

  if (!goals?.length) return NextResponse.json({ vendedores: [], diasRestantes, diasTotais, hoje: hojeStr });

  // Produtos para classificação
  const { data: allProducts } = await supabaseAdmin
    .from("products").select("conta_azul_id, raw_json").eq("company_id", companyId).limit(2000);
  const productCatMap = new Map<string, string>();
  for (const p of allProducts ?? []) {
    const cat = (p.raw_json as { categoria?: { descricao?: string } } | null)?.categoria?.descricao;
    if (cat && cat !== "__none__") productCatMap.set(p.conta_azul_id, cat);
  }

  // Vendas do mês atual
  const { data: salesMes } = await supabaseAdmin.from("sales")
    .select("id, sale_date, total_amount, raw_json")
    .eq("company_id", companyId).gte("sale_date", inicioMes).lte("sale_date", fimMes)
    .not("status", "in", EXCLUDE).limit(5000);

  // Vendas de hoje
  const { data: salesToday } = await supabaseAdmin.from("sales")
    .select("id, total_amount, raw_json")
    .eq("company_id", companyId).eq("sale_date", hojeStr)
    .not("status", "in", EXCLUDE).limit(1000);

  // Histórico 3 meses para meta de unidades
  const { data: salesHist } = await supabaseAdmin.from("sales")
    .select("id, raw_json")
    .eq("company_id", companyId).gte("sale_date", inicioHist).lte("sale_date", fimHist)
    .not("status", "in", EXCLUDE).limit(5000);

  // Vendas dos últimos 3 meses completos para carteira (mês -3, -2, -1 antes do atual)
  const { data: salesCarteira } = await supabaseAdmin.from("sales")
    .select("raw_json")
    .eq("company_id", companyId).gte("sale_date", inicioCarteira).lt("sale_date", inicioMes)
    .not("status", "in", EXCLUDE).limit(5000);

  // Vendas dos meses 4-6 atrás (urgência)
  const { data: salesUrgencia } = await supabaseAdmin.from("sales")
    .select("raw_json")
    .eq("company_id", companyId).gte("sale_date", inicioUrgencia).lt("sale_date", inicioCarteira)
    .not("status", "in", EXCLUDE).limit(5000);

  // Itens de hoje e do histórico
  const todayIds = (salesToday ?? []).map(s => s.id);
  const histIds = (salesHist ?? []).map(s => s.id);
  const allItemIds = [...todayIds, ...histIds];

  type SaleItem = { sale_id: string; description: string | null; quantity: number | null; raw_json: unknown };
  let allItems: SaleItem[] = [];
  if (allItemIds.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < allItemIds.length; i += CHUNK) {
      const chunk = allItemIds.slice(i, i + CHUNK);
      const { data } = await supabaseAdmin.from("sale_items")
        .select("sale_id, description, quantity, raw_json")
        .in("sale_id", chunk).neq("description", "__empty__");
      allItems.push(...(data ?? []));
    }
  }

  const itemsBySale = new Map<string, { line: number; qty: number }[]>();
  for (const item of allItems) {
    const raw = item.raw_json as { id_item?: string } | null;
    const cat = productCatMap.get(raw?.id_item ?? "");
    const line = cat ? classifyByCategory(cat) : classifyByName(item.description ?? "");
    if (!line) continue;
    const qty = item.quantity ?? 1;
    const cur = itemsBySale.get(item.sale_id) ?? [];
    cur.push({ line, qty });
    itemsBySale.set(item.sale_id, cur);
  }

  const vendedores = goals.map((g) => {
    const metaMensal = g.meta_mensal ?? 0;
    const metaDia = metaMensal > 0 ? Math.ceil(metaMensal / diasTotais) : 0;
    const metaDiaRestante = metaMensal > 0 ? Math.ceil(metaMensal / diasRestantes) : 0;

    // Faturado hoje e no mês
    const faturadoHoje = (salesToday ?? [])
      .filter(s => (s.raw_json as { vendedor?: { id?: string } } | null)?.vendedor?.id === g.vendedor_id)
      .reduce((acc, s) => acc + (s.total_amount ?? 0), 0);
    const faturadoMes = (salesMes ?? [])
      .filter(s => (s.raw_json as { vendedor?: { id?: string } } | null)?.vendedor?.id === g.vendedor_id)
      .reduce((acc, s) => acc + (s.total_amount ?? 0), 0);

    // Clientes que compraram este mês
    const clientesMes = new Set<string>();
    for (const s of salesMes ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string } } | null;
      if (raw?.vendedor?.id === g.vendedor_id && raw?.cliente?.id) clientesMes.add(raw.cliente.id);
    }

    // Carteira = clientes que compraram nos últimos 3 meses completos com este vendedor
    type ClienteInfo = { id: string; nome: string; ultimoMes: string };
    const carteira = new Map<string, ClienteInfo>();
    for (const s of salesCarteira ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string; nome?: string }; data?: string } | null;
      if (raw?.vendedor?.id !== g.vendedor_id) continue;
      const cid = raw?.cliente?.id; if (!cid) continue;
      const mesS = raw?.data?.slice(0, 7) ?? "";
      const cur = carteira.get(cid);
      if (!cur || mesS > cur.ultimoMes) carteira.set(cid, { id: cid, nome: raw?.cliente?.nome ?? "?", ultimoMes: mesS });
    }
    // Clientes que compraram este mês também entram na carteira
    for (const s of salesMes ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string; nome?: string } } | null;
      if (raw?.vendedor?.id !== g.vendedor_id) continue;
      const cid = raw?.cliente?.id; if (!cid) continue;
      if (!carteira.has(cid)) carteira.set(cid, { id: cid, nome: raw?.cliente?.nome ?? "?", ultimoMes: mesAtualStr });
    }

    // Clientes que compraram no mês anterior (= compraram nos últimos 2 meses → não são inativos)
    const clientesMesAnterior = new Set<string>();
    for (const s of salesCarteira ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string }; data?: string } | null;
      if (raw?.vendedor?.id !== g.vendedor_id) continue;
      const mesS = raw?.data?.slice(0, 7) ?? "";
      if (mesS >= mesAnteriorStr && raw?.cliente?.id) clientesMesAnterior.add(raw.cliente.id);
    }

    // Inativo = está na carteira, NÃO comprou este mês E NÃO comprou no mês anterior
    const inativos = Array.from(carteira.values())
      .filter(c => !clientesMes.has(c.id) && !clientesMesAnterior.has(c.id))
      .map(c => {
        const [y, m] = c.ultimoMes.split("-").map(Number);
        const [ya, ma] = mesAtualStr.split("-").map(Number);
        const mesesSem = (ya - y) * 12 + (ma - m);
        return { ...c, mesesSemCompra: mesesSem };
      })
      .sort((a, b) => b.mesesSemCompra - a.mesesSemCompra);

    // Prioritários dentro da carteira (2-3 meses)
    const criticos = inativos.filter(c => c.mesesSemCompra >= 3); // 🔴 muito crítico (3m)
    const atencao  = inativos.filter(c => c.mesesSemCompra === 2); // 🟠 crítico (2m)
    const alerta: ClienteInfo[] = [];

    // IDs de quem comprou nos últimos 3 meses (carteira ativa) — para excluir da urgência
    const idsCarteira = new Set(carteira.keys());

    // Clientes de URGÊNCIA: compraram 4-6 meses atrás, NÃO compraram nos últimos 3 meses
    const urgenciaMap = new Map<string, ClienteInfo & { mesesSemCompra: number }>();
    for (const s of salesUrgencia ?? []) {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string; nome?: string }; data?: string } | null;
      if (raw?.vendedor?.id !== g.vendedor_id) continue;
      const cid = raw?.cliente?.id; if (!cid) continue;
      if (idsCarteira.has(cid)) continue; // já comprou nos últimos 3 meses, não é urgência
      const mesS = raw?.data?.slice(0, 7) ?? "";
      const cur = urgenciaMap.get(cid);
      if (!cur || mesS > cur.ultimoMes) {
        const [y, m2] = mesS.split("-").map(Number);
        const [ya, ma] = mesAtualStr.split("-").map(Number);
        const mesesSem = (ya - y) * 12 + (ma - m2);
        urgenciaMap.set(cid, { id: cid, nome: raw?.cliente?.nome ?? "?", ultimoMes: mesS, mesesSemCompra: mesesSem });
      }
    }
    const urgencia = Array.from(urgenciaMap.values()).sort((a, b) => b.mesesSemCompra - a.mesesSemCompra);

    const totalCarteira = carteira.size;
    const totalInativos = inativos.length;
    // Missão = reativar TODOS os prioritários (críticos + atenção), não dividir pelo dia
    const prioritarios = criticos.length + atencao.length + alerta.length;
    const reativacoesHoje = prioritarios;

    // Clientes reativados hoje (estavam inativos prioritários, compraram hoje)
    const prioritariosIds = new Set([...criticos, ...atencao, ...alerta].map(c => c.id));
    const reativadosHoje = (salesToday ?? []).filter(s => {
      const raw = s.raw_json as { vendedor?: { id?: string }; cliente?: { id?: string } } | null;
      return raw?.vendedor?.id === g.vendedor_id && raw?.cliente?.id && prioritariosIds.has(raw.cliente.id);
    }).length;

    // ---- META DE UNIDADES POR LINHA ----
    // Histórico 3 meses: unidades por linha deste vendedor
    const histVendedor = (salesHist ?? []).filter(s =>
      (s.raw_json as { vendedor?: { id?: string } } | null)?.vendedor?.id === g.vendedor_id
    );

    // Agrupar por mês → unidades por linha
    const unidadesPorMes: Record<string, Record<number, number>> = {};
    for (const s of histVendedor) {
      const mesS = (s.raw_json as { data?: string } | null)?.data?.slice(0, 7) ?? "";
      if (!unidadesPorMes[mesS]) unidadesPorMes[mesS] = { 1: 0, 2: 0, 3: 0 };
      for (const item of itemsBySale.get(s.id) ?? []) {
        unidadesPorMes[mesS][item.line] = (unidadesPorMes[mesS][item.line] ?? 0) + item.qty;
      }
    }

    // Média mensal de unidades por linha
    const mesesHist = Object.keys(unidadesPorMes);
    const n = mesesHist.length || 1;
    const mediaUn: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (const m of mesesHist) {
      for (const l of [1, 2, 3]) mediaUn[l] += (unidadesPorMes[m][l] ?? 0);
    }
    const totalUnMes = Object.values(mediaUn).reduce((s, v) => s + v, 0) / n;

    // Meta de unidades do dia por linha (proporcional, arredondado pra cima)
    const metaUnDia: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    if (totalUnMes > 0) {
      for (const l of [1, 2, 3]) {
        const proporcao = (mediaUn[l] / n) / totalUnMes;
        // Estima unidades totais no dia baseado no faturamento meta / ticket médio
        const ticketMedioUn = totalUnMes > 0 && metaMensal > 0 ? metaMensal / totalUnMes : 0;
        const unDia = ticketMedioUn > 0 ? (metaDia / ticketMedioUn) * proporcao : (mediaUn[l] / n) / diasTotais;
        metaUnDia[l] = Math.ceil(unDia) || 0;
      }
    }

    // Unidades vendidas hoje por linha
    const vendidosHojeUn: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const todaySalesVend = (salesToday ?? []).filter(s =>
      (s.raw_json as { vendedor?: { id?: string } } | null)?.vendedor?.id === g.vendedor_id
    );
    for (const s of todaySalesVend) {
      for (const item of itemsBySale.get(s.id) ?? []) {
        vendidosHojeUn[item.line] = (vendidosHojeUn[item.line] ?? 0) + item.qty;
      }
    }

    const linhas = [1, 2, 3].map(l => ({
      linha: l,
      nome: LINE_NAMES[l],
      emoji: LINE_EMOJI[l],
      meta: metaUnDia[l],
      vendido: vendidosHojeUn[l] ?? 0,
      pct: metaUnDia[l] > 0 ? Math.round(((vendidosHojeUn[l] ?? 0) / metaUnDia[l]) * 100) : null,
    })).filter(l => l.meta > 0 || l.vendido > 0);

    return {
      id: g.vendedor_id,
      nome: g.vendedor_nome,
      metaMensal,
      metaDia,
      metaDiaRestante,
      faturadoHoje: Math.round(faturadoHoje),
      faturadoMes: Math.round(faturadoMes),
      pctDia: metaDia > 0 ? Math.round((faturadoHoje / metaDia) * 100) : null,
      pctMes: metaMensal > 0 ? Math.round((faturadoMes / metaMensal) * 100) : null,
      totalCarteira,
      totalInativos,
      totalUrgencia: urgencia.length,
      reativacoesHoje,
      reativadosHoje,
      criticos,
      atencao,
      alerta,
      urgencia,
      linhas,
    };
  }).sort((a, b) => b.faturadoHoje - a.faturadoHoje);

  return NextResponse.json({ vendedores, diasRestantes, diasTotais, hoje: hojeStr });
}
