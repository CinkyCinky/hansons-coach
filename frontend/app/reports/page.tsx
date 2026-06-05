"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Moon, Battery, Heart } from "lucide-react";
import { motion } from "framer-motion";

export default function Reports() {
  const [tab, setTab] = useState<"daily" | "weekly">("weekly");

  // Dummy data for charts
  const weeklyData = [
    { day: 'Po', sleep: 7.5, bb: 60, hrv: 45 },
    { day: 'Ut', sleep: 8.0, bb: 75, hrv: 48 },
    { day: 'St', sleep: 6.5, bb: 40, hrv: 42 },
    { day: 'Št', sleep: 7.8, bb: 65, hrv: 51 },
    { day: 'Pi', sleep: 8.1, bb: 55, hrv: 50 },
    { day: 'So', sleep: null, bb: null, hrv: null },
    { day: 'Ne', sleep: null, bb: null, hrv: null },
  ];

  return (
    <div className="flex flex-col gap-6 pt-4 pb-10">
      <header>
        <h1 className="text-3xl font-bold mb-1">Reporty</h1>
        <p className="text-gray-400 text-sm">Analýza tvojich metrík</p>
      </header>

      {/* Tabs */}
      <div className="bg-[#1a1a24] p-1 rounded-full flex relative">
        <button 
          onClick={() => setTab("daily")}
          className={`flex-1 py-2 text-sm font-bold rounded-full z-10 transition-colors ${tab === "daily" ? "text-white" : "text-gray-500"}`}
        >
          Denný
        </button>
        <button 
          onClick={() => setTab("weekly")}
          className={`flex-1 py-2 text-sm font-bold rounded-full z-10 transition-colors ${tab === "weekly" ? "text-white" : "text-gray-500"}`}
        >
          Týždenný
        </button>
        
        {/* Animated background pill */}
        <motion.div 
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-primary rounded-full z-0 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
          initial={false}
          animate={{ x: tab === "daily" ? 4 : "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>

      {tab === "weekly" && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6"
        >
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1">Celkovo km</p>
              <h3 className="text-2xl font-bold text-white">10.6 km</h3>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-1">Priemerný spánok</p>
              <h3 className="text-2xl font-bold text-white">7.6 h</h3>
            </div>
          </div>

          {/* Chart: Sleep & Body Battery */}
          <div className="glass-card p-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Battery className="text-emerald-400" size={18} /> Energia vs Spánok
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="day" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 10]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="bb" name="Body Battery" stroke="#34d399" strokeWidth={3} dot={{ r: 4, fill: '#34d399' }} activeDot={{ r: 6 }} />
                  <Line yAxisId="right" type="monotone" dataKey="sleep" name="Spánok (h)" stroke="#818cf8" strokeWidth={3} dot={{ r: 4, fill: '#818cf8' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart: HRV */}
          <div className="glass-card p-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Heart className="text-rose-400" size={18} /> Variabilita tepu (HRV)
            </h3>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="day" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} domain={[30, 70]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    itemStyle={{ color: '#fb7185', fontSize: '12px', fontWeight: 'bold' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Line type="monotone" dataKey="hrv" name="HRV (ms)" stroke="#fb7185" strokeWidth={3} dot={{ r: 4, fill: '#fb7185' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      )}

      {tab === "daily" && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <Activity size={48} className="text-primary/50 mb-4" />
          <h3 className="text-xl font-bold mb-2">Denný detailný report</h3>
          <p className="text-gray-400 text-sm max-w-[80%] mx-auto">
            Táto obrazovka bude dostupná, keď sa tvoj denný report vygeneruje trénerom. Zatiaľ použi prehľad na úvodnej obrazovke.
          </p>
        </motion.div>
      )}
    </div>
  );
}
