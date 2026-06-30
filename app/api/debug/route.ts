import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  // Criar tabela customer_goals se não existir
  const { error } = await supabaseAdmin.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS customer_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        customer_conta_azul_id TEXT NOT NULL,
        customer_name TEXT,
        monthly_goal NUMERIC(12,2),
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(company_id, customer_conta_azul_id)
      );
    `
  });
  return NextResponse.json({ error: error?.message ?? null });
}
