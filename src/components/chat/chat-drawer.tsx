"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import type { ChatMode, ChatContext } from "@/lib/chat/system-prompt";
import { ChatMessage } from "./chat-message";
import { ProposalCard, type Proposal } from "./proposal-card";
import Image from "next/image";

interface Message {
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
}

const EXECUTIVE_SUGGESTIONS = [
  "📊 ¿Cómo está el estado general del POA?",
  "⚠️ ¿Qué hitos están vencidos?",
  "⏳ ¿Qué áreas no tienen primer reporte?",
  "🎭 ¿Cómo está Cultura?",
];

export function ChatDrawer() {
  const [open, setOpen] = useState(false);
  // Chatbot solo de consulta: modo ejecutivo fijo (la parte operativa está oculta).
  const [mode] = useState<ChatMode>("ejecutivo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pathname = usePathname();

  // Build context from current page
  const getContext = useCallback((): ChatContext => {
    return {
      mode,
      pagina: pathname,
    };
  }, [mode, pathname]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context: getContext(),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages([...newMessages, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages([...newMessages, {
          role: "assistant",
          content: data.response,
          proposals: data.proposals,
        }]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "No se pudo conectar con el asistente. Verificá tu conexión." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = EXECUTIVE_SUGGESTIONS;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="no-imprimir fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl bg-primary shadow-lg shadow-primary/20 flex items-center justify-center hover:bg-primary-light transition-colors group"
          title="Abrir asistente"
        >
          <Image
            src="/logos/Direccion IA logo Secregeneral Dashboard.png"
            alt="IA"
            width={28}
            height={28}
            className="brightness-0 invert opacity-90 group-hover:opacity-100"
          />
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="no-imprimir fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] flex flex-col bg-surface border-l border-border shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Image
                  src="/logos/Direccion IA logo Secregeneral Dashboard.png"
                  alt="IA"
                  width={18}
                  height={18}
                  className="logo-auto opacity-80"
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Asistente POA</h3>
                <p className="text-[10px] text-muted">Consulta · Seguimiento</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground transition-colors p-1"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="space-y-4">
                {/* Welcome */}
                <div className="text-center py-4">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Image
                      src="/logos/Direccion IA logo Secregeneral Dashboard.png"
                      alt="IA"
                      width={24}
                      height={24}
                      className="logo-auto opacity-60"
                    />
                  </div>
                  <p className="text-sm text-foreground font-medium">
                    Asistente de consulta
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Consultá estado, alertas y seguimiento del POA
                  </p>
                </div>

                {/* Suggestions */}
                <div className="space-y-2">
                  <p className="text-[10px] text-muted uppercase tracking-wider">Sugerencias</p>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="w-full text-left text-sm text-muted hover:text-foreground bg-background hover:bg-surface-hover border border-border rounded-lg px-3 py-2 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="space-y-3">
                  <ChatMessage role={msg.role} content={msg.content} />
                  {msg.proposals?.map((p) => (
                    <ProposalCard
                      key={p.propuesta_id}
                      proposal={p}
                      disabled={loading}
                    />
                  ))}
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-background border border-border rounded-xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "ejecutivo"
                    ? "Preguntá sobre el estado del POA..."
                    : "Preguntá sobre tus pendientes..."
                }
                disabled={loading}
                className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted/40 focus:outline-none focus:border-primary/50 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="h-9 w-9 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary-light disabled:opacity-30 transition-colors shrink-0"
              >
                ↑
              </button>
            </form>
            <p className="text-[9px] text-muted/40 text-center mt-2">
              Dirección de IA — Municipalidad de San Miguel de Tucumán
            </p>
          </div>
        </div>
      )}
    </>
  );
}
