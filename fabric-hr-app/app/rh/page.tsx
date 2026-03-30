"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BarChart3, LogOut, Plus, Pencil, Ban, CheckCircle, X, ShieldCheck, Crown, Bell, Home, ChevronLeft, ChevronRight, FileText, Download, Filter, ShieldAlert, Percent, Wallet, HeartPulse, CalendarDays, Clock, Check, MessageSquare, CloudOff, Cloud, Search, Lock} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { apiFetch } from "@/services/api";
import { CompanySelector } from "@/components/ui/CompanySelector";
import { useCompany } from "@/providers/CompanyContext";

export default function RHDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { activeCompanyId } = useCompany();

  const [activeTab, setActiveTab] = useState<"pendentes" | "colaboradores" | "dashboard" | "relatorios">("pendentes");
  const [users, setUsers] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // 🚀 ESTADO DO CACHE: Começa vazio, mas o useEffect vai preencher com o que tá no disco
  const [readAlerts, setReadAlerts] = useState<string[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [reportType, setReportType] = useState<"solicitacoes" | "saldos">("solicitacoes");
  const [filterDepartment, setFilterDepartment] = useState("TODOS");
  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [filterAbono, setFilterAbono] = useState("TODOS");
  const [filter13, setFilter13] = useState("TODOS");
  const [filterEntraId, setFilterEntraId] = useState("TODOS");
  const [filterFadiga, setFilterFadiga] = useState("TODOS"); 
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [crudSearch, setCrudSearch] = useState("");
  const [crudDept, setCrudDept] = useState("TODOS");
  const [crudRole, setCrudRole] = useState("TODOS");
  const [crudLeader, setCrudLeader] = useState("TODOS");
  const [crudPage, setCrudPage] = useState(1);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    full_name: "", email: "", role: "", department: "", 
    admission_date: "", is_manager: false, is_hr: false, manager_id: ""
  });

  // NOVO: Estado do Modal de Confirmação Genérico
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false, title: "", message: "", onConfirm: () => {}
  });

  // ==========================================
  // 🚀 NOVO: RECUPERAR CACHE DO LOCALSTORAGE
  // ==========================================
  useEffect(() => {
    if (session?.user?.email) {
      const cachedAlerts = localStorage.getItem(`fabric_alerts_${session.user.email}`);
      if (cachedAlerts) {
        setReadAlerts(JSON.parse(cachedAlerts));
      }
    }
  }, [session?.user?.email]);

    const fetchData = async () => {
      // 1. Garante que o loading comece (caso não tenha começado)
      setIsLoading(true); 

      try {
        const email = session?.user?.email || "";
        
        // 🚀 CORREÇÃO DAS ROTAS: Adicionando o /api que o Render exige
        const [usersData, metricsData, notifData] = await Promise.all([
          apiFetch("/api/users"), 
          apiFetch("/api/rh/metrics"),
          email ? apiFetch(`/api/notifications?email=${email}&context=rh`) : Promise.resolve(null)
        ]);
        
        // Se chegou aqui, os dados são o JSON pronto
        if (usersData) setUsers(usersData);
        if (metricsData) setMetrics(metricsData);
        if (notifData) setNotifications(notifData);
        
      } catch (err) {
        console.error("🚨 Erro S-Rank ao buscar dados do RH:", err);
        // Aqui você pode setar um erro pra mostrar na tela se quiser
      } finally {
        // 🔑 O SEGREDO DO SUCESSO: O finally roda SEMPRE. 
        // Independente de dar certo ou 404, a tela vai destravar agora!
        setIsLoading(false);
      }
    };

  useEffect(() => {
      if (status === "unauthenticated") router.
      push("/");
      
      if (status === "authenticated" && activeCompanyId) {
          fetchData(); 
      }
    }, [status, router, session, activeCompanyId]); // Adiciona o activeCompanyId nas dependências

  const currentUser = users.find(u => u.email === session?.user?.email);

  // ==========================================
  // NOVO: GRAVAR LEITURA NO LOCALSTORAGE
  // ==========================================
  const markAsRead = (notif: any) => {
    const key = notif.title + notif.message; 
    if (!readAlerts.includes(key)) {
      const newAlerts = [...readAlerts, key];
      setReadAlerts(newAlerts); // Atualiza a tela na hora
      if (session?.user?.email) {
        // Grava no disco rígido do navegador (sobrevive ao F5)
        localStorage.setItem(`fabric_alerts_${session.user.email}`, JSON.stringify(newAlerts));
      }
    }
  };

  const unreadCount = notifications.filter(n => !readAlerts.includes(n.title + n.message)).length;

  // ==========================================
  // MOTOR DE APROVAÇÃO DO RH (God Mode)
  // ==========================================
  const handleApprove = (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: "Aprovar Férias",
      message: "Tem certeza que deseja aprovar estas férias em nome do RH?",
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
      try {
        await apiFetch(`/vacation/${id}/status`, { 
          method: "PUT", 
          body: JSON.stringify({ action, justification }) 
        });
        
        toast.success(action === "approve" ? "Férias aprovadas com sucesso!" : "Solicitação reprovada.");
        fetchData(); 
      } catch (error) { 
        toast.error("Erro ao processar a solicitação."); 
      }
    };

  // ==========================================
  // CRUD DE USUÁRIOS
  // ==========================================
  const openCreateModal = () => {
    setEditingUserId(null);
    setFormData({ full_name: "", email: "", role: "", department: "", admission_date: "", is_manager: false, is_hr: false, manager_id: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setEditingUserId(user.id);
    setFormData({
      full_name: user.name, 
      email: user.email, 
      role: user.role, 
      department: user.department, 
      admission_date: user.admission_date.split("/").reverse().join("-"), 
      is_manager: user.is_manager, 
      is_hr: user.is_hr, 
      manager_id: user.manager_id || ""
    });
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
      e.preventDefault();
      const payload = { ...formData, manager_id: formData.manager_id === "" ? null : Number(formData.manager_id) };
      
      try {
        if (editingUserId) {
          await apiFetch(`/users/${editingUserId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) });
        }
        
        toast.success(`Usuário ${editingUserId ? "atualizado" : "criado"} com sucesso!`);
        setIsModalOpen(false); 
        fetchData();
      } catch (error: any) { 
        toast.error(error.message); 
      }
    };
  
  const toggleStatus = (id: number) => {
      setConfirmDialog({
        isOpen: true,
        title: "Alterar Status",
        message: "Tem certeza que deseja ativar/desativar este colaborador?",
        onConfirm: async () => {
          try { 
            await apiFetch(`/users/${id}/toggle-status`, { method: "PUT" }); 
            toast.success("Status atualizado!"); 
            fetchData(); 
          } catch (err) { 
            toast.error("Erro ao alterar status."); 
          }
        }
      });
    };

  const toggleEntraId = (id: number, enable: boolean, name: string) => {
      const acao = enable ? "DESBLOQUEAR" : "BLOQUEAR";
      setConfirmDialog({
        isOpen: true,
        title: `Auditoria Microsoft Entra ID`,
        message: `Deseja forçar o ${acao} de ${name} diretamente no Azure/Cloud?`,
        onConfirm: async () => {
          const toastId = toast.loading("Comunicando com a Microsoft...");
          try {
            const data = await apiFetch(`/users/${id}/entra`, { 
              method: "PUT", 
              body: JSON.stringify({ enable }) 
            });
            
            toast.success(`S-Rank! ${data.message}`, { id: toastId });

            setUsers(prevUsers => 
              prevUsers.map(user => 
                user.id === id ? { ...user, is_entra_blocked: !enable } : user
              )
            ); // Atualiza o estado localmente sem precisar refazer fetch geral
          } catch (err: any) { 
            // O erro que vem do FastAPI já é capturado pelo apiFetch e jogado aqui
            toast.error(`Erro Crítico: ${err.message}`, { id: toastId }); 
          }
        }
      });
    };
  // ==========================================
  // QUITAÇÃO DE PASSIVO LEGADO (ONBOARDING)
  // ==========================================
  const handleQuitarPeriodo = (id: number, name: string, label: string, dias: number) => {
      setConfirmDialog({
        isOpen: true,
        title: "Quitação de Passivo (Legacy)",
        message: `Deseja quitar o período "${label}" de ${name}? O sistema entenderá que esses ${dias} dias já foram tirados no passado.`,
        onConfirm: async () => {
          try {
            await apiFetch(`/users/${id}/quitar-periodo`, { 
              method: "PUT", 
              body: JSON.stringify({ dias_a_quitar: dias }) 
            });
            
            toast.success("Período legado quitado com sucesso!");
            fetchData();
          } catch (err) { 
            toast.error("Falha ao comunicar com o servidor."); 
          }
        }
      });
    };

  // ==========================================
  // INDICADORES E FILTROS (GLOBAL)
  // ==========================================
  const macroVacations = metrics?.macro_vacations || [];
  const pendingRequests = macroVacations.filter((req: any) => req.status === "PENDENTE"); 
  
  const isAccountBlocked = (req: any) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = new Date(req.startDate + "T00:00:00");
    const end = new Date(req.endDate + "T23:59:59");
    return req.status === "APROVADO" && today >= start && today <= end;
  };

  const activeUsersCount = users.filter(u => u.is_active).length;
  const globalMembersOnVacationNow = macroVacations.filter((req: any) => isAccountBlocked(req)).length;
  const globalAbsenceRate = activeUsersCount > 0 ? ((globalMembersOnVacationNow / activeUsersCount) * 100).toFixed(1) : "0.0";

  const uniqueDepartments = Array.from(new Set(users.map(u => u.department))).sort();

  // NOVO: Extratores Únicos para os Filtros do CRUD
  const uniqueRoles = Array.from(new Set(users.map(u => u.role))).sort();
  const uniqueLeaders = Array.from(new Set(users.filter(u => u.manager_name !== "Diretoria").map(u => u.manager_name))).sort();

  // 🚀 NOVO: Resetar a página para 1 sempre que um filtro mudar
  useEffect(() => { setCrudPage(1); }, [crudSearch, crudDept, crudRole, crudLeader]);

  // NOVO: Motor de Filtros do CRUD
  const filteredCrudUsers = users.filter(u => {
    const matchName = u.name.toLowerCase().includes(crudSearch.toLowerCase());
    const matchDept = crudDept === "TODOS" || u.department === crudDept;
    const matchRole = crudRole === "TODOS" || u.role === crudRole;
    const matchLeader = crudLeader === "TODOS" || u.manager_name === crudLeader;
    return matchName && matchDept && matchRole && matchLeader;
  });

  // NOVO: Lógica de Paginação (10 por página)
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredCrudUsers.length / itemsPerPage) || 1;
  const paginatedUsers = filteredCrudUsers.slice((crudPage - 1) * itemsPerPage, crudPage * itemsPerPage);

const filteredReports = macroVacations.filter((req: any) => {
    const matchDept = filterDepartment === "TODOS" || req.department === filterDepartment;
    const matchStatus = filterStatus === "TODOS" || req.status === filterStatus;
    const matchAbono = filterAbono === "TODOS" || (filterAbono === "SIM" ? req.sellDays : !req.sellDays);
    const match13 = filter13 === "TODOS" || (filter13 === "SIM" ? req.advance13th : !req.advance13th);
    const blocked = isAccountBlocked(req);
    const matchEntraId = filterEntraId === "TODOS" || (filterEntraId === "BLOQUEADO" ? blocked : !blocked);
    
    // Filtro de Data
    const reqStart = new Date(req.startDate);
    const matchStartDate = !filterStartDate || reqStart >= new Date(filterStartDate);
    const matchEndDate = !filterEndDate || reqStart <= new Date(filterEndDate);

    return matchDept && matchStatus && matchAbono && match13 && matchEntraId && matchStartDate && matchEndDate;
  });

  const filteredUsersReport = users.filter(u => {
    if (!u.is_active) return false;
    const matchDept = filterDepartment === "TODOS" || u.department === filterDepartment;
    const hasFatigue = u.available_days >= 30;
    const matchFadiga = filterFadiga === "TODOS" || (filterFadiga === "COM_FADIGA" ? hasFatigue : !hasFatigue);
    return matchDept && matchFadiga;
  });

  const handleExportCSV = () => {
    if (reportType === "solicitacoes") {
      if (filteredReports.length === 0) return alert("Não há dados filtrados para exportar.");
      const headers = ["Colaborador,Departamento,Data_Inicio,Data_Fim,Dias,Abono,Adiantou_13,Status_Férias,Status_Entra_ID,Auditoria_DataHora"];
      const rows = filteredReports.map((v: any) => `"${v.employeeName}","${v.department}",${v.startDate},${v.endDate},${v.days},${v.sellDays ? 'Sim' : 'Nao'},${v.advance13th ? 'Sim' : 'Nao'},${v.status},"${isAccountBlocked(v) ? 'BLOQUEADO (Compliance)' : 'ATIVO'}","${new Date().toLocaleString()}"`);
      const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `extrato_ferias_global_${new Date().toISOString().split('T')[0]}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else {
      if (filteredUsersReport.length === 0) return alert("Não há dados filtrados para exportar.");
      const headers = ["Colaborador,Departamento,Cargo,Dias_Disponiveis,Alerta_Fadiga"];
      const rows = filteredUsersReport.map(u => `"${u.name}","${u.department}","${u.role}",${u.available_days},${u.available_days >= 30 ? 'Sim' : 'Nao'}`);
      const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `auditoria_saldos_fadiga_${new Date().toISOString().split('T')[0]}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
  };
  
  const handleExportAudit = async () => {
      const toastId = toast.loading("Gerando relatório de auditoria...");
      const email = session?.user?.email;

      try {
        // 🚀 PADRONIZAÇÃO: BaseUrl limpa (sem /api no final)
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        
        // Chamada da Auditoria (Adicionando /api explicitamente no caminho)
        const res = await fetch(`${baseUrl}/api/users/audit/export-csv`);
        
        if (!res.ok) throw new Error(`Falha no servidor: ${res.status}`);

        // 🚀 Chamada de Notificações (Sincronizada com o mesmo padrão)
        if (email) {
          await fetch(`${baseUrl}/api/notifications?email=${email}&context=rh`, {
            method: "GET"
          });
        }

        // 🥷 O JUTSU DO DOWNLOAD (Mantendo sua lógica original de Blob)
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = url;
        link.download = `Auditoria_Microsoft_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url); // Limpa a memória
        
        toast.success("CSV S-Rank baixado com sucesso!", { id: toastId });

      } catch (err: any) {
        console.error("🚨 Erro na exportação:", err);
        toast.error(`Erro ao exportar: ${err.message}`, { id: toastId });
      } finally {
        // Garante que o loading do toast feche mesmo se der erro
        toast.dismiss(toastId);
      }
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
    return macroVacations.filter((v: any) => {
      const start = new Date(v.startDate); const end = new Date(v.endDate);
      return dayDate >= start && dayDate <= end;
    });
  };

// Renderiza o CompanySelector de forma oculta durante o loading.
  // Isso garante que ele monte, busque a empresa e libere o fetchData da API.
  if (status === "loading" || !metrics) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FBFBFD]">
        <div className="hidden">
          {session?.user?.email && <CompanySelector userEmail={session.user.email} />}
        </div>
        <p className="animate-pulse">Carregando Módulo RH...</p>
      </div>
    );
  }

    return (
      <main className="min-h-screen bg-[#FBFBFD] p-4 md:p-8">
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">FabricHR</h1>
            <p className="text-sm font-medium text-purple-600 tracking-wide uppercase mt-1">
              Módulo Administração (RH)
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            
            {/* Seletor visível após o carregamento */}
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
                  <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded-full">{unreadCount} Não lidos</span>
                </div>
                <div className="p-2 overflow-y-auto custom-scrollbar flex-1">
                  {notifications.length === 0 ? <p className="text-sm text-gray-500 p-6 text-center">Nenhuma notificação no radar.</p> : (
                    <div className="flex flex-col gap-2">
                      {notifications.map((n: any, idx) => {
                        const isRead = readAlerts.includes(n.title + n.message);
                        
                        const baseColor = n.type === 'danger' ? 'bg-red-50 border-red-100 text-red-800' : 
                                          n.type === 'warning' ? 'bg-orange-50 border-orange-100 text-orange-800' : 
                                          n.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' : 
                                          'bg-blue-50 border-blue-100 text-blue-800';

                        return (
                          <div 
                            key={idx} 
                            onMouseEnter={() => markAsRead(n)}
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

          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
            <div className="flex items-center gap-2 pl-1">
              <Button variant="outline" size="sm" onClick={() => router.push('/')} className="text-gray-600 border-gray-200 hover:bg-gray-50 rounded-xl whitespace-nowrap"><Home size={16} className="mr-2 text-gray-500" /> Meu Portal</Button>
              {currentUser?.is_manager && <Button variant="outline" size="sm" onClick={() => router.push('/gestor')} className="text-gray-600 border-gray-200 hover:bg-gray-50 rounded-xl whitespace-nowrap"><Crown size={16} className="mr-2 text-blue-600" /> Área do Gestor</Button>}
            </div>
            <div className="flex items-center gap-4 border-l border-gray-100 pl-3">
              <div className="text-right"><p className="text-sm font-bold text-gray-900 whitespace-nowrap">{session?.user?.name}</p><p className="text-xs text-gray-500 tracking-wide">Business Partner</p></div>
              <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: '/' })} className="text-red-500 hover:bg-red-50 rounded-xl shrink-0"><LogOut size={20} /></Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex gap-6 mb-8 border-b overflow-x-auto">
        <button onClick={() => setActiveTab("pendentes")} className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === "pendentes" ? "text-purple-600 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-700"}`}><Clock size={18}/> Aprovações {pendingRequests.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] py-0.5 px-2 rounded-full">{pendingRequests.length}</span>}</button>
        <button onClick={() => setActiveTab("colaboradores")} className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === "colaboradores" ? "text-purple-600 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-700"}`}><Users size={18}/> Colaboradores (CRUD)</button>
        <button onClick={() => setActiveTab("dashboard")} className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === "dashboard" ? "text-purple-600 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-700"}`}><BarChart3 size={18}/> Dashboard & Pilares</button>
        <button onClick={() => setActiveTab("relatorios")} className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === "relatorios" ? "text-purple-600 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-700"}`}><FileText size={18}/> Analytics & Extratos</button>
      </div>

      {activeTab === "pendentes" && (
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex justify-between items-center mb-6">
            <div><h2 className="text-xl font-bold">Caixa de Entrada Global</h2><p className="text-sm text-gray-500">Avalie e aprove solicitações de toda a empresa</p></div>
          </div>
          
          {pendingRequests.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-3xl border border-gray-100"><Check className="mx-auto text-green-500 mb-4" size={32} /><h3 className="text-lg font-medium">Caixa limpa! Nenhuma pendência na empresa.</h3></div>
          ) : (
            pendingRequests.map((req: any) => (
              <Card key={req.id} className="rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between p-4 md:p-6 bg-white gap-6">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="bg-purple-100 p-3 rounded-full shrink-0"><Clock className="text-purple-600" size={24} /></div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold truncate">{req.employeeName}</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold truncate mt-0.5">{req.department}</p>
                    <div className="flex gap-2 mt-2">
                      {req.sellDays && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Abono 10d</span>}
                      {req.advance13th && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Adiantou 13º</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-6 shrink-0">
                  <div className="text-center md:text-left"><p className="text-sm text-gray-500">Período</p><p className="font-semibold whitespace-nowrap">{req.startDate.split('-').reverse().join('/')} a {req.endDate.split('-').reverse().join('/')}</p><p className="text-xs text-gray-400">{req.days} dias</p></div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="border-red-200 text-red-600 rounded-xl" onClick={() => openRejectModal(req.id)}><X className="mr-2" size={16} /> Reprovar</Button>
                    <Button className="bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-sm" onClick={() => handleApprove(req.id)}><Check className="mr-2" size={16} /> Aprovar</Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
        

{activeTab === "colaboradores" && (
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold">Gestão de Equipe Global</h2>
              <p className="text-sm text-gray-500">Total na empresa: {users.length} colaboradores</p>
            </div>
            <Button onClick={openCreateModal} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl"><Plus size={18} className="mr-2"/> Novo Colaborador</Button>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border overflow-hidden mb-8">
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[200px] relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Buscar por nome..." value={crudSearch} onChange={e => setCrudSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <select value={crudDept} onChange={e => setCrudDept(e.target.value)} className="p-2 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[150px]"><option value="TODOS">Setores (Todos)</option>{uniqueDepartments.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <select value={crudRole} onChange={e => setCrudRole(e.target.value)} className="p-2 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[150px]"><option value="TODOS">Cargos (Todos)</option>{uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}</select>
              <select value={crudLeader} onChange={e => setCrudLeader(e.target.value)} className="p-2 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[150px]"><option value="TODOS">Líderes (Todos)</option>{uniqueLeaders.map(l => <option key={l} value={l}>{l}</option>)}</select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold border-b">
                    <th className="p-5">Nome Completo</th>
                    <th className="p-5">Hierarquia / Cargo</th>
                    <th className="p-5 text-center">Datas (Histórico)</th>
                    <th className="p-5 text-center">Férias Livres</th>
                    <th className="p-5 text-center">Status</th>
                    <th className="p-5 text-right">Ação</th>
                  </tr>
                </thead>
              <tbody>
                  {paginatedUsers.length === 0 ? (
                    <tr><td colSpan={6} className="p-12 text-center text-gray-500 font-medium">Nenhum colaborador encontrado com estes filtros.</td></tr>
                  ) : (
                    paginatedUsers.map((user: any) => (
                      <tr key={user.id} className={`border-b transition-colors hover:bg-gray-50/50 ${!user.is_active ? 'opacity-50' : ''}`}>
                        
                        {/* 1. NOME COMPLETO */}
                        <td className="p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center">{user.name.charAt(0)}</div><div><p className="font-bold text-gray-900">{user.name}</p><p className="text-xs text-gray-500">{user.email}</p></div></div></td>
                        
                        {/* 2. HIERARQUIA / CARGO */}
                        <td className="p-5"><div className="flex flex-col items-start gap-1"><span className="text-[10px] font-bold tracking-wider uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">{user.department}</span><p className="font-semibold text-gray-900">{user.role}</p><p className="text-xs text-gray-400">Líder: {user.manager_name}</p><div className="flex gap-2 mt-1">{user.is_hr && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><ShieldCheck size={10}/> RH</span>}{user.is_manager && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Crown size={10}/> Gestor</span>}</div></div></td>
                        
                        {/* 3. DATAS (HISTÓRICO) */}
                        <td className="p-5 text-center align-top">
                          <div className="flex flex-col items-center gap-1 text-xs mt-1">
                            <span className="text-gray-600 font-medium whitespace-nowrap" title="Data de Admissão">
                              📥 Início: {user.admission_date || "Não informada"}
                            </span>
                            {!user.is_active && (
                              <span className="text-red-500 font-bold whitespace-nowrap bg-red-50 px-2 py-0.5 rounded border border-red-100 mt-1" title="Data de Desligamento">
                                📤 Fim: {user.demission_date || "S/ Data"}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. FÉRIAS LIVRES (Com botão de quitação) */}
                        <td className="p-5 text-center align-top">
                          <div className="flex flex-col items-center gap-1.5 mt-1">
                            <span className="font-bold text-green-600 text-[11px] bg-green-50 px-2 py-0.5 rounded-lg w-full text-center border border-green-100 shadow-sm">
                              {user.available_days}d Total
                            </span>
                            {user.vacation_periods && user.vacation_periods.map((p: any, i: number) => (
                              // 🚀 A classe "group" permite que o botão dentro dela reaja ao hover
                              <span key={i} className="text-[9px] font-bold text-green-700 border border-green-200 bg-white px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm flex items-center justify-between w-full group transition-colors hover:bg-gray-50">
                                <span>{p.label}</span>
                                <div className="flex items-center gap-1">
                                  <span className="bg-green-100 px-1 rounded text-green-800">{p.available}d</span>
                                  
                                  {/* 🚀 BOTÃO DE QUITAÇÃO: Invisível até passar o mouse */}
                                  <button 
                                    onClick={() => handleQuitarPeriodo(user.id, user.name, p.label, p.available)} 
                                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-0.5 rounded-full hover:bg-red-50" 
                                    title="Quitar período (Marcar como já tirado no sistema antigo)"
                                  >
                                    <CheckCircle size={10} />
                                  </button>
                                </div>
                              </span>
                            ))}
                          </div>
                        </td>

      
                      {/* 5. STATUS */}
                      <td className="p-5 text-center align-middle">
                        <div className="flex flex-col items-center gap-2 mt-1">
                          
                          {/* BADGE 1: Status Interno (Sistema) */}
                          {user.is_active ? (
                            <span className="inline-flex items-center text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                              <CheckCircle size={12} className="mr-1" /> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs font-bold text-red-700 bg-red-50 px-3 py-1 rounded-full">
                              <Ban size={12} className="mr-1" /> Inativo
                            </span>
                          )}

                          {/* BADGE 2: Status Externo (Microsoft Entra ID) */}
                          {user.is_entra_blocked ? (
                            <span className="inline-flex items-center text-xs font-bold text-orange-700 bg-orange-50 px-3 py-1 rounded-full">
                              <Lock size={12} className="mr-1" /> MS Bloqueado
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                              <Cloud size={12} className="mr-1" /> MS Liberado
                            </span>
                          )}
                          
                        </div>
                      </td>
                                                          
                        {/* 6. AÇÕES */}
                        <td className="p-5 text-right">
                          <div className="flex items-center justify-end gap-3 mb-2"><button onClick={() => openEditModal(user)} className="text-gray-400 hover:text-blue-600 transition-colors flex items-center text-xs font-semibold uppercase"><Pencil size={14} className="mr-1"/> Editar</button><button onClick={() => toggleStatus(user.id)} className={`text-xs font-semibold uppercase transition-colors ${user.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'}`}>{user.is_active ? 'Desativar' : 'Ativar'}</button></div>
                          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-2"><button onClick={() => toggleEntraId(user.id, false, user.name)} className="text-[10px] font-bold uppercase tracking-wider text-orange-500 hover:text-white hover:bg-orange-500 border border-orange-200 px-2 py-1 rounded transition-all flex items-center" title="Bloquear conta na Microsoft"><CloudOff size={12} className="mr-1"/> Block MS</button><button onClick={() => toggleEntraId(user.id, true, user.name)} className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hover:text-white hover:bg-blue-500 border border-blue-200 px-2 py-1 rounded transition-all flex items-center" title="Desbloquear conta na Microsoft"><Cloud size={12} className="mr-1"/> Free MS</button></div>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINAÇÃO S-RANK */}
            {totalPages > 1 && (
              <div className="p-4 border-t flex items-center justify-between bg-gray-50/50">
                <p className="text-sm text-gray-500 font-medium">Página <span className="font-bold text-gray-900">{crudPage}</span> de {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCrudPage(p => Math.max(1, p - 1))} disabled={crudPage === 1} className="rounded-xl border-gray-200">Anterior</Button>
                  <Button variant="outline" size="sm" onClick={() => setCrudPage(p => Math.min(totalPages, p + 1))} disabled={crudPage === totalPages} className="rounded-xl border-gray-200">Próxima</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "dashboard" && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-blue-500"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><Users size={14}/> Ativos (Global)</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-3xl font-bold text-gray-900">{activeUsersCount}</div></CardContent></Card>
            <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-purple-500"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><Percent size={14}/> Desfalque Global</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-3xl font-bold text-gray-900">{globalAbsenceRate}%</div><p className="text-[10px] text-gray-400 mt-1">Colaboradores ausentes hoje</p></CardContent></Card>
            <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-indigo-500"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><Wallet size={14}/> Saldo Acumulado</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-3xl font-bold text-gray-900">{metrics?.metrics?.global_accumulated_days || 0}</div><p className="text-[10px] text-gray-400 mt-1">Passivo de dias da empresa</p></CardContent></Card>
            <Card className="rounded-2xl border-none shadow-sm border-l-4 border-l-red-500"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2"><HeartPulse size={14}/> Alerta Fadiga</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-3xl font-bold text-red-600">{metrics?.metrics?.global_fatigue_alerts || 0}</div><p className="text-[10px] text-red-400 mt-1">Urgência de descanso</p></CardContent></Card>
            <Card className="rounded-2xl border-none shadow-sm bg-gray-900 text-white"><CardHeader className="pb-1 p-4"><CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><CalendarDays size={14}/> Aprovadas</CardTitle></CardHeader><CardContent className="p-4 pt-0"><div className="text-3xl font-bold text-white">{metrics?.summary?.approved || 0}</div><p className="text-[10px] text-gray-400 mt-1">Neste ciclo</p></CardContent></Card>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
            <div className="p-6 flex justify-between border-b"><div><h2 className="text-xl font-semibold">Mapa Mensal (Sazonalidade)</h2><p className="text-sm text-gray-500">Visão global e cruzamento de ausências da empresa inteira</p></div><div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={handlePrevMonth} className="rounded-full"><ChevronLeft size={16}/></Button><span className="font-bold w-32 text-center">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span><Button variant="outline" size="icon" onClick={handleNextMonth} className="rounded-full"><ChevronRight size={16}/></Button></div></div>
            <div className="p-6"><div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl border">{weekdayNames.map(name => <div key={name} className="p-3 bg-gray-50 text-center text-xs font-bold text-gray-500 uppercase">{name}</div>)}{Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="bg-white h-28"></div>)}{calendarDays.map(day => (<div key={day} className="bg-white p-2 h-28 border flex flex-col"><span className="text-xs font-bold text-gray-400 mb-1">{day}</span><div className="space-y-1 mt-1 overflow-y-auto custom-scrollbar h-[72px]">{getVacationsForDay(day).map((v: any, i: number) => (<div key={i} className={`text-[9px] font-bold p-1 rounded truncate ${v.status === 'APROVADO' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700 border border-orange-200 border-dashed'}`} title={`${v.employeeName} (${v.department} - ${v.days}d)`}>{v.employeeName}</div>))}</div></div>))}</div></div>
          </div>
        </div>
      )}

      {activeTab === "relatorios" && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 bg-white border-b border-gray-100 flex gap-4">
            <Button onClick={() => setReportType("solicitacoes")} variant={reportType === "solicitacoes" ? "default" : "outline"} className={`rounded-xl ${reportType === "solicitacoes" ? "bg-purple-600 text-white hover:bg-purple-700" : "text-gray-600"}`}>Histórico de Solicitações</Button>
            <Button onClick={() => setReportType("saldos")} variant={reportType === "saldos" ? "default" : "outline"} className={`rounded-xl ${reportType === "saldos" ? "bg-purple-600 text-white hover:bg-purple-700" : "text-gray-600"}`}><HeartPulse size={16} className="mr-2"/> Auditoria de Saldos e Fadiga</Button>
          </div>

          <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex flex-col xl:flex-row items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              <div className="flex items-center gap-2 mr-2"><Filter size={16} className="text-gray-400"/><span className="text-sm font-semibold">Filtros Globais:</span></div>
              <div className="flex items-center gap-2">
                <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-purple-500" title="Data Inicial" />
                <span className="text-gray-400">até</span>
                <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-purple-500" title="Data Final" />
              </div>
              <select value={filterDepartment} onChange={e=>setFilterDepartment(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-purple-500"><option value="TODOS">Todos os Setores</option>{uniqueDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}</select>
              {reportType === "solicitacoes" && (
                <>
                  <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-purple-500"><option value="TODOS">Todos os Status</option><option value="APROVADO">Aprovados</option><option value="PENDENTE">Pendentes</option><option value="REPROVADO">Reprovados</option></select>
                  <select value={filterEntraId} onChange={e=>setFilterEntraId(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-purple-500"><option value="TODOS">Entra ID (Todos)</option><option value="BLOQUEADO">Conta Bloqueada</option><option value="ATIVO">Conta Ativa</option></select>
                  <select value={filterAbono} onChange={e=>setFilterAbono(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-purple-500"><option value="TODOS">Abono Pecuniário</option><option value="SIM">Vendeu 10 Dias</option><option value="NAO">Não Vendeu</option></select>
                </>
              )}
              {reportType === "saldos" && (
                <select value={filterFadiga} onChange={e=>setFilterFadiga(e.target.value)} className="p-2 text-sm border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-purple-500"><option value="TODOS">Risco de Fadiga (Todos)</option><option value="COM_FADIGA">Atenção (≥ 30 dias)</option><option value="SEM_FADIGA">No Prazo</option></select>
              )}
            </div>
            <Button onClick={handleExportCSV} className="bg-purple-600 text-white rounded-xl shadow-sm shrink-0 hover:bg-purple-700"><Download className="mr-2" size={16}/> Exportar {reportType === "solicitacoes" ? "Férias" : "Saldos"} (CSV)</Button>
            <Button onClick={handleExportAudit} className="bg-blue-600 text-white rounded-xl shadow-sm shrink-0 hover:bg-blue-700"><Download className="mr-2" size={16}/> Exportar Auditoria Entra ID (CSV)</Button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              {reportType === "solicitacoes" ? (
                <>
                  <thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500 tracking-wide"><th className="p-4">Colaborador / Setor</th><th className="p-4">Período de Descanso</th><th className="p-4 text-center">Dias / Vantagens</th><th className="p-4 text-center">Entra ID (Cloud)</th><th className="p-4 text-right">Status</th></tr></thead>
                  <tbody>
                    {filteredReports.length === 0 ? (
                      <tr><td colSpan={5} className="p-12 text-center text-gray-500">Nenhum resultado na base de dados para estes filtros.</td></tr>
                    ) : (
                      filteredReports.map((req: any) => (
                        <tr key={req.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="p-4 font-bold text-gray-900">{req.employeeName}<p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mt-0.5">{req.department}</p></td>
                          <td className="p-4 text-gray-700">{req.startDate.split('-').reverse().join('/')} a {req.endDate.split('-').reverse().join('/')}</td>
                          <td className="p-4 text-center"><div className="font-bold text-gray-900">{req.days} dias</div><div className="flex gap-1 justify-center mt-1">{req.sellDays && <span className="text-[9px] font-bold tracking-wide uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Abono</span>}{req.advance13th && <span className="text-[9px] font-bold tracking-wide uppercase bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">13º</span>}</div></td>
                          {/* <td> da coluna ENTRA ID (CLOUD) */}
                          <td className="p-4 text-center align-middle">
                            {isAccountBlocked(req) ? (
                              <span className="inline-flex items-center text-xs font-bold text-orange-700 bg-orange-50 px-3 py-1 rounded-full border border-orange-200 shadow-sm">
                                <Lock size={12} className="mr-1" /> Bloqueado
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 shadow-sm">
                                <Cloud size={12} className="mr-1" /> Liberado
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-right">{req.status === "APROVADO" && <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-100 px-3 py-1 rounded-full shadow-sm">Aprovado</span>}{req.status === "PENDENTE" && <span className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full shadow-sm">Em Análise</span>}{req.status === "REPROVADO" && <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 px-3 py-1 rounded-full shadow-sm">Reprovado</span>}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </>
              ) : (
                <>
                  <thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500 tracking-wide"><th className="p-4">Colaborador</th><th className="p-4">Cargo / Setor</th><th className="p-4 text-center">Dias Acumulados</th><th className="p-4 text-right">Análise de Risco (Fadiga)</th></tr></thead>
                  <tbody>
                    {filteredUsersReport.length === 0 ? (
                      <tr><td colSpan={4} className="p-12 text-center text-gray-500">Nenhum colaborador encontrado com estes filtros.</td></tr>
                    ) : (
                      filteredUsersReport.map((u: any) => (
                        <tr key={u.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="p-4 font-bold text-gray-900">{u.name}<p className="text-xs font-normal text-gray-500 mt-0.5">{u.email}</p></td>
                          <td className="p-4 text-gray-700">{u.role}<p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mt-0.5">{u.department}</p></td>
                          <td className="p-4 text-center"><div className="text-lg font-bold text-gray-900">{u.available_days}</div></td>
                          <td className="p-4 text-right">{u.available_days >= 30 ? <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 px-3 py-1.5 rounded-full border border-red-200 shadow-sm"><HeartPulse size={12} className="mr-1"/> Atenção (30+ Dias)</span> : <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200"><CheckCircle size={12} className="mr-1"/> Prazo Seguro</span>}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
      )}

      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center gap-3 mb-4"><div className="bg-red-100 p-3 rounded-full"><MessageSquare className="text-red-600" size={20} /></div><h2 className="text-xl font-bold text-gray-900">Justificar Recusa (RH)</h2></div>
            <p className="text-sm text-gray-500 mb-6">O colaborador receberá esta justificativa automaticamente no portal dele.</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: Período conflitante com o fechamento da folha..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] resize-none mb-6 text-sm" />
            <div className="flex gap-3"><Button variant="outline" onClick={() => setIsRejectModalOpen(false)} className="flex-1 rounded-xl border-gray-200 text-gray-600">Cancelar</Button><Button onClick={confirmReject} className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-xl shadow-sm">Registrar Recusa</Button></div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b flex justify-between items-center"><h2 className="text-xl font-bold text-gray-900">{editingUserId ? "Editar Colaborador" : "Novo Colaborador"}</h2><button onClick={() => setIsModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button></div>
            <form onSubmit={handleSaveUser} className="p-6 overflow-y-auto flex-1 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2"><label className="text-sm font-semibold">Nome Completo</label><input type="text" required value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} className="w-full px-4 py-3 rounded-xl border bg-gray-50/50" /></div>
                <div className="space-y-2"><label className="text-sm font-semibold">E-mail {editingUserId && "(Acesso Microsoft)"}</label><input type="email" required disabled={!!editingUserId} value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className={`w-full px-4 py-3 rounded-xl border ${editingUserId ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-gray-50/50'}`} /></div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Departamento</label>
                  <select required value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} className="w-full px-4 py-3 rounded-xl border bg-gray-50/50 outline-none">
                    <option value="" disabled>Selecione um setor...</option><option value="Recursos Humanos">Recursos Humanos</option><option value="Tecnologia">Tecnologia</option><option value="Administrativo/Financeiro">Administrativo/Financeiro</option><option value="Comercial">Comercial</option><option value="Comunicação e Marketing">Comunicação e Marketing</option><option value="Operações">Operações</option><option value="Contabilidade">Contabilidade</option><option value="Diretoria">Diretoria</option><option value="Jurídico">Jurídico</option><option value="Novos Negócios">Novos Negócios</option><option value="Relacionamento">Relacionamento</option><option value="Controladoria">Controladoria</option>
                  </select>
                </div>
                <div className="space-y-2"><label className="text-sm font-semibold">Cargo</label><input type="text" required value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-3 rounded-xl border bg-gray-50/50" /></div>
                <div className="space-y-2"><label className="text-sm font-semibold">Líder Direto (Gestor)</label>
                  <select value={formData.manager_id} onChange={(e) => setFormData({...formData, manager_id: e.target.value})} className="w-full px-4 py-3 rounded-xl border bg-gray-50/50 outline-none">
                    <option value="">Sem líder (Diretoria)</option>{users.filter(u => u.is_manager && u.id !== editingUserId).map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
                  </select>
                </div>
                {!editingUserId && (<div className="space-y-2"><label className="text-sm font-semibold">Data de Admissão</label><input type="date" required value={formData.admission_date} onChange={(e) => setFormData({...formData, admission_date: e.target.value})} className="w-full px-4 py-3 rounded-xl border bg-gray-50/50" /></div>)}
              </div>
              <div className="p-4 rounded-2xl border bg-gray-50/50 mt-4"><h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Controle de Acessos</h3><div className="flex gap-8"><div className="flex items-center gap-3"><button type="button" onClick={() => setFormData({...formData, is_manager: !formData.is_manager})} className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_manager ? 'bg-blue-600' : 'bg-gray-300'}`}><span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform ${formData.is_manager ? 'translate-x-6' : ''}`}></span></button><div><p className="font-semibold text-sm">É Gestor?</p><p className="text-[10px] text-gray-500">Pode aprovar férias</p></div></div><div className="flex items-center gap-3"><button type="button" onClick={() => setFormData({...formData, is_hr: !formData.is_hr})} className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_hr ? 'bg-purple-600' : 'bg-gray-300'}`}><span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform ${formData.is_hr ? 'translate-x-6' : ''}`}></span></button><div><p className="font-semibold text-sm">Acesso RH?</p><p className="text-[10px] text-gray-500">Acesso a este painel</p></div></div></div></div>
              <div className="pt-4 border-t flex justify-end gap-3 mt-4"><Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-xl">Cancelar</Button><Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-8">Salvar Dados</Button></div>
            </form>
          </div>
        </div>
      )}
      {/* 🚀 COMPONENTE BASE PARA RENDERIZAR OS TOASTS (NOTIFICAÇÕES FLUTUANTES) */}
      <Toaster position="top-right" reverseOrder={false} />

      {/* 🚀 MODAL GENÉRICO DE CONFIRMAÇÃO (Substitui o window.confirm) */}
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
                Confirmar Ação
              </Button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
