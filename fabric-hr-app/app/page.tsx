"use client";

import { useState, useEffect } from "react";
import { useSession, signOut, signIn } from "next-auth/react";
import { useRouter } from "next/navigation"; 
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, LogOut, Palmtree, Clock, FileText, Info, X, UserX, Check, AlertCircle, Lock, ShieldCheck, ServerCrash, Crown, Users, AlertTriangle, ShieldAlert } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const MASTER_ADMIN = process.env.NEXT_PUBLIC_MASTER_ADMIN;

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter(); 
  
  const [userData, setUserData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isBackendOffline, setIsBackendOffline] = useState(false); 
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [vacationDays, setVacationDays] = useState<number | "">("");
  const [sellDays, setSellDays] = useState(false);
  const [advance13th, setAdvance13th] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justificationModal, setJustificationModal] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false, title: "", message: "", onConfirm: () => {}
  });



const fetchData = async () => {
  if (status === "unauthenticated") {
    setIsLoadingData(false);
    return;
  }

  if (status === "authenticated" && session?.user?.email) {
    try {
      const email = session.user.email;
      
      // Pega a URL da Vercel (Produção) ou do .env local (Dev)
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      
      const response = await fetch(`${baseUrl}/api/vacation/balance?email=${email}`);
      
if (response.status === 404) {
  if (email === MASTER_ADMIN) {
    // Se for Admin e não estiver no banco, a gente "finge" um usuário básico 
    // só pra ele não travar e poder navegar.
        setUserData({
          full_name: "Master Admin",
          role: "ADMIN",
          is_hr: true,
          is_manager: true
        });
        setIsLoadingData(false);
        // NÃO USE router.replace("/rh") AQUI! Deixa ele na Home.
        return;
      }
        setUserData(null);
        setIsLoadingData(false);
        return;
      }

      if (!response.ok) throw new Error("Erro na API Python");

      const balanceData = await response.json();
      setUserData(balanceData);
      
      // 🚀 Segunda chamada usando a mesma Base URL
      const hRes = await fetch(`${baseUrl}/api/vacation/history?email=${email}`);
      if (hRes.ok) setHistory(await hRes.json());
      
    } catch (err: any) {
      console.error("Erro de conexão:", err);
      if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
        setIsBackendOffline(true);
      }
    } finally {
      setIsLoadingData(false);
    }
  }
};

  useEffect(() => {
    fetchData();
  }, [status, session]);

  // ==========================================
  // 🛡️ TRAVAS DA CLT (Validação Front-end)
  // ==========================================
