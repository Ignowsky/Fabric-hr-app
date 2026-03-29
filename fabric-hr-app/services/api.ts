// 📁 Arquivo: services/api.ts
import axios, { InternalAxiosRequestConfig } from 'axios';

// ==========================================================
// ⚔️ OPÇÃO 1: O FETCH NATIVO (Com o Jutsu do Cabeçalho)
// ==========================================================
export const apiFetch = async (endpoint: string, options: any = {}) => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const cleanPath = endpoint.startsWith("/api") ? endpoint : `/api${endpoint}`;
  const url = `${baseUrl}${cleanPath}`;

  // 🚀 Puxa o ID da empresa do Cache (Blindado pro lado do Servidor do Next.js)
  let companyId = null;
  if (typeof window !== 'undefined') {
    companyId = localStorage.getItem('@FabricHR:activeCompanyId');
  }

  const defaultOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // 🚨 O Selo S-Rank: Se tiver ID da empresa, injeta no header!
      ...(companyId ? { "x-company-id": companyId } : {}), 
      ...options.headers,
    },
  };

  const response = await fetch(url, defaultOptions);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro na API: ${response.status}`);
  }

  return response.json();
};

// ==========================================================
// ⚔️ OPÇÃO 2: O AXIOS (Com o TS Corrigido)
// ==========================================================
export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
});

// 🚀 O INTERCEPTADOR S-RANK
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
        const companyId = localStorage.getItem('@FabricHR:activeCompanyId');
        
        // Verifica se o headers existe pra evitar BO e injeta a chave
        if (companyId && config.headers) {
            // O TS aceita liso quando a gente usa a tipagem any pra chaves customizadas
            (config.headers as any)['x-company-id'] = companyId; 
        }
    }
    return config;
});