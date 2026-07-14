import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AquaSmart Dashboard",
  description: "Dashboard de vendas AquaSmart",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AquaSmart",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="theme-color" content="#2563eb" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-6">
            <span className="font-semibold text-blue-700">Conta Azul Dashboard</span>
            <a href="/metas" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
              Metas de Vendas
            </a>
            <a href="/ranking" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
              Ranking
            </a>
            <a href="/resumo" className="text-sm text-gray-600 hover:text-blue-700">
              Resumo
            </a>
            <a href="/comissao" className="text-sm text-gray-600 hover:text-blue-700">
              Comissão
            </a>
            <a href="/admin" className="text-sm text-gray-400 hover:text-blue-700 ml-auto">
              ⚙ Admin
            </a>
            <a href="/integrations" className="text-xs text-gray-400 hover:text-gray-600">
              Integrações
            </a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
