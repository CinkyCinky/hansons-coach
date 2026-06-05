import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hansons Coach",
  description: "Personal AI Running Coach for Hansons Method",
  manifest: "/manifest.json",
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body className={`${inter.className} pb-20`}>
        <main className="max-w-md mx-auto min-h-screen relative p-4">
          {children}
        </main>
        <Navigation />
      </body>
    </html>
  );
}
