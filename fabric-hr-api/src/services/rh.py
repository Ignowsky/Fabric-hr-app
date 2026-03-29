from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date

# Imports Locais
from src.database import get_db
from src import models, schemas

from src.routers.email import EmailService

DISPATCH_ALERTS = []

router = APIRouter(
    tags=["Notificações e Dashboard RH"]
)



@router.get("/api/notifications")
def get_notifications(email: str, context: str = "rh", db: Session = Depends(get_db)):
    """
    Retorna uma lista de notificações para o usuário, com base no contexto (Gestor ou RH). O RH recebe alertas de dispatch e uma visão global, enquanto o Gestor vê 
    apenas os alertas relacionados à sua equipe. A função também calcula métricas de férias, como alertas de fadiga, vencimento de períodos aquisitivos e concessivos,
    e status de solicitações de férias. O objetivo é fornecer insights acionáveis para ambos os papéis, ajudando na gestão proativa das férias e no bem-estar dos colaboradores,
    além de alertar o RH sobre possíveis passivos financeiros e riscos de burnout.
    """
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return []

    alerts = []
    today = date.today()

    # 🚀 NOVO: Separação rigorosa de contexto (Qual chapéu o usuário está usando?)
    if context == "gestor":
        if not user.is_manager: return []
        target_users = db.query(models.User).filter(models.User.manager_id == user.id, models.User.is_active == True).all()
    else: # context == "rh"
        if not getattr(user, 'is_hr', False) and user.department != "Recursos Humanos": return []
        target_users = db.query(models.User).filter(models.User.is_active == True).all()
        alerts.extend(DISPATCH_ALERTS)  # Adiciona os alertas de dispatch para o RH

    for u in target_users:
        if u.balance and u.balance.available_days >= 30:
            alerts.append({
                "type": "danger", 
                "title": "Alerta de Fadiga", 
                "message": f"{u.full_name} acumulou {u.balance.available_days} dias. Risco de Burnout e Passivo Financeiro."
            })

        if not u.admission_date: continue
        anos_empresa = today.year - u.admission_date.year
        if (today.month, today.day) < (u.admission_date.month, u.admission_date.day):
            anos_empresa -= 1
            
        inicio_aquisitivo = date(u.admission_date.year + anos_empresa, u.admission_date.month, u.admission_date.day)
        fim_aquisitivo = inicio_aquisitivo + timedelta(days=365)
        fim_concessivo = fim_aquisitivo + timedelta(days=365)
        
        dias_pro_concessivo = (fim_concessivo - today).days
        if 150 < dias_pro_concessivo <= 180:
            alerts.append({"type": "warning", "title": "Aviso de Concessivo", "message": f"Faltam 6 meses para vencer o concessivo de {u.full_name}."})
        elif 90 < dias_pro_concessivo <= 120:
            alerts.append({"type": "warning", "title": "Atenção (Concessivo)", "message": f"Faltam 4 meses para vencer o concessivo de {u.full_name}."})
        elif 0 < dias_pro_concessivo <= 60:
            alerts.append({"type": "danger", "title": "CRÍTICO (Multa)", "message": f"Faltam menos de 2 meses para vencer o concessivo de {u.full_name}!"})
            
        dias_pro_aquisitivo = (fim_aquisitivo - today).days
        if 0 < dias_pro_aquisitivo <= 30:
            alerts.append({"type": "info", "title": "Aquisitivo Completo", "message": f"{u.full_name} completará o período aquisitivo neste mês."})

    mes_atual = today.month
    ano_atual = today.year
    ids_alvo = [u.id for u in target_users]
    if ids_alvo:
        ferias_mes = db.query(models.VacationRequest).filter(models.VacationRequest.user_id.in_(ids_alvo)).all()
        
        for f in ferias_mes:
            if f.status == "PENDENTE":
                alerts.append({
                    "type": "warning", 
                    "title": "Aprovação Pendente", 
                    "message": f"{f.user.full_name} solicitou férias de {f.start_date.strftime('%d/%m')} a {f.end_date.strftime('%d/%m')}."
                })
            elif f.status == "APROVADO":
                if f.start_date.month == mes_atual and f.start_date.year == ano_atual:
                    alerts.append({"type": "success", "title": "Entrando em Férias", "message": f"{f.user.full_name} iniciará férias em {f.start_date.strftime('%d/%m')}."})
                if f.end_date.month == mes_atual and f.end_date.year == ano_atual:
                    data_retorno = f.end_date + timedelta(days=1)
                    alerts.append({"type": "info", "title": "Retorno de Férias", "message": f"{f.user.full_name} retorna das férias no dia {data_retorno.strftime('%d/%m')}."})

    return alerts

