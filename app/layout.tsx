import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conta Azul Dashboard",
  description: "Dashboard privado integrado com a API da Conta Azul",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-6">
            <span className="font-semibold text-blue-700">Conta Azul Dashboard</span>
            <a href="/integrations" className="text-sm text-gray-600 hover:text-blue-700">
              Integrações
            </a>
            <a href="/dashboard" className="text-sm text-gray-600 hover:text-blue-700">
              Dashboard
            </a>
            <a href="/ranking" className="text-sm text-gray-600 hover:text-blue-700">
              Ranking de Clientes
            </a>
            <a href="/metas" className="text-sm text-gray-600 hover:text-blue-700">
              Metas de Vendas
            </a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
