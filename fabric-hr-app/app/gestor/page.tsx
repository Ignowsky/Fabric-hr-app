"use client";
  // atualização 2024-06: Refatoração completa do painel do Gestor, unificando o design com o RH, adicionando indicadores de analytics, um calendário visual e uma central de notificações com cache local para leitura. O objetivo é entregar uma experiência mais fluida, informativa e alinhada com as necessidades de liderança.
import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, LogOut, Users, CalendarDays, AlertTriangle, FileText, Download, Filter, MessageSquare, ChevronLeft, ChevronRight, Bell, Home, Percent, Wallet, HeartPulse, ShieldAlert, ShieldCheck } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { apiFetch } from "@/services/api";
import { CompanySelector } from "@/components/ui/CompanySelector";
import { useCompany } from "@/providers/CompanyContext";

export default function ManagerDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter(); 
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [teamVacations, setTeamVacations] = useState<any[]>([]);
  const [teamMetrics, setTeamMetrics] = useState<any>({ 
    total_team_members: 0, overlap_risk: 0, avg_approval_time: 0, 
    total_accumulated_days: 0, fatigue_alerts: 0 
  });
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const { activeCompanyId} = useCompany();
  
  const [activeTab, setActiveTab] = useState<"pendentes" | "equipe" | "relatorios">("pendentes");

  // Filtros Avançados do Relatório (S-Rank)
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [filterAbono, setFilterAbono] = useState("TODOS");
  const [filter13, setFilter13] = useState("TODOS");
  const [filterEntraId, setFilterEntraId] = useState("TODOS");

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false, title: "", message: "", onConfirm: () => {}
  });

  //  ESTADO DO CACHE DE NOTIFICAÇÕES LIDAS
  const [readAlerts, setReadAlerts] = useState<string[]>([]);

