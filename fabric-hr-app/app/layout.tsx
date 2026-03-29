// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/providers/AuthProvider"; 
import { CompanyProvider } from "@/providers/CompanyContext"; // 🚀 O Cérebro Invisível entra aqui

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: false, 
})

export const metadata: Metadata = {
  title: "FabricHR",
  description: "SaaS Enterprise para Gestão de RH",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {/* O Escudo ativado em todas as páginas */}
        <AuthProvider>
          {/* 🚀 O Cérebro do Multi-Tenancy envelopando a rapaziada */}
          <CompanyProvider>
            {children}
          </CompanyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}