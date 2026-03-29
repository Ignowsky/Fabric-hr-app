'use client';

import React, { useEffect } from 'react';
import { useCompany } from '@/providers/CompanyContext';
import { apiFetch } from '@/services/api';

// Passamos o ID do usuário logado como prop (ou você pode puxar do seu contexto de Auth depois)
export function CompanySelector({ userId }: { userId: number }) {
    const { activeCompanyId, setActiveCompanyId, companies, setCompanies } = useCompany();

    // 🚀 Efeito S-Rank: Puxa as empresas que esse usuário tem acesso direto do Back-end
    useEffect(() => {
        const carregarEmpresas = async () => {
            try {
                // Lembra daquela rota que a gente criou no users.py? É aqui que ela brilha!
                const data = await apiFetch(`/${userId}/my-companies`);
                
                setCompanies(data.allowed_companies);

                // Se não tem empresa ativa no cache (primeiro login), seta a principal como padrão
                if (!localStorage.getItem('@FabricHR:activeCompanyId') && data.primary_id) {
                    setActiveCompanyId(String(data.primary_id));
                }
            } catch (error) {
                console.error("🚨 Genjutsu no carregamento das empresas:", error);
            }
        };

        if (userId) {
            carregarEmpresas();
        }
    }, [userId, setCompanies, setActiveCompanyId]);

    // ⚔️ Função que roda quando o gestor troca a chave de base
    const handleTrocaDeBase = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const novoId = e.target.value;
        setActiveCompanyId(novoId);
        
        // 🚨 Dá um reload maroto pra tela inteira piscar e todas as rotas da página 
        // puxarem os dados novos com o Header atualizado!
        window.location.reload();
    };

    // Ocultação S-Rank: Se o cara só tem 1 empresa, a gente nem mostra o dropdown pra não poluir o layout
    if (companies.length <= 1) return null;

    return (
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                🏢 Base:
            </span>
            <select 
                value={activeCompanyId || ''} 
                onChange={handleTrocaDeBase}
                className="bg-transparent text-slate-800 dark:text-slate-100 border-none rounded px-1 text-sm font-semibold cursor-pointer focus:ring-0 outline-none transition-all"
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