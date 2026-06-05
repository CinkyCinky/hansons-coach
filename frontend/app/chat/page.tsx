"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { sendChatMessage } from "@/lib/api";

type Message = {
  id: string;
  role: "user" | "model";
  content: string;
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "model",
      content: "Ahoj Maroš! Som tvoj AI bežecký tréner. Dnes ťa čaká ľahkých 5km v Zóne 2. Ako sa cítiš po včerajšku? Potrebuješ poradiť s tempom alebo kadenciou?",
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    
    // Add user message
    const newMessages = [
      ...messages,
      { id: Date.now().toString(), role: "user" as const, content: userMsg }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const historyForApi = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      
      const res = await sendChatMessage(userMsg, historyForApi);
      
      setMessages(prev => [
        ...prev,
        { 
          id: (Date.now() + 1).toString(), 
          role: "model", 
          content: res.response 
        }
      ]);
      setIsLoading(false);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [
        ...prev,
        { 
          id: (Date.now() + 1).toString(), 
          role: "model", 
          content: "Prepáč, momentálne sa neviem spojiť so serverom. Skús to prosím neskôr." 
        }
      ]);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] pt-4">
      {/* Header */}
      <header className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="text-primary" /> 
          AI Tréner
        </h1>
        <p className="text-gray-400 text-sm">Založené na metóde Hansons</p>
      </header>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto mb-4 flex flex-col gap-4 pr-1 scrollbar-hide">
        {messages.map((msg) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id} 
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === "user" 
                  ? "bg-primary text-white rounded-br-none shadow-[0_0_15px_rgba(59,130,246,0.3)]" 
                  : "glass-card text-gray-200 rounded-bl-none"
              }`}
            >
              {msg.content}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="glass-card rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2 text-gray-400">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm">Píše...</span>
            </div>
          </motion.div>
        )}
        {/* Anchor for auto-scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested chips */}
      <div className="flex gap-2 overflow-x-auto shrink-0 mb-3 pb-1 scrollbar-hide">
        <button onClick={() => setInput("Ako si vediem tento týždeň?")} className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-300 transition-colors">
          Ako si vediem tento týždeň?
        </button>
        <button onClick={() => setInput("Zajtra nestíham tréning")} className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-300 transition-colors">
          Zajtra nestíham tréning
        </button>
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="shrink-0 relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Opýtaj sa trénera..."
          className="w-full bg-[#1a1a24] border border-white/10 rounded-full pl-5 pr-12 py-4 text-white focus:outline-none focus:border-primary/50 transition-colors"
        />
        <button 
          type="submit" 
          disabled={!input.trim() || isLoading}
          className="absolute right-2 top-2 bottom-2 aspect-square bg-primary hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-full flex items-center justify-center transition-colors text-white"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
