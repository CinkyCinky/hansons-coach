import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Onboarding from "@/components/Onboarding";
import { AppStoreProvider } from "@/lib/store";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hansons Coach | AI Bežecký Tréner",
  description: "Osobný AI bežecký tréner podľa Hansons Half-Marathon metódy. Prepojený s Garmin Connect.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AI Tréner" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={`${inter.className} pb-20`}>
        <AppStoreProvider>
          <main className="max-w-md mx-auto min-h-screen relative p-4">
            {children}
          </main>
          <Navigation />
          <Onboarding />
        </AppStoreProvider>
      </body>
    </html>
  );
}
