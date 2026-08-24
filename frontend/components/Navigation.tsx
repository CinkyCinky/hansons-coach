"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, BarChart2, MessageCircle, Settings, BookOpen } from "lucide-react";
import { clsx } from "clsx";

export default function Navigation() {
  const pathname = usePathname();

  // Na prihlasovacích obrazovkách navigáciu neukazujeme
  if (pathname === "/login" || pathname.startsWith("/reset-password")) return null;

  // 6 položiek — kompaktné rozloženie, aby sa zmestili na úzky mobil.
  const tabs = [
    { name: "Prehľad", href: "/", icon: Home },
    { name: "Plán", href: "/plan", icon: Calendar },
    { name: "Reporty", href: "/reports", icon: BarChart2 },
    { name: "Tréner", href: "/chat", icon: MessageCircle },
    { name: "Metóda", href: "/about", icon: BookOpen },
    { name: "Nastavenia", href: "/settings", icon: Settings },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pt-2 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] bg-[#0a0a0f] border-t border-white/5">
      <div className="max-w-md mx-auto glass-card flex justify-between items-center px-3 py-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 transition-all min-w-0",
                isActive ? "text-primary scale-110" : "text-gray-500 hover:text-gray-300"
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[9px] font-medium leading-none">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
