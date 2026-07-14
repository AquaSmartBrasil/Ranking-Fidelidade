import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_auth", process.env.ADMIN_PASSWORD!, {
    httpOnly: true,
    sameSite: "strict",
    path: "/admin",
    maxAge: 60 * 60 * 8, // 8 horas
  });
  return res;
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("admin_auth");
  const ok = cookie?.value === process.env.ADMIN_PASSWORD;
  return NextResponse.json({ ok });
}