// 1. 🚀 SEPARAMOS O MOTOR DE ENVIO (Para o Modal conseguir chamar depois)
  const executeSubmission = async () => {
    setIsSubmitting(true);
    const toastId = toast.loading("Enviando solicitação para o gestor...");
    const payload = { email: session?.user?.email, startDate, days: vacationDays, sellDays, advance13th };
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    try {
      
      const res = await fetch(`${baseUrl}/api/vacation/request`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Falha ao gravar no banco");
      
      toast.success("Sucesso S-Rank! Solicitação enviada.", { id: toastId });
      setIsModalOpen(false); 
      setStartDate(""); 
      setVacationDays(""); 
      setSellDays(false); 
      setAdvance13th(false);
      fetchData(); 
    } catch (error: any) { 
      toast.error(`Erro crítico: ${error.message}`, { id: toastId }); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  // 2. 🚀 O SEU HANDLESUBMIT BLINDADO (Com Toasts e Modal)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const startD = new Date(startDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Validação 1: Sexta, Sábado ou Domingo
    const dayOfWeek = startD.getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
      toast.error("🚨 Regra CLT: É proibido iniciar as férias na Sexta, Sábado ou Domingo.");
      return;
    }

    // Validação 2: Mínimo de 5 dias
    const daysRequested = Number(vacationDays);
    if (daysRequested < 5) {
      toast.error("🚨 Regra CLT: Nenhum período pode ser inferior a 5 dias.");
      return;
    }

    // Validação 3: Regra dos 14 dias contínuos
    // Obs: Confirme se o history mapeia corretamente na sua tela
    const has14DaysPeriod = history.some((req: any) => req.days >= 14 && req.status === "APROVADO");
    const remainingDays = userData.available_days - daysRequested;
    
    if (daysRequested < 14 && !has14DaysPeriod && remainingDays < 14) {
      toast.error("🚨 Regra CLT: Você deve ter pelo menos um período contínuo de 14 dias de férias.");
      return;
    }
    
    // Validação 3.5: Convenção Coletiva TI - Trava do 13º Salário
    // getMonth() retorna 0 para Janeiro e 6 para Julho. Se for > 6, barra.
    if (advance13th && startD.getMonth() > 6) {
      toast.error("🚨 Regra Sindical (TI): O adiantamento do 13º só é permitido para férias que iniciam até o mês de Julho.");
      return; // Corta o fluxo aqui!
    }

    // Validação 4: Antecedência de 60 dias (Abre o Modal S-Rank!)
    const diffTime = startD.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 60) {
      setConfirmDialog({
        isOpen: true,
        title: "Aviso de Prazo (CLT)",
        message: "O pedido tem menos de 60 dias de antecedência. Deseja forçar o envio para aprovação excepcional do gestor?",
        onConfirm: () => {
          executeSubmission(); // Se o cara der OK no modal, dispara a função!
        }
      });
      return; // Para o código aqui, o modal assume o controle.
    }

    // Se passou liso por todas as regras e tem +60 dias, dispara direto!
    executeSubmission();
  };

  const maxDaysAllowed = sellDays ? (userData?.available_days - 10) : userData?.available_days;

  if (status === "loading") return <div className="flex h-screen items-center justify-center bg-[#FBFBFD]"><p className="animate-pulse text-gray-500 font-medium">Verificando credenciais...</p></div>;

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex bg-white font-sans">
        <div className="hidden lg:flex w-1/2 bg-[#1D1D1F] text-white p-12 flex-col justify-between relative overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full blur-[150px] opacity-20 pointer-events-none"></div>
          <div className="relative z-10"><div className="flex items-center gap-3 mb-2"><ShieldCheck className="text-blue-500" size={32} /><h1 className="text-4xl font-bold tracking-tight">FabricHR</h1></div><p className="text-gray-400 text-lg font-medium">Enterprise Management System</p></div>
          <div className="relative z-10 mb-8"><p className="text-2xl font-medium leading-relaxed italic text-gray-300">"O verdadeiro poder de uma organização está nas pessoas. Dados se transformam em decisões táticas."</p></div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#FBFBFD]">
          <div className="max-w-md w-full space-y-10">
            <div className="text-center"><h2 className="text-3xl font-bold text-gray-900 tracking-tight">Bem-vindo ao Portal</h2><p className="mt-3 text-gray-500 font-medium">Faça login com sua conta corporativa para acessar o ecossistema.</p></div>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <Button onClick={() => signIn("azure-ad", { callbackUrl: window.location.origin })} className="w-full py-6 text-lg bg-[#007AFF] hover:bg-[#0063CC] text-white rounded-2xl shadow-md transition-all hover:scale-[1.02]"><Lock className="mr-3" size={20} /> Entrar com Microsoft Azure</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingData) return <div className="flex h-screen items-center justify-center bg-[#FBFBFD] flex-col gap-4"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p className="animate-pulse text-gray-500 font-medium">Autenticando Permissões...</p></div>;

  if (isBackendOffline) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FBFBFD] p-4">
        <div className="text-center p-8 bg-white rounded-3xl shadow-lg border border-gray-100 max-w-md w-full"><div className="bg-orange-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><ServerCrash className="text-orange-500" size={32} /></div><h2 className="text-2xl font-bold mb-2">Servidor Offline</h2><p className="text-sm text-gray-500 mb-8">A API Python não está respondendo. Verifique se o <strong className="text-gray-700">uvicorn</strong> está rodando.</p><Button onClick={() => window.location.reload()} className="w-full bg-blue-600 rounded-xl py-6">Tentar Novamente</Button></div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FBFBFD] p-4">
        <div className="text-center p-8 bg-white rounded-3xl shadow-lg border border-gray-100 max-w-md w-full"><div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><UserX className="text-red-500" size={32} /></div><h2 className="text-2xl font-bold mb-2">Usuário não cadastrado</h2><p className="text-sm text-gray-500 mb-8">O e-mail <strong className="text-gray-700">{session?.user?.email}</strong> não consta no banco de dados. Solicite ao RH que seja efetuado o registro.</p><div className="flex flex-col gap-3"><Button onClick={() => signOut({ callbackUrl: '/' })} variant="outline" className="w-full rounded-xl py-6">Sair e Tentar Outra Conta</Button></div></div>
      </div>
    );
  }

  return (
      <main className="min-h-screen bg-[#FBFBFD] p-4 md:p-8 relative">
        <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div><h1 className="text-2xl font-bold text-[#1D1D1F]">FabricHR</h1><p className="text-sm text-gray-500">Portal do Colaborador</p></div>
          
          {/* CABEÇALHO VIP: Renderiza botões integrados na mesma pílula (Padrão S-Rank) */}
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
            
            {(userData?.is_manager || userData?.is_hr) && (
              <div className="flex items-center gap-2 pl-1">
                {userData?.is_manager && (
                  <Button variant="outline" size="sm" onClick={() => router.push('/gestor')} className="text-gray-600 border-gray-200 hover:bg-gray-50 rounded-xl whitespace-nowrap">
                    <Crown className="mr-2 text-blue-600" size={16} /> Área do Gestor
                  </Button>
                )}
                {userData?.is_hr && (
                  <Button variant="outline" size="sm" onClick={() => router.push('/rh')} className="text-gray-600 border-gray-200 hover:bg-gray-50 rounded-xl whitespace-nowrap">
                    <Users className="mr-2 text-purple-600" size={16} /> Administração RH
                  </Button>
                )}
              </div>
            )}

            {/* O separador visual '|' só aparece se o usuário for Gestor ou RH */}
            <div className={`flex items-center gap-4 ${userData?.is_manager || userData?.is_hr ? 'border-l border-gray-100 pl-3' : 'pl-2'}`}>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{userData?.name}</p>
                <p className="text-xs text-gray-400 truncate max-w-[150px] sm:max-w-none">{session?.user?.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: '/' })} className="text-red-500 hover:bg-red-50 rounded-xl shrink-0"><LogOut size={20} /></Button>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="rounded-3xl border-none shadow-sm"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-gray-500">Saldo Disponível</CardTitle><Palmtree className="text-green-500" size={20} /></CardHeader><CardContent><div className="text-4xl font-bold text-gray-900">{userData?.available_days ?? "--"} dias</div></CardContent></Card>
          <Card className="rounded-3xl border-none shadow-sm"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-gray-500">Dias Utilizados</CardTitle><CalendarDays className="text-blue-500" size={20} /></CardHeader><CardContent><div className="text-4xl font-bold text-gray-900">{userData?.used_days ?? "--"} dias</div></CardContent></Card>
          <Card className="rounded-3xl border-none shadow-sm bg-[#1D1D1F] text-white"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-gray-300">Início do Ciclo</CardTitle><Clock className="text-orange-400" size={20} /></CardHeader><CardContent><div className="text-lg font-semibold">{userData?.period_start ?? "N/A"}</div><p className="text-xs text-gray-400 mt-1">Data base de cálculo</p></CardContent></Card>
        </div>

        <div className="max-w-6xl mx-auto mt-8">
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div><h2 className="text-xl font-semibold">Precisa descansar, {userData?.name?.split(" ")[0]}?</h2><p className="text-gray-500 text-sm mt-1">Sua solicitação será enviada direto para o seu gestor.</p></div>
            <Button onClick={() => setIsModalOpen(true)} className="bg-[#007AFF] hover:bg-[#0063CC] text-white px-8 py-6 rounded-2xl font-bold text-lg">Solicitar Férias Agora</Button>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-8 mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Meu Histórico de Solicitações</h3>
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="bg-gray-50 border-b text-xs uppercase text-gray-500"><th className="p-4">Período</th><th className="p-4 text-center">Dias de Descanso</th><th className="p-4 text-center">Vantagens Financeiras</th><th className="p-4 text-right">Status</th></tr></thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhum histórico encontrado no banco.</td></tr>
                ) : (
                  history.map((req: any) => (
                    <tr key={req.id} className="border-b hover:bg-gray-50">
                      <td className="p-4 font-bold text-gray-900">{req.startDate} a {req.endDate}</td>
                      <td className="p-4 text-center font-medium">{req.days}</td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-2">
                          {req.sellDays && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-md">Vendeu 10d</span>}
                          {req.advance13th && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md">Adiantou 13º</span>}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        {req.status === "APROVADO" && <span className="inline-flex items-center text-xs font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200"><Check size={12} className="mr-1"/> Aprovado</span>}
                        {req.status === "PENDENTE" && <span className="inline-flex items-center text-xs font-bold text-orange-700 bg-orange-50 px-3 py-1 rounded-full border border-orange-200"><Clock size={12} className="mr-1"/> Em Análise</span>}
                        {req.status === "REPROVADO" && (
                          <div className="flex items-center justify-end gap-2">
                            <span className="inline-flex items-center text-xs font-bold text-red-700 bg-red-50 px-3 py-1 rounded-full border border-red-200"><X size={12} className="mr-1"/> Recusado</span>
                            {req.justification && <button onClick={() => setJustificationModal(req.justification)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Ver Motivo"><Info size={16} /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col md:flex-row max-h-[90vh] overflow-hidden">
            
            <div className="hidden md:flex w-1/3 bg-gray-50 border-r p-8 flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <AlertTriangle className="text-orange-500" size={24} />
                  <h3 className="font-bold text-gray-900">Avisos Legais (CLT)</h3>
                </div>
                <div className="space-y-6">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-700">1. Antecedência Mínima</p>
                    <p className="text-xs text-gray-500">O pedido deve ocorrer com 60 dias de antecedência para processamento de folha.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-700">2. Proibição de Início (DSR)</p>
                    <p className="text-xs text-gray-500">É vedado o início das férias no período de dois dias que antecede feriado ou dia de repouso semanal (Não iniciar na Sex, Sáb ou Dom).</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-700">3. Regra de Fracionamento</p>
                    <p className="text-xs text-gray-500">Pode dividir em até 3 períodos. Um deles deve ter no mínimo 14 dias contínuos. Os demais não podem ser menores que 5 dias.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="px-6 py-5 border-b flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl"><FileText className="text-blue-600" size={20} /></div>
                  <h2 className="text-xl font-bold">Nova Solicitação</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-2 gap-5 mb-8">
                  <div className="space-y-2"><label className="text-sm font-semibold">Data de Início</label><input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 rounded-xl border outline-none bg-gray-50/50" /></div>
                  <div className="space-y-2"><label className="text-sm font-semibold">Qtd. Dias</label><input type="number" required min="5" max={maxDaysAllowed} value={vacationDays} onChange={(e) => setVacationDays(e.target.value === "" ? "" : Number(e.target.value))} placeholder={`Max: ${maxDaysAllowed}`} className="w-full px-4 py-3 rounded-xl border outline-none bg-gray-50/50" /></div>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-2xl border bg-gray-50/50">
                    <div><p className="font-semibold">Abono (Vender 10 dias)</p><p className="text-xs text-gray-500">{userData?.flags?.has_sold_days ? "Bloqueado neste ciclo." : "Receba 10 dias em dinheiro."}</p></div>
                    <button type="button" disabled={userData?.flags?.has_sold_days} onClick={() => { setSellDays(!sellDays); if (!sellDays && Number(vacationDays) > userData.available_days - 10) setVacationDays(userData.available_days - 10); }} className={`relative w-12 h-7 rounded-full transition-colors ${sellDays ? 'bg-blue-600' : 'bg-gray-300'}`}><span className={`absolute top-0.5 left-0.5 bg-white w-6 h-6 rounded-full transition-transform ${sellDays ? 'translate-x-5' : ''}`}></span></button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl border bg-gray-50/50">
                    <div><p className="font-semibold">Adiantar 13º</p><p className="text-xs text-gray-500">{userData?.flags?.has_advanced_13th ? "Bloqueado neste ciclo." : "Receba com as férias."}</p></div>
                    <button type="button" disabled={userData?.flags?.has_advanced_13th} onClick={() => setAdvance13th(!advance13th)} className={`relative w-12 h-7 rounded-full transition-colors ${advance13th ? 'bg-blue-600' : 'bg-gray-300'}`}><span className={`absolute top-0.5 left-0.5 bg-white w-6 h-6 rounded-full transition-transform ${advance13th ? 'translate-x-5' : ''}`}></span></button>
                  </div>
                </div>
                <div className="mt-8 flex gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-xl">Cancelar</Button>
                  <Button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white rounded-xl">Confirmar Pedido</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {justificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="mx-auto bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mb-4"><AlertCircle className="text-red-600" size={24} /></div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Motivo da Recusa</h2>
            <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100 text-left mb-6 whitespace-pre-wrap">{justificationModal}</p>
            <Button onClick={() => setJustificationModal(null)} className="w-full bg-gray-900 text-white rounded-xl">Entendido</Button>
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