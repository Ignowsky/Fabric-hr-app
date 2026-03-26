// src/services/api.ts

// Puxa a URL do .env ou usa o localhost como segurança
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Monta a URL completa. Ex: "http://127.0.0.1:8000/api" + "/rh/metrics"
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers, // Mantém outros headers se você passar (ex: tokens)
    },
  });

  if (!response.ok) {
    // 🚨 Log Ninja no console pra te salvar no debug
    console.error(`🚨 [API Error] ${response.status} batendo em: ${url}`);
    
    // Tenta pegar a mensagem de erro que o FastAPI mandou
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Erro na API: ${response.statusText}`);
  }

  return response.json();
};