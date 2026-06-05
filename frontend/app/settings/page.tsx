"use client";

import { useState } from "react";
import { Settings as SettingsIcon, LogOut, Save, Target, Cloud, Bell } from "lucide-react";
import { motion } from "framer-motion";

export default function Settings() {
  const [targetTime, setTargetTime] = useState("1:50:00");
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="flex flex-col gap-6 pt-4 pb-10">
      <header>
        <h1 className="text-3xl font-bold mb-1">Nastavenia</h1>
        <p className="text-gray-400 text-sm">Spravuj svoj profil a ciele</p>
      </header>

      {/* Profile / Account */}
      <section>
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">
          Garmin Účet
        </h3>
        <div className="glass-card rounded-2xl overflow-hidden divide-y divide-white/5">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Cloud className="text-blue-400" size={20} />
              </div>
              <div>
                <p className="font-bold">Pripojené</p>
                <p className="text-xs text-gray-400">Synchronizácia funguje</p>
              </div>
            </div>
            <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded-md">
              Aktívne
            </span>
          </div>
          <button className="w-full p-4 flex items-center justify-center gap-2 text-rose-400 hover:bg-white/5 transition-colors font-bold text-sm">
            <LogOut size={16} /> Odhlásiť sa z Garminu
          </button>
        </div>
      </section>

      {/* Training Plan */}
      <section>
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">
          Tréningový Plán
        </h3>
        <div className="glass-card rounded-2xl overflow-hidden divide-y divide-white/5">
          <div className="p-4 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <Target size={16} className="text-accent" /> Cieľový čas polmaratónu
            </label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-white font-bold w-full focus:outline-none focus:border-primary/50"
              />
              <button className="bg-primary hover:bg-blue-600 px-4 py-2 rounded-lg transition-colors flex items-center justify-center">
                <Save size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Z cieľového času sa počítajú tvoje tempá.</p>
          </div>
          
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="font-bold text-sm text-gray-300">Základný plán</p>
              <p className="text-xs text-gray-500">Hansons Advanced</p>
            </div>
            <span className="text-sm">18 týždňov</span>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section>
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">
          Aplikácia
        </h3>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Bell className="text-indigo-400" size={16} />
              </div>
              <div>
                <p className="font-bold text-sm text-gray-300">Ranné notifikácie</p>
                <p className="text-xs text-gray-500">Denný report o 8:30</p>
              </div>
            </div>
            {/* Toggle switch */}
            <button 
              onClick={() => setNotifications(!notifications)}
              className={`w-12 h-6 rounded-full p-1 transition-colors relative ${notifications ? 'bg-primary' : 'bg-gray-700'}`}
            >
              <motion.div 
                className="w-4 h-4 bg-white rounded-full absolute"
                animate={{ left: notifications ? '26px' : '4px' }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        </div>
      </section>

      <div className="text-center mt-8 text-xs text-gray-600">
        <p>Hansons Running Coach v1.0.0</p>
        <p>Postavené s Antigravity AI</p>
      </div>
    </div>
  );
}
