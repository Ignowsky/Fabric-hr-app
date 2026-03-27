from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, date
from fastapi.responses import StreamingResponse
import io
import csv

# Imports Locais
from src.database import get_db
from src import models, schemas
from src.routers.math import MathRHService
from src.routers.microsoft_service import EntraIDService
from src.routers.email import EmailService


# Criando o "mini-app" de usuários
router = APIRouter(
    prefix = "/api/users",
    tags = ["Cadastro de Usuários"]
)

entra_service = EntraIDService()

@router.get("")
def get_all_users(db: Session = Depends(get_db)):
    """
    Endpoint para obter a lista de todos os usuários, incluindo seus saldos de férias atualizados em tempo real pelo motor de cálculo de períodos aquisitivos. 
    O endpoint retorna as seguintes informações para cada usuário:
    - id: int
    - full_name: string
    - email: string
    - role: string
    - department: string
    - admission_date: string (formato "DD/MM/YYYY")
    - demission_date: string (formato "DD/MM/YYYY", vazio se não tiver data de demissão)
    - is_active: boolean (indica se o usuário está ativo ou não)
    - is_manager: boolean (indica se o usuário é um gerente)
    - is_hr: boolean (indica se o usuário é do RH)
    - manager_name: string (nome do gerente direto, ou "Diretoria" se não tiver gerente)
    - available_days: float (quantidade total de dias de férias disponíveis, calculada em tempo real pelo motor de cálculos de períodos aquisitivos,
    já considerando os dias usados pelo funcionário, ou seja, o saldo real disponível para gozo)
    - vacation_periods: list (lista dos períodos aquisitivos com seus respectivos saldos disponíveis, 
    calculados em tempo real pelo motor de cálculos de períodos aquisitivos)
    - is_entra_blocked: boolean (indica se a conta na nuvem do usuário está bloqueada ou não, para controle visual no frontend)
    """
    
    users = db.query(models.User).order_by(models.User.full_name).all()
    resultado = []
    
    for u in users:
        manager_name = "Diretoria"
        if u.manager_id:
            mgr = db.query(models.User).filter(models.User.id == u.manager_id).first()
            if mgr: manager_name = mgr.full_name
            
        # 🚀 A FONTE DA VERDADE (Cálculo Dinâmico Corrigido)
        # 1. Puxa todas as férias aprovadas desse colaborador
        ferias_aprovadas = db.query(models.VacationRequest).filter(
            models.VacationRequest.user_id == u.id,
            models.VacationRequest.status == "APROVADO"
        ).all()

        dias_solicitados = 0
        vendas = 0
        hoje = date.today()
        em_ferias_agora = False # 🚨 Flag do Corte Imediato
        
        for req in ferias_aprovadas:
            dias_solicitados += (req.end_date - req.start_date).days + 1
            if getattr(req, "sell_days", False):
                vendas += 1
                
            # 🚨 O OLHO DO SHARINGAN: Verifica se HOJE está dentro das férias desse cara
            if req.start_date <= hoje <= req.end_date:
                em_ferias_agora = True

        dias_usados_reais = dias_solicitados + (vendas * 10)

        # ... (Cálculo do motor S-Rank do saldo continua igualzinho aqui) ...

        # ==========================================================
        # 🚀 A EXECUÇÃO DO CORTE IMEDIATO (ENTRA ID)
        # ==========================================================
        is_blocked_local = getattr(u, "is_entra_blocked", False)

        if em_ferias_agora and not is_blocked_local:
            # O cara tá na praia mas a conta tá ativa. CORTA!
            sucesso = robo_ms.update_entra_id_account(u.email, False)
            if sucesso:
                u.is_entra_blocked = True
                is_blocked_local = True # Atualiza a variável pra devolver pro Front certo
                # Grava Log S-Rank
                db.add(models.EntraAuditLog(target_user_id=u.id, action="BLOQUEIO TEMPO REAL", performed_by="SISTEMA (RH DASHBOARD)"))
                db.commit()

        elif not em_ferias_agora and is_blocked_local:
            # O cara não tá de férias (já voltou), mas a conta tá bloqueada. LIBERA!
            sucesso = robo_ms.update_entra_id_account(u.email, True)
            if sucesso:
                u.is_entra_blocked = False
                is_blocked_local = False
                db.add(models.EntraAuditLog(target_user_id=u.id, action="DESBLOQUEIO TEMPO REAL", performed_by="SISTEMA (RH DASHBOARD)"))
                db.commit()
        # ==========================================================

        # No seu resultado.append(), você passa o status atualizado:
        resultado.append({
                # ... resto dos campos ...
                "is_entra_blocked": is_blocked_local 
            })
        
    return resultado

