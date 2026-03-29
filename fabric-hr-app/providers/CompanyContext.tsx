'use client'; // 🚨 Obrigatório no Next.js App Router para usar Contexto!

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';

// Tipagem S-Rank pra não dar BO no TypeScript
interface Company {
  id: number;
  name: string;
  is_primary?: boolean;
}

interface CompanyContextType {
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string) => void;
  companies: Company[];
  setCompanies: (companies: Company[]) => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider = ({ children }: { children: ReactNode }) => {
    const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);

    // 1. Puxa do LocalStorage assim que a tela carrega (no lado do cliente)
    useEffect(() => {
        const savedId = localStorage.getItem('@FabricHR:activeCompanyId');
        if (savedId) {
            setActiveCompanyId(savedId);
        }
    }, []);

    // 2. Salva no LocalStorage toda vez que o Domingues trocar de empresa
    useEffect(() => {
        if (activeCompanyId) {
            localStorage.setItem('@FabricHR:activeCompanyId', activeCompanyId);
        }
    }, [activeCompanyId]);

    return (
        <CompanyContext.Provider value={{ activeCompanyId, setActiveCompanyId, companies, setCompanies }}>
            {children}
        </CompanyContext.Provider>
    );
};

// Hook customizado pra você usar na Navbar ou qualquer outra tela
export const useCompany = () => {
    const context = useContext(CompanyContext);
    if (!context) {
        throw new Error('useCompany deve ser usado dentro de um CompanyProvider');
    }
    return context;
};