@router.get("/api/rh/metrics")
def get_rh_metrics(db: Session = Depends(get_db)):
    """
    Retorna um conjunto de métricas e dados agregados para o RH, incluindo o número de pessoas atualmente de férias, solicitações aprovadas e pendentes, tempo médio de aprovação,
    dias acumulados globalmente, alertas de fadiga e uma visão macro das férias para exportação e calendário. O objetivo é fornecer ao RH uma visão abrangente do panoramo,
    permitindo uma gestão proativa das férias, identificação de riscos e oportunidades de melhoria nos processos de aprovação e planejamento de recursos humanos.
    """
    all_users = db.query(models.User).filter(models.User.is_active == True).all()
    all_requests = db.query(models.VacationRequest).all()
    
    # Cálculos Globais (Empresa inteira)
    global_accumulated_days = sum([u.balance.available_days for u in all_users if u.balance])
    global_fatigue_alerts = sum([1 for u in all_users if u.balance and u.balance.available_days >= 30])
    
    approved = [r for r in all_requests if r.status == "APROVADO"]
    pending = [r for r in all_requests if r.status == "PENDENTE"]
    
    today = date.today()
    on_vacation_now = [r for r in approved if r.start_date <= today <= r.end_date]
    
    # Base de dados para o Calendário e Exportação do RH
    macro_vacations = []
    for req in all_requests:
        macro_vacations.append({
            "id": req.id, "employeeName": req.user.full_name, "department": req.user.department,
            "startDate": req.start_date.strftime("%Y-%m-%d"), "endDate": req.end_date.strftime("%Y-%m-%d"),
            "days": (req.end_date - req.start_date).days + 1, "status": req.status,
            "sellDays": req.sell_days, "advance13th": req.advance_13th
        })
        
    # Tempo Médio de Aprovação (S-Rank)
    avg_approval_time_days = 0.0
    if approved:
        total_seconds = 0
        valid_reqs = 0
        for req in approved:
            if hasattr(req, 'created_at') and hasattr(req, 'updated_at') and req.created_at and req.updated_at:
                # Tira o fuso horário (tzinfo=None) das duas variáveis pra unificar o multiverso
                created_clean = req.created_at.replace(tzinfo=None)
                updated_clean = req.updated_at.replace(tzinfo=None)

                # Agora a subtração rola lisa!
                total_seconds += (updated_clean - created_clean).total_seconds()
                valid_reqs += 1
        if valid_reqs > 0:
            avg_approval_time_days = round((total_seconds / valid_reqs) / 86400, 1)

    return {
        "summary": {
            "people_on_vacation_now": len(on_vacation_now),
            "approved": len(approved),
            "pending": len(pending)
        },
        "metrics": {
            "avg_approval_time_days": avg_approval_time_days,
            "global_accumulated_days": global_accumulated_days,
            "global_fatigue_alerts": global_fatigue_alerts
        },
        "macro_vacations": macro_vacations
    }
    
@router.post("/api/rh/dispatch")
def dispatch_vacations(payload: schemas.DispatchRequest, db: Session = Depends(get_db)):
    manager = db.query(models.User).filter(models.User.email == payload.email).first()
    if not manager: raise HTTPException(status_code=404, detail="Gestor não encontrado")
    
    # 1. Dispara o E-MAIL REAL com anexo e Reply-To via Graph
    enviado = EmailService().send_real_email_graph(manager.full_name, manager.department, payload.csv_data, manager.email)
    
    # 2. Registra o alerta visual na central de notificações do RH
    DISPATCH_ALERTS.append({
        "type": "success",
        "title": "Lote de Férias Recebido",
        "message": f"O gestor {manager.full_name} ({manager.department}) enviou as aprovações. CSV no e-mail do DP."
    })
    
    if enviado:
        return {"message": "Lote disparado! E-mail com CSV enviado ao DP."}
    else:
        raise HTTPException(status_code=500, detail="Falha no disparo via Graph API.")
    
