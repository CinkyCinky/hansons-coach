"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, Zap, Brain } from "lucide-react";
import { motion } from "framer-motion";
import { sendChatMessage, streamChatMessage, fetchProfile } from "@/lib/api";
import { useStore } from "@/lib/store";

type Model = "flash" | "pro";

type Message = {
  id: string;
  role: "user" | "model";
  content: string;
  ts: number;
};

const SUGGESTED_CHIPS = [
  "Ako si vediem tento týždeň?",
  "Zajtra nestíham tréning",
  "Čo znamená moje HRV?",
  "Vysvetli dnešný tréning",
  "Som unavený, mám trénovať?",
  "Navrhni mi zmenu plánu",
];

// ── Formátovanie textu trénera (ľahký markdown: **tučné**, `kód`, zoznamy) ──────
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*.+?\*\*|`[^`]+`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(
        <strong key={i} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <code key={i} className="bg-black/30 rounded px-1 py-0.5 text-[0.85em] font-mono">
          {tok.slice(1, -1)}
        </code>
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listType && listItems.length) {
      const items = listItems.map((it, i) => <li key={i}>{renderInline(it)}</li>);
      blocks.push(
        listType === "ul" ? (
          <ul key={`l${key++}`} className="list-disc pl-5 space-y-0.5 my-1">
            {items}
          </ul>
        ) : (
          <ol key={`l${key++}`} className="list-decimal pl-5 space-y-0.5 my-1">
            {items}
          </ol>
        )
      );
    }
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
    } else if (numbered) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(numbered[1]);
    } else {
      flushList();
      if (line.trim() === "") {
        blocks.push(<div key={`b${key++}`} className="h-1.5" />);
      } else {
        blocks.push(
          <p key={`p${key++}`} className="leading-relaxed break-words">
            {renderInline(line)}
          </p>
        );
      }
    }
  }
  flushList();
  return <div className="space-y-0.5">{blocks}</div>;
}

const TypingDot = ({ delay = 0 }: { delay?: number }) => (
  <motion.span
    className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block"
    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
    transition={{ duration: 0.9, repeat: Infinity, delay, ease: "easeInOut" }}
  />
);

function CoachAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
      <Bot size={15} className="text-primary" />
    </div>
  );
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function Chat() {
  const store = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<Model>("flash");
  const [isInitializing, setIsInitializing] = useState(true);
  const [displayName, setDisplayName] = useState<string>("Bežec");
  const [isTouch, setIsTouch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dotykové zariadenie? (mobil) → Enter robí nový riadok, ako vo WhatsApp/Messengeri
  useEffect(() => {
    const touch =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches ||
        "ontouchstart" in window ||
        (navigator.maxTouchPoints ?? 0) > 0);
    setIsTouch(!!touch);
  }, []);

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
    const now = Date.now();
    setMessages([
      { id: "seed-user", role: "user", content: seed.userText, ts: now },
      { id: "seed-coach", role: "model", content: seed.coachMessage, ts: now },
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
          // Živá hodnota (aktuálny stav) — pozdrav je „teraz", nie ranný report.
          const bb = d.stats?.body_battery_now ?? d.stats?.body_battery;
          const todayW = d.today_workout?.title;
          const week = d.training_week;
          // Je dnešný tréning už odbehnutý? (porovnaj dnešný dátum s aktivitami z Garminu)
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          const doneToday = (d.activities ?? []).some(
            (a: any) => (a.startTimeLocal || a.startTimeGMT || "").slice(0, 10) === todayStr
          );
          if (todayW) {
            greetContext = doneToday
              ? `Ahoj ${displayName}! Dnešný tréning (**${todayW}**) už máš za sebou — pekná práca! 💪`
              : `Ahoj ${displayName}! Dnes ťa čaká: **${todayW}**.`;
            if (bb) greetContext += ` Tvoja Body Battery je na ${bb}/100.`;
          } else {
            greetContext = `Ahoj ${displayName}! Sme v týždni ${week ?? "?"}/18.`;
            if (bb) greetContext += ` Tvoja Body Battery je ${bb}/100.`;
          }
          greetContext += " Ako ti môžem pomôcť?";
        }

        // Neprepisuj už rozpísanú konverzáciu (efekt sa môže spustiť znova po načítaní profilu)
        setMessages((prev) =>
          prev.length > 1 ? prev : [{ id: "1", role: "model", content: greetContext, ts: Date.now() }]
        );
      } catch {
        setMessages((prev) =>
          prev.length > 1
            ? prev
            : [
                {
                  id: "1",
                  role: "model",
                  content: `Ahoj ${displayName}! Som tvoj AI bežecký tréner podľa Hansonovej metódy. Ako ti môžem pomôcť?`,
                  ts: Date.now(),
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
      { id: Date.now().toString(), role: "user", content: userMsg, ts: Date.now() },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    const historyForApi = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const modelId = (Date.now() + 1).toString();
    let acc = "";
    let started = false;

    // Prvá delta vytvorí bublinu odpovede a schová indikátor písania; ďalšie ju dopĺňajú.
    const onDelta = (t: string) => {
      acc += t;
      if (!started) {
        started = true;
        setIsLoading(false);
        setMessages((prev) => [...prev, { id: modelId, role: "model", content: acc, ts: Date.now() }]);
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, content: acc } : m))
        );
      }
    };

    const applyFinal = (text: string) => {
      if (!started) {
        started = true;
        setMessages((prev) => [...prev, { id: modelId, role: "model", content: text, ts: Date.now() }]);
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, content: text } : m))
        );
      }
    };

    try {
      const result = await streamChatMessage(userMsg, historyForApi, model, onDelta);
      // Stream nedal text (napr. len tool-call) → dobehni nestreamovaným volaním.
      if (result.fallback || !started) {
        const res = await sendChatMessage(userMsg, historyForApi, model);
        applyFinal(res.response);
      }
    } catch {
      // Stream úplne zlyhal → skús nestreamovaný endpoint, až potom chybová hláška.
      try {
        const res = await sendChatMessage(userMsg, historyForApi, model);
        applyFinal(res.response);
      } catch {
        applyFinal("Prepáč, momentálne sa neviem spojiť so serverom. Skús to prosím neskôr.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mobil (dotyk): Enter = nový riadok (odosielaš tlačidlom), ako vo WhatsApp/Messengeri.
    // Desktop: Enter = odoslať, Shift+Enter = nový riadok.
    if (isTouch) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(null);
    }
  };

  const showChips = messages.length <= 1 && !isLoading;

  return (
    <div className="flex flex-col h-[calc(100dvh-130px)] pt-4">
      {/* Header */}
      <header className="mb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <CoachAvatar />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0a0a0f]" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">AI Tréner</h1>
              <p className="text-green-400 text-xs">online · Hansonova metóda</p>
            </div>
          </div>

          {/* Model selector */}
          <div className="flex bg-[#1a1a24] rounded-xl p-1 gap-1">
            <button
              onClick={() => setModel("flash")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
      </header>

      {/* Chat Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto mb-2 flex flex-col pr-1 scrollbar-hide"
      >
        {isInitializing ? (
          <div className="flex items-end gap-2 justify-start mt-3">
            <CoachAvatar />
            <div className="glass-card rounded-2xl rounded-bl-md px-4 py-3.5 flex items-center gap-1.5">
              <TypingDot />
              <TypingDot delay={0.15} />
              <TypingDot delay={0.3} />
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const firstOfGroup = !prev || prev.role !== msg.role;
            const lastOfGroup = !next || next.role !== msg.role;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"} ${
                  firstOfGroup ? "mt-3" : "mt-0.5"
                }`}
              >
                {/* Avatar trénera len na poslednej bubline skupiny (zľava) */}
                {!isUser && (
                  <div className="w-7 shrink-0 self-end">{lastOfGroup && <CoachAvatar />}</div>
                )}

                <div className={`flex flex-col max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
                  <div
                    className={`px-3.5 py-2.5 text-[0.9rem] break-words ${
                      isUser
                        ? `bg-primary text-white shadow-[0_1px_10px_rgba(59,130,246,0.25)] ${
                            lastOfGroup ? "rounded-2xl rounded-br-md" : "rounded-2xl"
                          }`
                        : `glass-card text-gray-100 ${
                            lastOfGroup ? "rounded-2xl rounded-bl-md" : "rounded-2xl"
                          }`
                    }`}
                  >
                    {isUser ? (
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                    ) : (
                      <FormattedText text={msg.content} />
                    )}
                  </div>
                  {lastOfGroup && (
                    <span className="text-[10px] text-gray-500 mt-1 px-1">{formatTime(msg.ts)}</span>
                  )}
                </div>
              </motion.div>
            );
          })
        )}

        {/* Indikátor písania (kým nepríde prvý token) */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-end gap-2 justify-start mt-3"
          >
            <CoachAvatar />
            <div className="glass-card rounded-2xl rounded-bl-md px-4 py-3.5 flex items-center gap-1.5">
              <TypingDot />
              <TypingDot delay={0.15} />
              <TypingDot delay={0.3} />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested chips — len na začiatku konverzácie */}
      {showChips && (
        <div className="flex gap-2 overflow-x-auto shrink-0 mb-2 pb-1 scrollbar-hide">
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
      )}

      {/* Input — textarea s auto-resize */}
      <form onSubmit={handleSend} className="shrink-0 relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Napíš správu…"
          rows={1}
          className="w-full bg-[#1a1a24] border border-white/10 rounded-3xl pl-5 pr-14 py-3.5 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors resize-none overflow-y-auto leading-relaxed text-sm"
          style={{ minHeight: "52px", maxHeight: "160px" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          aria-label="Odoslať"
          className="absolute right-2 bottom-2 w-10 h-10 bg-primary hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-full flex items-center justify-center transition-colors text-white active:scale-95"
        >
          <Send size={16} />
        </button>
      </form>
      {!isTouch && (
        <p className="text-[10px] text-gray-600 mt-1.5 text-center shrink-0">
          Enter = odoslať · Shift+Enter = nový riadok
        </p>
      )}
    </div>
  );
}
