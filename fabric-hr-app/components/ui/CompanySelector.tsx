'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useCompany } from '@/providers/CompanyContext';
import { apiFetch } from '@/services/api';
import { Building2, ChevronDown, Check } from 'lucide-react';

export function CompanySelector({ userEmail }: { userEmail: string }) {
    const { activeCompanyId, setActiveCompanyId, companies, setCompanies } = useCompany();
    const [isOpen, setIsOpen] = useState(false);
    
    // Referência para sabermos se o cara clicou fora do menu pra fechar
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 🚀 1. Busca as empresas da API
    useEffect(() => {
        const carregarEmpresas = async () => {
            try {
                const data = await apiFetch(`/api/users/my-companies?email=${userEmail}`);
                setCompanies(data.allowed_companies);

                if (!localStorage.getItem('@FabricHR:activeCompanyId') && data.primary_id) {
                    setActiveCompanyId(String(data.primary_id));
                }
            } catch (error) {
                console.error("🚨 Genjutsu no carregamento das empresas:", error);
            }
        };

        if (userEmail) carregarEmpresas();
    }, [userEmail, setCompanies, setActiveCompanyId]);

    // 🚀 2. O Jutsu de fechar ao clicar fora (Click-away listener)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (id: string) => {
        setActiveCompanyId(id);
        setIsOpen(false);
        window.location.reload(); // Recarrega para aplicar o contexto global
    };

    // Se o cara só tem uma empresa, não precisa de dropdown
    if (companies.length <= 1) return null;

    // Descobre qual é a empresa ativa no momento pra mostrar no botão
    const activeCompany = companies.find(c => String(c.id) === String(activeCompanyId)) || companies[0];

    return (
        <div className="relative" ref={dropdownRef}>
            {/* 🛡️ O BOTÃO GATILHO (Premium UI) */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 p-1.5 pr-3 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
                <div className="bg-slate-100 p-1.5 rounded-lg">
                    <Building2 size={16} className="text-slate-600" />
                </div>
                <div className="flex flex-col items-start text-left">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                        Base Operacional
                    </span>
                    <span className="text-sm font-semibold text-slate-800 leading-none truncate max-w-[150px]">
                        {activeCompany?.name || "Carregando..."}
                    </span>
                </div>
                <ChevronDown size={16} className={`text-slate-400 ml-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* 🛡️ O MENU DROPDOWN (Flutuante Absoluto) */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden transform origin-top-right transition-all">
                    <div className="p-2 bg-slate-50 border-b border-slate-100">
                        <p className="text-xs font-semibold text-slate-500">Alternar Empresa</p>
                    </div>
                    <div className="p-1 max-h-60 overflow-y-auto custom-scrollbar">
                        {companies.map((comp) => {
                            const isActive = String(comp.id) === String(activeCompanyId);
                            return (
                                <button
                                    key={comp.id}
                                    onClick={() => handleSelect(String(comp.id))}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                                        isActive 
                                            ? 'bg-purple-50 text-purple-700' 
                                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        {/* Ícone de Check se for a selecionada */}
                                        <div className="w-4 flex-shrink-0 flex justify-center">
                                            {isActive && <Check size={16} className="text-purple-600" />}
                                        </div>
                                        <span className="truncate">{comp.name}</span>
                                    </div>
                                    
                                    {/* A Badge S-Rank da Matriz (Sem emojis!) */}
                                    {comp.is_primary && (
                                        <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded-full border border-slate-300/50">
                                            Matriz
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}