@router.post("/companies")
def criar_nova_empresa(payload: schemas.CompanyCreate, db: Session = Depends(get_db)):
    """
    Endpoint para criar uma nova empresa. O RH pode usar para registar novas empresas e separar as bases de dados. O CNPJ é opcional, mas se fornecido, o sistema checa por duplicidade
    para mitigar conflitos. O endpoint retorna uma mensagem de sucesso e o ID da nova empresa criada.
    O objetivo é permitir que o RH gerencie múltiplas empresas dentro do mesmo sistema, facilitando a organização e segmentação dos dados de funcionários, férias e métricas por empresa.
    Payload: {
    "name": "Nome da Empresa",
    "cnpj": "CNPJ da Empresa (opcional)"
    }
    DB: {
    Company {
        id: int (PK)
        name: str
        cnpj: str (nullable)
        is_active: bool
    }
    """
    # Checa se o CNPJ já existe pra não dar BO
    if payload.cnpj:
        empresa_existente = db.query(models.Company).filter(models.Company.cnpj == payload.cnpj).first()
        if empresa_existente:
            raise HTTPException(status_code=400, detail="Já existe uma empresa com esse CNPJ!")

    # Forja a nova empresa no banco
    nova_empresa = models.Company(
        name=payload.name,
        cnpj=payload.cnpj,
        is_active=True
    )
    
    db.add(nova_empresa)
    db.commit()
    db.refresh(nova_empresa) # Atualiza pra pegar o ID que o banco gerou
    
    return {
        "message": f"A empresa {nova_empresa.name} foi fundada com sucesso, partner!", 
        "company_id": nova_empresa.id
    }

# Atualização do status da empresa (Ativa/Inativa)
@router.patch("/companies/{company_id}/status")
def alterar_status_empresa(company_id: int, payload: schemas.CompanyStatusUpdate, db: Session = Depends(get_db)):
    """
    Endpoint para ativar ou desativar uma empresa. O RH pode usar para controlar quais empresas estão ativas no sistema, o que afeta a visibilidade e acesso dos colaboradores vinculados a essas empresas.
    O endpoint recebe o ID da empresa e um payload indicando se a empresa deve ser ativada ou desativada. Ele retorna uma mensagem de sucesso indicando o novo status da empresa.
    Payload: {
    "is_active": true (para ativar) ou false (para desativar)
    }
    DB: {
    Company {
        id: int (PK)
        name: str
        cnpj: str (nullable)
        is_active: bool
    }
    """
    # 1. Rastreia a empresa no banco
    empresa = db.query(models.Company).filter(models.Company.id == company_id).first()
    
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada no radar, partner!")
        
    # 2. Vira a chave do cofre
    empresa.is_active = payload.is_active
    db.commit()
    
    # 3. Dá o papo do resultado
    status_msg = "reativada para o jogo" if payload.is_active else "desativada (selada)"
    return {"message": f"A empresa {empresa.name} foi {status_msg} com sucesso!"}

@router.post("/users/{user_id}/companies")
def vincular_empresas_ao_usuario(user_id: int, payload: schemas.UserCompanyLink, db: Session = Depends(get_db)):
    """
    Endpoint para vincular um usuário a múltiplas empresas. O RH pode usar para gerenciar os acessos dos colaboradores, permitindo que eles sejam associados a uma ou mais empresas ativas no sistema.
    O endpoint recebe o ID do usuário e um payload contendo uma lista de IDs de empresas às quais o usuário deve ser vinculado. Ele verifica a existência do usuário e das empresas, atualiza os vínculos no banco de dados e retorna uma mensagem de sucesso.
    Payload: {
    "company_ids": [1, 2, 3] (Lista de IDs de empresas para vincular ao usuário)
    }
    DB: {
    User {
        id: int (PK)
        full_name: str
        email: str
        role: str
        department: str
        admission_date: date
        is_manager: bool
        is_hr: bool
        manager_id: int (FK para User.id)
        primary_company_id: int (FK para Company.id)
    }
    Company {
        id: int (PK)
        name: str
        cnpj: str (nullable)
        is_active: bool
    }
    UserCompanyLink {
        user_id: int (FK para User.id)
        company_id: int (FK para Company.id)
    }
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado, partner!")

    # Busca as empresas que o RH mandou no payload
    empresas = db.query(models.Company).filter(models.Company.id.in_(payload.company_ids)).all()
    
    if len(empresas) != len(payload.company_ids):
        raise HTTPException(status_code=400, detail="Alguma empresa dessa lista não existe no banco!")

    # A MÁGICA DO SQLALCHEMY: Ele limpa os acessos velhos e insere os novos sozinho!
    user.companies = empresas 
    user.primary_company_id = payload.primary_company_id
    
    db.commit()
    return {"message": f"Acessos do {user.full_name} atualizados com sucesso!"}