@router.put("/{user_id}/quitar-periodo")
def quitar_periodo_aquisitivo(user_id: int, payload: schemas.QuitarPeriodoRequest, db: Session = Depends(get_db)):
    """
    Endpoint para quitar um período aquisitivo legado, ou seja, um período que o funcionário já tinha adquirido antes do sistema entrar no ar.
    O payload deve conter a quantidade de dias a quitar, e o sistema vai abater isso do período mais antigo disponível (FIFO).
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    if not user.balance:
        # Se por algum milagre o peão não tiver saldo criado ainda, a gente cria na hora
        saldo = models.VacationBalance(user_id=user.id, total_acquired_days=0, used_days=0, available_days=0)
        db.add(saldo)
        db.commit()
        db.refresh(user)

    # Soma os dias quitados no histórico de dias usados do peão.
    # Na próxima vez que o GET rodar, o motor matemático vai abater isso do período mais antigo!
    user.balance.used_days += payload.dias_a_quitar
    db.commit()
    
    return {"message": "Período legado quitado com sucesso!"}

@router.post("")
def create_new_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Endpoint para criar um novo usuário. O payload deve conter:
    - full_name: string (Obrigatório)
    - email: string (Obrigatório, único)
    - role: string (Obrigatório)
    - department: string (Obrigatório)
    - admission_date: string (Obrigatório, formato "YYYY-MM-DD")
    - is_manager: boolean (Opcional, default false)
    - manager_id: int(Opcional, ID do gerente direto, default diretoria)
    - is_hr: boolean (Opcional, default false, indica se o usuário é do rh e tem acesso as funcionalidades de administrador)
    """
    
    existe = db.query(models.User).filter(models.User.email == payload.email).first()
    if existe: raise HTTPException(status_code=400, detail="E-mail já cadastrado.")
    admissao = datetime.strptime(payload.admission_date, "%Y-%m-%d").date()
    
    novo_user = models.User(
        full_name=payload.full_name, email=payload.email, role=payload.role, department=payload.department,
        admission_date=admissao, is_active=True, is_manager=payload.is_manager, manager_id=payload.manager_id
    )
    if hasattr(novo_user, 'is_hr'):
        novo_user.is_hr = payload.is_hr

    db.add(novo_user)
    db.commit()
    db.refresh(novo_user)
    
    # 🚀 NOVO: Usuário começa com 0 dias, o cálculo em tempo real que vai dar os dias pra ele
    novo_saldo = models.VacationBalance(user_id=novo_user.id, total_acquired_days=0, used_days=0, available_days=0)
    db.add(novo_saldo)
    db.commit()
    return {"message": "Sucesso"}

@router.put("/{user_id}")
def update_user(user_id: int, payload: schemas.UserUpdate, db: Session = Depends(get_db)):
    """
    Endpoint para atualizar informações de um usuário existente. O payload pode conter:
    - full_name: string (Opcional)
    - role: string (Opcional)
    - department: string (Opcional)
    - is_manager: boolean (Opcional)
    - manager_id: int (Opcional)
    - is_hr: boolean (Opcional, indica se o usuário é do rh e tem acesso as funcionalidades de administrador)
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    user.full_name = payload.full_name
    user.role = payload.role
    user.department = payload.department
    user.is_manager = payload.is_manager
    user.is_hr = payload.is_hr 
    user.manager_id = payload.manager_id
    
    db.commit()
    return {"message": "Cadastro atualizado com sucesso!"}

@router.put("/{user_id}/toggle-status")
def toggle_user_status(user_id: int, db: Session = Depends(get_db)):
    """
    Endpoint para ativar ou desativar um usuário. Se o usuário for desativado, a data de demissão será preenchida com a data de desativação. Se for reativado,
    a data de demissão será limpa. O status é alternado a cada chamado, ou seja se o usuário estiver ativo, ele será desativado, e vice-versa.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    user.is_active = not user.is_active
    
    # CORREÇÃO: Usando a coluna correta do Postgres (demission_date)
    if not user.is_active:
        user.demission_date = date.today()
    else:
        user.demission_date = None

    db.commit()
    return {"message": "Status alterado com sucesso"}