useEffect(() => {
    // 1. Se não tá logado, chuta pra Home
    if (status === "unauthenticated") {
      setIsLoading(false);
      router.push("/");
      return;
    }

    // 🚨 2. TRAVA S-RANK: Só busca na API se o cara tá logado, 
    // tem e-mail E o Contexto já descobriu qual é a empresa dele!
    if (status === "authenticated" && session?.user?.email && activeCompanyId) {
      fetchTeamData();
    }
  }, [status, router, session, activeCompanyId]); // Coloca o activeCompanyId aqui na lista
  //  NOVO: RECUPERAR CACHE DO LOCALSTORAGE
  useEffect(() => {
    if (session?.user?.email) {
      const cachedAlerts = localStorage.getItem(`fabric_alerts_${session.user.email}`);
      if (cachedAlerts) {
        setReadAlerts(JSON.parse(cachedAlerts));
      }
    }
  }, [session?.user?.email]);


    const fetchTeamData = async () => {
        // 1. Se o cara não tá logado, expulsa pra Home e PARA o loading.
        if (status === "unauthenticated") {
          setIsLoading(false); // 🚨 Sem isso, a tela trava pra sempre!
          router.push("/");
          return;
        }

        // 2. Se a sessão ainda tá pensando, a gente só espera. 
        // O useEffect vai rodar essa função de novo sozinho quando logar.
        if (status !== "authenticated" || !session?.user?.email) return;

        // 3. O usuário tá logado! Começa a busca.
        setIsLoading(true);

        try {
          const email = session.user.email;
          

            const [teamData, notifData, userData] = await Promise.all([
              apiFetch(`/vacation/team_vacations?email=${email}`).catch(err => {
                console.warn("Aviso: Falha ao buscar time", err);
                return null;
              }), 
              apiFetch(`/notifications?email=${email}&context=gestor`).catch(() => []),
              apiFetch(`/vacation/balance?email=${email}`).catch(err => {
                console.warn("Aviso: Falha ao buscar saldo/usuário", err);
                return null;
              })
            ]);

            // Só alimenta os estados se a API devolver os dados corretos
            if (teamData && teamData.vacations) {
              setTeamVacations(teamData.vacations);
              if (teamData.metrics) setTeamMetrics((prev: any) => ({...prev, ...teamData.metrics}));
            } else {
              setTeamVacations([]); // Previne que a tabela quebre se for nulo
            }

            if (notifData) setNotifications(notifData);

            // 🚨 Aqui é o pulo do gato: Se o userData falhar, a gente injeta um "fake" 
            // com o e-mail da sessão só pra tela destravar e não ficar no "Carregando..."
            if (userData) {
              setCurrentUser(userData);
            } else {
              setCurrentUser({ email: email, name: "Erro ao carregar dados", role: "Gestor" });
            }
        } catch (error) {
          console.error("Erro ao carregar dados do time:", error);
          setTeamVacations([]);
          setCurrentUser({ email: session?.user?.email || "", name: "Erro ao carregar dados", role: "Gestor" });
        } finally {
          setIsLoading(false);
        }
  };

  useEffect(() => {
    fetchTeamData();
  }, [status, session]);

  // ==========================================
  // 🚀 LÓGICA DE NOTIFICAÇÕES (LEITURA E CACHE)
  // ==========================================
  const markAsRead = (notif: any) => {
    const key = notif.title + notif.message; 
    if (!readAlerts.includes(key)) {
      const newAlerts = [...readAlerts, key];
      setReadAlerts(newAlerts); // Atualiza visual na hora
      if (session?.user?.email) {
        // Grava no disco
        localStorage.setItem(`fabric_alerts_${session.user.email}`, JSON.stringify(newAlerts));
      }
    }
  };

  const unreadCount = notifications.filter(n => !readAlerts.includes(n.title + n.message)).length;

  const handleApprove = (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: "Aprovar Férias",
      message: "Tem certeza que deseja aprovar estas férias da sua equipe?",
      onConfirm: async () => { await processAction(id, "approve", ""); }
    });
  };

  const openRejectModal = (id: number) => {
    setRejectingId(id);
    setRejectReason("");
    setIsRejectModalOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectingId || rejectReason.trim() === "") return alert("Justificativa é obrigatória.");
    await processAction(rejectingId, "reject", rejectReason);
    setIsRejectModalOpen(false);
  };

  const processAction = async (id: number, action: "approve" | "reject", justification: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    try {
      const res = await fetch(`${baseUrl}/api/vacation/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, justification }) });
      if (!res.ok) throw new Error("Falha ao atualizar");
      toast.success(action === "approve" ? "Férias aprovadas com sucesso!" : "Solicitação reprovada.");
      fetchTeamData(); 
    } catch (error) { toast.error("Erro ao processar a solicitação."); }
  };

  // ==========================================
  // LÓGICA DE DADOS E INDICADORES
  // ==========================================
  const safeVacations = teamVacations || [];
  const pendingRequests = safeVacations.filter(req => req.status === "PENDENTE");
  
  const isAccountBlocked = (req: any) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = new Date(req.startDate + "T00:00:00");
    const end = new Date(req.endDate + "T23:59:59");
    return req.status === "APROVADO" && today >= start && today <= end;
  };

  const teamMembersOnVacationNow = safeVacations.filter(req => isAccountBlocked(req)).length;
  const absenceRate = teamMetrics.total_team_members > 0 
    ? ((teamMembersOnVacationNow / teamMetrics.total_team_members) * 100).toFixed(1) 
    : "0.0";

  const filteredReports = safeVacations.filter(req => {
    const matchStatus = filterStatus === "TODOS" || req.status === filterStatus;
    const matchAbono = filterAbono === "TODOS" || (filterAbono === "SIM" ? req.sellDays : !req.sellDays);
    const match13 = filter13 === "TODOS" || (filter13 === "SIM" ? req.advance13th : !req.advance13th);
    const blocked = isAccountBlocked(req);
    const matchEntraId = filterEntraId === "TODOS" || (filterEntraId === "BLOQUEADO" ? blocked : !blocked);

  // Filtro de Data
    const reqStart = new Date(req.startDate);
    const matchStartDate = !filterStartDate || reqStart >= new Date(filterStartDate);
    const matchEndDate = !filterEndDate || reqStart <= new Date(filterEndDate);

    return matchStatus && matchAbono && match13 && matchEntraId && matchStartDate && matchEndDate;
  });

const handleExportCSV = () => {
    if (filteredReports.length === 0) return alert("Não há dados filtrados para exportar.");
    const headers = ["Colaborador,Cargo,Data_Inicio,Data_Fim,Dias,Abono,Adiantou_13,Status_Férias,Status_Entra_ID,Auditoria_DataHora,Justificativa"];
    const rows = filteredReports.map((v: any) => 
      `"${v.employeeName}","${v.role}",${v.startDate},${v.endDate},${v.days},${v.sellDays ? 'Sim' : 'Nao'},${v.advance13th ? 'Sim' : 'Nao'},${v.status},"${isAccountBlocked(v) ? 'BLOQUEADO (Compliance)' : 'ATIVO'}","${new Date().toLocaleString()}","${v.justification || ''}"`
    );
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `extrato_auditoria_equipe_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDispatchToHR = async () => {
    if (filteredReports.length === 0) return toast.error("Não há dados para fechar o lote. Ajuste os filtros.");
    
    setConfirmDialog({
      isOpen: true,
      title: "Disparar Lote para DP",
      message: "Tem certeza que deseja fechar o lote e enviar o arquivo CSV para o Departamento Pessoal?",
      onConfirm: async () => {
        const toastId = toast.loading("Empacotando CSV e disparando via nuvem...");
        setIsDispatching(true);
        // ... (MANTENHA A SUA LÓGICA DE GERAR O CSV AQUI) ...
        const headers = ["Colaborador,Cargo,Data_Inicio,Data_Fim,Dias,Abono,Adiantou_13,Status_Férias,Status_Entra_ID,Auditoria_DataHora,Justificativa"];
        const rows = filteredReports.map((v: any) => `"${v.employeeName}","${v.role}",${v.startDate},${v.endDate},${v.days},${v.sellDays ? 'Sim' : 'Nao'},${v.advance13th ? 'Sim' : 'Nao'},${v.status},"${isAccountBlocked(v) ? 'BLOQUEADO' : 'ATIVO'}","${new Date().toLocaleString()}","${v.justification || ''}"`);
        const csvString = headers.concat(rows).join("\n");

        try {
          const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
          const res = await fetch(`${baseUrl}/api/gestor/dispatch`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: session?.user?.email, csv_data: csvString })
          });
          if (!res.ok) throw new Error("Erro ao disparar lote");
          toast.success("Lote disparado! DP foi notificado.", { id: toastId });
        } catch (err) {
          toast.error("Erro ao notificar o RH.", { id: toastId });
        } finally {
          setIsDispatching(false);
        }
      }
    });
  };

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  const getVacationsForDay = (day: number) => {
    const dayDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayDate = new Date(dayDateStr);
    
    return safeVacations.filter((v: any) => {
      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      return dayDate >= start && dayDate <= end;
    });
  };

 // Renderiza o CompanySelector oculto durante o carregamento.
  // Necessário para buscar o ID da empresa e liberar o fetchTeamData.
  if (status === "loading" || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FBFBFD]">
        <div className="hidden">
          {session?.user?.email && <CompanySelector userEmail={session.user.email} />}
        </div>
        <p className="animate-pulse">Carregando painel do Gestor...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FBFBFD] p-4 md:p-8 relative">
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F]">Portal do Gestor</h1>
          <p className="text-sm text-gray-500">Gestão e Analytics da Equipe</p>
        </div>
        
        <div className="flex items-center gap-4">
          
          {/* Seletor de empresa visível no cabeçalho após o carregamento */}
          {session?.user?.email && <CompanySelector userEmail={session.user.email} />}

          <div className="relative">
            <Button variant="outline" size="icon" onClick={() => setShowNotifications(!showNotifications)} className="relative border-gray-200">
              <Bell size={18} className="text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-100 rounded-3xl shadow-xl z-50 max-h-[400px] flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 text-sm">Central de Alertas</h3>
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded-full">{unreadCount} Não lidos</span>
                </div>
                <div className="p-2 overflow-y-auto custom-scrollbar flex-1">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-gray-500 p-6 text-center">Nenhuma notificação da sua equipe.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {notifications.map((n: any, idx) => {
                        const isRead = readAlerts.includes(n.title + n.message);
                        
                        // Lógica de cores
                        const baseColor = n.type === 'danger' ? 'bg-red-50 border-red-100 text-red-800' : 
                                          n.type === 'warning' ? 'bg-orange-50 border-orange-100 text-orange-800' : 
                                          n.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' : 
                                          'bg-blue-50 border-blue-100 text-blue-800';

                        return (
                          <div 
                            key={idx} 
                            onMouseEnter={() => markAsRead(n)} // 🚀 NOVO: Marca como lido ao passar o mouse
                            className={`p-3 rounded-xl border relative transition-all duration-300 ${baseColor} ${isRead ? 'opacity-50 shadow-none' : 'opacity-100 shadow-md'}`}
                          >
                            {!isRead && <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                            <h4 className="text-xs font-bold mb-1 uppercase tracking-wider pr-4">{n.title}</h4>
                            <p className="text-sm font-medium">{n.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* NAVEGAÇÃO VIP NA PÍLULA BRANCA */}
          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
            <div className="flex items-center gap-2 pl-1">
              <Button variant="outline" size="sm" onClick={() => router.push('/')} className="text-gray-600 border-gray-200 hover:bg-gray-50 rounded-xl whitespace-nowrap">
                <Home size={16} className="mr-2 text-gray-500" /> Meu Portal
              </Button>
              {(currentUser?.is_rh || currentUser?.is_hr) && (
                <Button variant="outline" size="sm" onClick={() => router.push('/rh')} className="text-gray-600 border-gray-200 hover:bg-gray-50 rounded-xl whitespace-nowrap">
                  <Users size={16} className="mr-2 text-purple-600" /> Administração RH
                </Button>
              )}
            </div>

            <div className="flex items-center gap-4 border-l border-gray-100 pl-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{session?.user?.name}</p>
                <p className="text-xs text-blue-600 font-bold tracking-wide">Liderança</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: '/' })} className="text-red-500 hover:bg-red-50 rounded-xl shrink-0"><LogOut size={20} /></Button>
            </div>
          </div>
        </div>
      </header>

      {/* INDICADORES ANALYTICS (GRID DE 6 CARDS) */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><Users size={14}/> Liderados</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0"><div className="text-3xl font-bold text-gray-900">{teamMetrics.total_team_members || 0}</div></CardContent>
        </Card>
        
        <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-purple-500">
          <CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><Percent size={14}/> Índice Desfalque</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-bold text-gray-900">{absenceRate}%</div>
            <p className="text-[10px] text-gray-400 mt-1">Ausentes hoje</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-indigo-500">
          <CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><Wallet size={14}/> Saldo Acumulado</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-bold text-gray-900">{teamMetrics.total_accumulated_days || 0}</div>
            <p className="text-[10px] text-gray-400 mt-1">Dias retidos do setor</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-orange-500">
          <CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><AlertTriangle size={14}/> Sobreposição</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-bold text-orange-500">{teamMetrics.overlap_risk || 0}</div>
            {teamMetrics.overlap_risk > 0 && <p className="text-[10px] text-red-500 font-bold mt-1">Conflito de datas!</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-red-500">
          <CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><HeartPulse size={14}/> Alerta Fadiga</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-bold text-red-600">{teamMetrics.fatigue_alerts || 0}</div>
            <p className="text-[10px] text-red-400 mt-1">Urgência de descanso</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm bg-[#1D1D1F] text-white">
          <CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Clock size={14}/> Pendentes</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-bold text-orange-400">{pendingRequests.length}</div>
            <p className="text-[10px] text-gray-400 mt-1">Revisão necessária</p>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-7xl mx-auto mb-6 flex gap-4 border-b border-gray-200 pb-2 overflow-x-auto">
        <button onClick={() => setActiveTab("pendentes")} className={`pb-2 px-1 text-sm font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === "pendentes" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}><Clock size={16} /> Caixa de Entrada {pendingRequests.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] font-bold py-0.5 px-2 rounded-full">{pendingRequests.length}</span>}</button>
        <button onClick={() => setActiveTab("equipe")} className={`pb-2 px-1 text-sm font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === "equipe" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}><CalendarDays size={16} /> Mapa de Férias</button>
        <button onClick={() => setActiveTab("relatorios")} className={`pb-2 px-1 text-sm font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === "relatorios" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}><FileText size={16} /> Analytics & Extratos</button>
      </div>

      <div className="max-w-7xl mx-auto space-y-4">
        {activeTab === "pendentes" && (
          pendingRequests.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-3xl border border-gray-100"><Check className="mx-auto text-green-500 mb-4" size={32} /><h3 className="text-lg font-medium">Caixa limpa! Nenhuma pendência.</h3></div>
          ) : (
            pendingRequests.map((req: any) => (
              <Card key={req.id} className="rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between p-4 md:p-6 bg-white gap-6">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="bg-orange-100 p-3 rounded-full shrink-0"><Clock className="text-orange-500" size={24} /></div>
                  <div className="min-w-0"><h3 className="text-lg font-bold truncate">{req.employeeName}</h3><p className="text-sm text-gray-500 truncate">{req.role}</p>
                    <div className="flex gap-2 mt-2">
                      {req.sellDays && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Abono 10d</span>}
                      {req.advance13th && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Adiantou 13º</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-6 shrink-0"><div className="text-center md:text-left"><p className="text-sm text-gray-500">Período</p><p className="font-semibold whitespace-nowrap">{req.startDate.split('-').reverse().join('/')} a {req.endDate.split('-').reverse().join('/')}</p><p className="text-xs text-gray-400">{req.days} dias</p></div>
                  <div className="flex gap-2"><Button variant="outline" className="border-red-200 text-red-600 rounded-xl" onClick={() => openRejectModal(req.id)}><X className="mr-2" size={16} /> Reprovar</Button><Button className="bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-sm" onClick={() => handleApprove(req.id)}><Check className="mr-2" size={16} /> Aprovar</Button></div>
                </div>
              </Card>
            ))
          )
        )}

        {activeTab === "equipe" && (
          <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
            <div className="p-6 flex justify-between border-b">
              <div><h2 className="text-xl font-semibold">Mapa Mensal da Equipe</h2><p className="text-sm text-gray-500">Cruzamento de ausências do seu time direto</p></div>
              <div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={handlePrevMonth} className="rounded-full"><ChevronLeft size={16}/></Button><span className="font-bold w-32 text-center">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span><Button variant="outline" size="icon" onClick={handleNextMonth} className="rounded-full"><ChevronRight size={16}/></Button></div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl border">
                {weekdayNames.map(name => <div key={name} className="p-3 bg-gray-50 text-center text-xs font-bold text-gray-500 uppercase">{name}</div>)}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="bg-white h-28"></div>)}
                {calendarDays.map(day => (
                  <div key={day} className="bg-white p-2 h-28 border flex flex-col">
                    <span className="text-xs font-bold text-gray-400 mb-1">{day}</span>
                    <div className="space-y-1 mt-1 overflow-y-auto custom-scrollbar h-[72px]">
                      {getVacationsForDay(day).map((v: any, i: number) => (
                        <div key={i} className={`text-[9px] font-bold p-1 rounded truncate ${v.status === 'APROVADO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700 border border-orange-200 border-dashed'}`} title={`${v.employeeName} (${v.days}d)`}>
                          {v.employeeName}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "relatorios" && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 mr-2"><Filter size={16} className="text-gray-400"/><span className="text-sm font-semibold">Filtros Avançados:</span></div>
                
                <div className="flex items-center gap-2">
                  <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500" title="Data Inicial" />
                  <span className="text-gray-400">até</span>
                  <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500" title="Data Final" />
                </div>

                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500">
                  <option value="TODOS">Status (Todos)</option><option value="APROVADO">Aprovados</option><option value="PENDENTE">Pendentes</option>
                </select>
                <select value={filterEntraId} onChange={e=>setFilterEntraId(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500">
                  <option value="TODOS">Entra ID (Todos)</option><option value="BLOQUEADO">Bloqueado</option><option value="ATIVO">Ativo</option>
                </select>
              </div>
              <div className="flex gap-3 shrink-0">
                <Button onClick={handleExportCSV} variant="outline" className="rounded-xl border-gray-200 hover:bg-gray-50"><Download className="mr-2" size={16}/> Exportar (CSV)</Button>
                <Button onClick={handleDispatchToHR} disabled={isDispatching} className="bg-blue-600 text-white rounded-xl shadow-sm hover:bg-blue-700">
                  {isDispatching ? "Disparando..." : "Disparar Lote para DP"}
                </Button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500 tracking-wide"><th className="p-4">Colaborador</th><th className="p-4">Período de Descanso</th><th className="p-4 text-center">Dias / Vantagens</th><th className="p-4 text-center">Entra ID (Cloud)</th><th className="p-4 text-right">Status do Pedido</th></tr></thead>
                <tbody>
                  {filteredReports.length === 0 ? (
                    <tr><td colSpan={5} className="p-12 text-center text-gray-500">Nenhum resultado na base de dados para estes filtros.</td></tr>
                  ) : (
                    filteredReports.map((req: any) => (
                      <tr key={req.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-bold text-gray-900">{req.employeeName}<p className="text-xs text-gray-500 font-normal">{req.role}</p></td>
                        <td className="p-4 text-gray-700">{req.startDate.split('-').reverse().join('/')} a {req.endDate.split('-').reverse().join('/')}</td>
                        <td className="p-4 text-center"><div className="font-bold text-gray-900">{req.days} dias</div><div className="flex gap-1 justify-center mt-1">{req.sellDays && <span className="text-[9px] font-bold tracking-wide uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Abono</span>}{req.advance13th && <span className="text-[9px] font-bold tracking-wide uppercase bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">13º</span>}</div></td>
                        <td className="p-4 text-center">
                          {isAccountBlocked(req) 
                            ? <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 px-2 py-1 rounded-full border border-red-100"><ShieldAlert size={12} className="mr-1"/> Bloqueado</span> 
                            : <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-1 rounded-full border border-blue-100"><ShieldCheck size={12} className="mr-1"/> Ativo</span>
                          }
                        </td>
                        <td className="p-4 text-right">
                          {req.status === "APROVADO" && <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-100 px-3 py-1 rounded-full shadow-sm">Aprovado</span>}
                          {req.status === "PENDENTE" && <span className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full shadow-sm">Em Análise</span>}
                          {req.status === "REPROVADO" && <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 px-3 py-1 rounded-full shadow-sm">Reprovado</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center gap-3 mb-4"><div className="bg-red-100 p-3 rounded-full"><MessageSquare className="text-red-600" size={20} /></div><h2 className="text-xl font-bold text-gray-900">Justificar Recusa</h2></div>
            <p className="text-sm text-gray-500 mb-6">O colaborador será notificado com o motivo desta reprovação.</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: Chocará com o deploy do mês, peço que remarque para a semana seguinte." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] resize-none mb-6 text-sm" />
            <div className="flex gap-3"><Button variant="outline" onClick={() => setIsRejectModalOpen(false)} className="flex-1 rounded-xl border-gray-200 text-gray-600">Cancelar</Button><Button onClick={confirmReject} className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-xl shadow-sm">Confirmar Recusa</Button></div>
          </div>
        </div>
      )}
      {/* 🚀 COMPONENTE BASE PARA OS TOASTS */}
      <Toaster position="top-right" reverseOrder={false} />

      {/* 🚀 MODAL GENÉRICO DE CONFIRMAÇÃO S-RANK */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-100 transform transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-orange-100 p-3 rounded-full">
                <ShieldAlert className="text-orange-600" size={24} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{confirmDialog.title}</h2>
            </div>
            <p className="text-sm text-gray-600 mb-8 leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} className="flex-1 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50">
                Cancelar
              </Button>
              <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog({ ...confirmDialog, isOpen: false }); }} className="flex-1 bg-purple-600 text-white hover:bg-purple-700 rounded-xl shadow-sm">
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}