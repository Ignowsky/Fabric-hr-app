// 📁 Arquivo: services/api.ts

export const apiFetch = async (endpoint: string, options: any = {}) => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  
  // 🚀 O JUTSU DE AUTO-CORREÇÃO: 
  // Se o endpoint não começar com /api, a gente injeta ele automaticamente!
  const cleanPath = endpoint.startsWith("/api") ? endpoint : `/api${endpoint}`;
  
  const url = `${baseUrl}${cleanPath}`;

  const defaultOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const response = await fetch(url, defaultOptions);

  if (!response.ok) {
    // Tenta pegar o erro detalhado do FastAPI
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro na API: ${response.status}`);
  }

  return response.json();
};