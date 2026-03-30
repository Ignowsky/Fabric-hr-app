'use client';

import React, { useEffect } from 'react';
import { useCompany } from '@/providers/CompanyContext';
import { apiFetch } from '@/services/api';

// 🚨 Troque o userId pelo userEmail
export function CompanySelector({ userEmail }: { userEmail: string }) {
    const { activeCompanyId, setActiveCompanyId, companies, setCompanies } = useCompany();

    useEffect(() => {
        const carregarEmpresas = async () => {
            try {
                // 🚨 Bate na API usando o e-mail da sessão!
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

    const handleTrocaDeBase = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setActiveCompanyId(e.target.value);
        window.location.reload();
    };

    if (companies.length <= 1) return null;

    return (
        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">🏢 Base:</span>
            <select 
                value={activeCompanyId || ''} 
                onChange={handleTrocaDeBase}
                className="bg-transparent text-slate-800 border-none rounded px-1 text-sm font-semibold cursor-pointer focus:ring-0 outline-none"
            >
                {companies.map((comp) => (
                    <option key={comp.id} value={comp.id} className="text-slate-800">
                        {comp.name} {comp.is_primary ? '⭐' : ''}
                    </option>
                ))}
            </select>
        </div>
    );
}