"use client";
import { useEffect, useState, useRef } from "react";

type ItemPedido = { nome: string; qty: number; preco: number };
type Pedido = { id: string; data: string; total: number; itens: ItemPedido[] };
type Sugestao = { nome: string; qtdSugerida: number; frequencia: number; preco: number };
type ClienteDetalhe = { pedidos: Pedido[]; sugestao: Sugestao[]; nomeCliente: string; totalPedidos: number };

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtQty(v: number) { return v % 1 === 0 ? String(v) : v.toFixed(1); }
function getDataLabel(d: string) {
  if (!d) return "?";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

export function ClienteModal({
  clienteId,
  vendedorId,
  nomeInicial,
  onClose,
}: {
  clienteId: string;
  vendedorId: string;
  nomeInicial?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ClienteDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/cliente/${clienteId}?vendedor=${vendedorId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [clienteId, vendedorId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Fechar com Esc
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function buildWhatsApp(): string {
    if (!data?.sugestao.length) return "";
    const nome = data.nomeCliente;
    const itens = data.sugestao.map(s => `• ${fmtQty(s.qtdSugerida)}x ${s.nome}`).join("\n");
    return `Olá! 😊 Pensando em você, já preparei um pré-pedido com o que você costuma comprar:\n\n${itens}\n\nPosso confirmar esse pedido pra ${nome}?`;
  }

  function copiar() {
    const txt = buildWhatsApp();
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={ref}
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <p className="text-xs text-gray-400">Histórico do cliente</p>
            <p className="text-lg font-bold text-white">
              {loading && !data ? (nomeInicial ?? "Carregando...") : (data?.nomeCliente ?? nomeInicial ?? "?")}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        {loading && (
          <div className="p-8 text-center text-gray-400 text-sm">Carregando histórico...</div>
        )}

        {!loading && data && (
          <div className="p-5 space-y-6">

            {/* PRÉ-PEDIDO SUGERIDO */}
            {data.sugestao.length > 0 ? (
              <div className="bg-green-50 border-2 border-green-300 rounded-xl overflow-hidden">
                <div className="bg-green-500 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-white font-bold text-sm">✨ Pré-pedido sugerido</span>
                  <span className="text-green-100 text-xs">últimos {data.totalPedidos} pedidos</span>
                </div>
                <div className="p-4 space-y-2">
                  {data.sugestao.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-bold text-green-700 w-12 shrink-0">{fmtQty(s.qtdSugerida)}x</span>
                        <span className="text-sm text-gray-800 truncate">{s.nome}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">{s.frequencia}%</span>
                        {s.preco > 0 && <span className="text-xs text-gray-500">{fmt(s.preco * s.qtdSugerida)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-4">
                  <button
                    onClick={copiar}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      copied ? "bg-green-600 text-white" : "bg-gray-900 text-white hover:bg-gray-700"
                    }`}
                  >
                    {copied ? "✓ Copiado! Cole no WhatsApp" : "📋 Copiar mensagem para WhatsApp"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
                Sem histórico suficiente para gerar sugestão de pedido
              </div>
            )}

            {/* HISTÓRICO DE PEDIDOS */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Últimos pedidos (6 meses)</p>
              {data.pedidos.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum pedido encontrado</p>
              ) : (
                <div className="space-y-3">
                  {data.pedidos.map(p => (
                    <div key={p.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-600">{getDataLabel(p.data)}</span>
                        <span className="text-sm font-bold text-gray-800">{fmt(p.total)}</span>
                      </div>
                      {p.itens.length > 0 && (
                        <div className="px-3 py-2 space-y-1">
                          {p.itens.map((it, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="font-semibold text-gray-500 w-10 shrink-0">{fmtQty(it.qty)}x</span>
                              <span className="truncate flex-1">{it.nome}</span>
                              {it.preco > 0 && <span className="text-gray-400 shrink-0">{fmt(it.preco)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