@router.put("/{user_id}/entra")
def toggle_user_entra_status(user_id: int, payload: schemas.EntraToggleRequest, db: Session = Depends(get_db)):
    """
    Endpoint para ativar ou desativar a conta na nuvem do usuário (Entra ID).
    """
    # 🚀 1. O Jutsu de Invocação: Traz o peão do banco de dados pra memória!
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")

    # 🚀 2. Chama o serviço da nuvem (Microsoft) UMA ÚNICA VEZ
    sucesso = entra_service.toggle_entra_status(user_id=user_id, payload=payload, db=db)
    
    if sucesso:
        # 3. Atualiza a Sombra Local (O frontend vai ler daqui para a TAG vermelha/verde)
        user.is_entra_blocked = not payload.enable 
        
        # 4. Grava o Log de Auditoria imutável
        novo_log = models.EntraAuditLog(
            target_user_id=user.id, # Agora o user.id existe e tá mapeado!
            action="DESBLOQUEIO" if payload.enable else "BLOQUEIO",
            performed_by="Sistema / RH" # Ajuste para pegar do usuário logado se quiser depois
        )
        db.add(novo_log)
        db.commit()
        
        # 5. Retorno limpo e S-Rank
        status_msg = "desbloqueada" if payload.enable else "bloqueada"
        return {"message": f"Conta na nuvem {status_msg} com sucesso!"}
        
    # Se bater aqui, é porque a Graph API negou o fogo
    raise HTTPException(status_code=500, detail="Falha ao realizar a operação na nuvem.")

@router.get("/audit/export-csv")
def export_entra_audit_csv(db: Session = Depends(get_db)):
    """
    Endpoint para exportar os logs de auditoria do Entra ID em formato CSV. O CSV inclui:
    - ID do log
    - Ação (Bloqueio ou Desbloqueio)
    - Nome do colaborador afetado
    - E-mail do colaborador afetado
    - Quem executou a ação
    - Data e hora da ação (formato "DD/MM/YYYY HH:MM:SS")
    O endpoint retorna um arquivo CSV para download, com o nome "auditoria_entra_id.csv".
    """
    # 1. Busca os logs fazendo um JOIN com a tabela de Users pra pegar nome e email
    logs = db.query(models.EntraAuditLog, models.User).join(
        models.User, models.EntraAuditLog.target_user_id == models.User.id
    ).order_by(models.EntraAuditLog.created_at.desc()).all()

    # 2. Prepara a memória RAM pra montar o CSV
    output = io.StringIO()
    # Usamos o delimitador ';' porque o Excel no Brasil ama dar pau com vírgula
    writer = csv.writer(output, delimiter=';') 

    # 3. Escreve o Cabeçalho
    writer.writerow(["ID do Log", "Ação", "Colaborador Afetado", "E-mail do Colaborador", "Executado Por", "Data e Hora"])

    # 4. Popula as linhas
    for log, user in logs:
        # Formata a data pro padrão brazuca (DD/MM/YYYY HH:MM:SS)
        data_formatada = log.created_at.strftime("%d/%m/%Y %H:%M:%S") if log.created_at else ""
        
        writer.writerow([
            log.id,
            log.action,
            user.full_name,
            user.email,
            log.performed_by,
            data_formatada
        ])

    # 5. Retorna pro começo do arquivo na memória e cospe pro navegador
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=auditoria_entra_id.csv"}
    )