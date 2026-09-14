import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 400 });

  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const today = dateParam ?? brNow.toISOString().slice(0, 10);

  // Logs of today
  const { data: logs } = await supabaseAdmin
    .from("contact_logs")
    .select("*")
    .eq("company_id", company.id)
    .eq("contact_date", today);

  // Goals (meta diária) from vendedor_goals
  const { data: goals } = await supabaseAdmin
    .from("vendedor_goals")
    .select("vendedor_id, vendedor_nome, meta_diaria_contatos")
    .eq("company_id", company.id)
    .eq("excluido", false);

  // Last 30 days for trend
  const d30 = new Date(brNow);
  d30.setDate(d30.getDate() - 30);
  const inicio30 = d30.toISOString().slice(0, 10);

  const { data: logs30 } = await supabaseAdmin
    .from("contact_logs")
    .select("vendedor_id, vendedor_nome, contact_date, result")
    .eq("company_id", company.id)
    .gte("contact_date", inicio30)
    .lte("contact_date", today);

  // Group today by vendedor
  type DayStats = {
    vendedor_id: string;
    vendedor_nome: string;
    meta: number;
    contacted: number;
    no_answer: number;
    postponed: number;
    total: number;
  };

  const byVend = new Map<string, DayStats>();

  // Init with goals
  for (const g of goals ?? []) {
    byVend.set(g.vendedor_id, {
      vendedor_id: g.vendedor_id,
      vendedor_nome: g.vendedor_nome,
      meta: g.meta_diaria_contatos ?? 15,
      contacted: 0,
      no_answer: 0,
      postponed: 0,
      total: 0,
    });
  }

  for (const log of logs ?? []) {
    if (!byVend.has(log.vendedor_id)) {
      byVend.set(log.vendedor_id, {
        vendedor_id: log.vendedor_id,
        vendedor_nome: log.vendedor_nome,
        meta: 15,
        contacted: 0,
        no_answer: 0,
        postponed: 0,
        total: 0,
      });
    }
    const v = byVend.get(log.vendedor_id)!;
    if (log.result === "contacted") v.contacted++;
    else if (log.result === "no_answer") v.no_answer++;
    else if (log.result === "postponed") v.postponed++;
    v.total++;
  }

  // 30-day history per vendedor: contacts per day
  type DayCount = { date: string; contacted: number; no_answer: number; total: number };
  const hist = new Map<string, DayCount[]>();
  for (const log of logs30 ?? []) {
    if (!hist.has(log.vendedor_id)) hist.set(log.vendedor_id, []);
    const arr = hist.get(log.vendedor_id)!;
    let day = arr.find(d => d.date === log.contact_date);
    if (!day) {
      day = { date: log.contact_date, contacted: 0, no_answer: 0, total: 0 };
      arr.push(day);
    }
    if (log.result === "contacted") day.contacted++;
    if (log.result === "no_answer") day.no_answer++;
    day.total++;
  }

  const vendedores = Array.from(byVend.values()).map(v => ({
    ...v,
    pct: v.meta > 0 ? Math.round((v.total / v.meta) * 100) : 0,
    historico: (hist.get(v.vendedor_id) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
  }));

  // Company totals for today
  const totalContacted = vendedores.reduce((s, v) => s + v.contacted, 0);
  const totalNoAnswer = vendedores.reduce((s, v) => s + v.no_answer, 0);
  const totalPostponed = vendedores.reduce((s, v) => s + v.postponed, 0);
  const totalMeta = vendedores.reduce((s, v) => s + v.meta, 0);

  return NextResponse.json({
    date: today,
    empresa: { contacted: totalContacted, no_answer: totalNoAnswer, postponed: totalPostponed, meta: totalMeta },
    vendedores,
  });
}
