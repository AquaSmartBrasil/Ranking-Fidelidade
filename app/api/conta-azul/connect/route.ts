import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/contaAzul/auth";
import crypto from "crypto";

export async function GET() {
  const requiredVars = [
    "CONTA_AZUL_CLIENT_ID",
    "CONTA_AZUL_REDIRECT_URI",
    "CONTA_AZUL_AUTH_URL",
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      return NextResponse.json(
        { error: `Variável de ambiente ausente: ${varName}` },
        { status: 500 }
      );
    }
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = buildAuthorizationUrl(state);

  return NextResponse.redirect(authUrl);
}
