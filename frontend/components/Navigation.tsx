"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, BarChart2, MessageCircle, Settings } from "lucide-react";
import { clsx } from "clsx";

export default function Navigation() {
  const pathname = usePathname();

  // Na prihlasovacej obrazovke navigáciu neukazujeme
  if (pathname === "/login") return null;

  const tabs = [
    { name: "Prehľad", href: "/", icon: Home },
    { name: "Plán", href: "/plan", icon: Calendar },
    { name: "Reporty", href: "/reports", icon: BarChart2 },
    { name: "Tréner", href: "/chat", icon: MessageCircle },
    { name: "Nastavenia", href: "/settings", icon: Settings },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f] to-transparent">
      <div className="max-w-md mx-auto glass-card flex justify-between items-center px-6 py-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;
          
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 transition-all",
                isActive ? "text-primary scale-110" : "text-gray-500 hover:text-gray-300"
              )}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
