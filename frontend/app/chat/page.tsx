"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, Loader2, Zap, Brain } from "lucide-react";
import { motion } from "framer-motion";
import { sendChatMessage, fetchProfile } from "@/lib/api";
import { useStore } from "@/lib/store";

type Model = "flash" | "pro";

type Message = {
  id: string;
  role: "user" | "model";
  content: string;
};

const SUGGESTED_CHIPS = [
  "Ako si vediem tento týždeň?",
  "Zajtra nestíham tréning",
  "Čo znamená moje HRV?",
  "Vysvetli dnešný tréning",
  "Som unavený, mám trénovať?",
  "Navrhni mi zmenu plánu",
];

export default function Chat() {
  const store = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<Model>("flash");
  const [isInitializing, setIsInitializing] = useState(true);
  const [displayName, setDisplayName] = useState<string>("Bežec");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll — rolujeme kontajner správ, nie celú stránku
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxH = 160; // max 160px (~6 riadkov)
    ta.style.height = Math.min(ta.scrollHeight, maxH) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  // Načítaj meno z profilu
  useEffect(() => {
    fetchProfile()
      .then((p) => {
        const name = p.display_name || p.garmin_email?.split("@")[0] || "Bežec";
        setDisplayName(name);
      })
      .catch(() => {});
  }, []);

  // Handoff z generátora plánu: nasaď konverzáciu zhrnutím plánu (ako správa zverenca)
  // + pôvodnou správou trénera. Seed je jednorazový — po spotrebovaní ho vyčistíme.
  useEffect(() => {
    const seed = store.chatSeed;
    if (!seed) return;
    setMessages([
      { id: "seed-user", role: "user", content: seed.userText },
      { id: "seed-coach", role: "model", content: seed.coachMessage },
    ]);
    store.setChatSeed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamický pozdrav pri načítaní chatu
  useEffect(() => {
    const initChat = async () => {
      setIsInitializing(true);
      try {
        await store.loadDashboard();

        const d = store.dashboard;
        let greetContext = "Ahoj! Som tvoj AI bežecký tréner.";
        if (d) {
          const bb = d.stats?.body_battery;
          const todayW = d.today_workout?.title;
          const week = d.training_week;
          if (todayW) {
            greetContext = `Ahoj ${displayName}! Dnes ťa čaká: **${todayW}**.`;
            if (bb) greetContext += ` Tvoja Body Battery je na ${bb}/100.`;
          } else {
            greetContext = `Ahoj ${displayName}! Sme v týždni ${week ?? "?"}/18.`;
            if (bb) greetContext += ` Tvoja Body Battery je ${bb}/100.`;
          }
          greetContext += " Ako ti môžem pomôcť?";
        }

        // Neprepisuj už rozpísanú konverzáciu (efekt sa môže spustiť znova po načítaní profilu)
        setMessages((prev) =>
          prev.length > 1 ? prev : [{ id: "1", role: "model", content: greetContext }]
        );
      } catch {
        setMessages((prev) =>
          prev.length > 1
            ? prev
            : [
                {
                  id: "1",
                  role: "model",
                  content: `Ahoj ${displayName}! Som tvoj AI bežecký tréner podľa Hansons metódy. Ako ti môžem pomôcť?`,
                },
              ]
        );
      } finally {
        setIsInitializing(false);
      }
    };
    initChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const handleSend = async (e: React.FormEvent | null, overrideInput?: string) => {
    e?.preventDefault();
    const userMsg = (overrideInput ?? input).trim();
    if (!userMsg || isLoading) return;

    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: "user", content: userMsg },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const historyForApi = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendChatMessage(userMsg, historyForApi, model);

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "model",
          content: res.response,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "model",
          content: "Prepáč, momentálne sa neviem spojiť so serverom. Skús to prosím neskôr.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Odoslanie na Enter, nový riadok na Shift+Enter
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-130px)] pt-4">
      {/* Header */}
      <header className="mb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="text-primary" />
              AI Tréner
            </h1>
            <p className="text-gray-400 text-sm">Hansons Half-Marathon metóda</p>
          </div>

          {/* Model selector */}
          <div className="flex bg-[#1a1a24] rounded-xl p-1 gap-1">
            <button
              onClick={() => setModel("flash")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                model === "flash"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Rýchly model — vhodný pre denné otázky"
            >
              <Zap size={13} />
              Flash
            </button>
            <button
              onClick={() => setModel("pro")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                model === "pro"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Výkonný model — pre hĺbkovú analýzu a generovanie plánov"
            >
              <Brain size={13} />
              Pro
            </button>
          </div>
        </div>
        {/* Model label */}
        <p className="text-xs text-gray-600 mt-1 text-right">
          {model === "flash"
            ? "⚡ Flash — rýchly, pre každodenné otázky"
            : "🧠 Pro — hlboká analýza a generovanie plánov"}
        </p>
      </header>

      {/* Chat Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto mb-3 flex flex-col gap-4 pr-1 scrollbar-hide"
      >
        {isInitializing ? (
          <div className="flex justify-start">
            <div className="glass-card rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2 text-gray-400">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm">Tréner sa prebúdza...</span>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-wrap text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-white rounded-br-none shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                    : "glass-card text-gray-200 rounded-bl-none"
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))
        )}

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="glass-card rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2 text-gray-400">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm">
                {model === "pro" ? "Dôkladne analyzujem..." : "Píše..."}
              </span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested chips */}
      <div className="flex gap-2 overflow-x-auto shrink-0 mb-3 pb-1 scrollbar-hide">
        {SUGGESTED_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleSend(null, chip)}
            disabled={isLoading}
            className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-300 transition-colors disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input — textarea s auto-resize */}
      <form onSubmit={handleSend} className="shrink-0 relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Opýtaj sa trénera... (Enter = odošli, Shift+Enter = nový riadok)"
          rows={1}
          className="w-full bg-[#1a1a24] border border-white/10 rounded-2xl pl-5 pr-14 py-3.5 text-white focus:outline-none focus:border-primary/50 transition-colors resize-none overflow-y-auto leading-relaxed text-sm"
          style={{ minHeight: "52px", maxHeight: "160px" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="absolute right-2 bottom-2 w-10 h-10 bg-primary hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl flex items-center justify-center transition-colors text-white"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
