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
                total_seconds += (req.updated_at - req.created_at).total_seconds()
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