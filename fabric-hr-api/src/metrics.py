from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from typing import Dict
from src import models

def calculate_rh_metrics(db: Session):
    """
    Motor S-Rank de Business Intelligence (BI) para o RH.
    Varre o DW e calcula todas as métricas gerenciais.
    """
    requests = db.query(models.VacationRequest).all()
    today = date.today()

    # 1. Contagens Básicas
    pending_count = db.query(func.count(models.VacationRequest.id)).filter(models.VacationRequest.status == "PENDENTE").scalar() or 0
    approved_count = db.query(func.count(models.VacationRequest.id)).filter(models.VacationRequest.status == "APROVADO").scalar() or 0
    reproved_count = db.query(func.count(models.VacationRequest.id)).filter(models.VacationRequest.status == "REPROVADO").scalar() or 0
    
    # 2. Pessoas de Férias Agora
    people_on_vacation = db.query(func.count(models.User.id)).join(models.VacationRequest).filter(
        models.VacationRequest.status == "APROVADO",
        models.VacationRequest.start_date <= today,
        models.VacationRequest.end_date >= today
    ).scalar() or 0

    # 3. Tempo Médio de Aprovação
    approved_requests = db.query(models.VacationRequest).filter(models.VacationRequest.status == "APROVADO").all()
        
    if not approved_requests:
            avg_approval_time_days = 0.0
    else:
        total_seconds = 0
        valid_requests = 0
            
        for req in approved_requests:
            # Garante que as colunas de tempo existem e não são nulas
            if req.created_at and req.updated_at:
                    # Calcula a diferença exata de tempo (TimeDelta)
                diff = req.updated_at - req.created_at
                total_seconds += diff.total_seconds()
                valid_requests += 1
            
        if valid_requests > 0:
            avg_seconds = total_seconds / valid_requests
                # Transforma segundos em dias (1 dia = 86400 segundos) e arredonda pra 1 casa decimal
            avg_approval_time_days = round(avg_seconds / 86400, 1)
        else:
            avg_approval_time_days = 0.0
            
    # 4. Média de Férias por Setor
    avg_vacation_per_sector: Dict[str, float] = {}
    sectors = db.query(models.User.department).distinct().all()
    
    for (sector_name,) in sectors:
        if not sector_name: continue
        
        sector_requests = db.query(models.VacationRequest).join(models.User).filter(
            models.User.department == sector_name,
            models.VacationRequest.status == "APROVADO"
        ).all()

        if not sector_requests:
            avg_vacation_per_sector[sector_name] = 0.0
            continue

        dias_totais = sum((req.end_date - req.start_date).days + 1 for req in sector_requests)
        total_requests_sector = len(sector_requests)
        
        avg_vacation_per_sector[sector_name] = round(dias_totais / total_requests_sector, 1)

    # 5. Sazonalidade
    seasonality: Dict[str, int] = {f"{m:02d}": 0 for m in range(1, 13)}
    approved_requests = db.query(models.VacationRequest).filter(models.VacationRequest.status == "APROVADO").all()
    for req in approved_requests:
        month_key = req.start_date.strftime("%m")
        seasonality[month_key] += 1
    
    sazonalidade_chart = []
    meses_nome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    for i, month_key in enumerate(seasonality):
        sazonalidade_chart.append({"mes": meses_nome[i], "pedidos": seasonality[month_key]})

    # 6. Preparação para o Calendário Macro (Agora com TODOS os dados para filtro)
    macro_vacations = []
    for req in requests:
        if req.status != "REPROVADO": 
            days_calc = (req.end_date - req.start_date).days + 1
            macro_vacations.append({
                "id": req.id,
                "employeeName": req.user.full_name,
                "department": req.user.department,
                "startDate": req.start_date.strftime("%Y-%m-%d"),
                "endDate": req.end_date.strftime("%Y-%m-%d"),
                "days": days_calc,
                "status": req.status,
                "sellDays": req.sell_days,           # NOVO: Para o Filtro
                "advance13th": req.advance_13th,     # NOVO: Para o Filtro
                "justification": req.manager_justification,
                "title": f"{req.user.full_name}: {days_calc}d ({req.user.department})"
            })

    return {
        "summary": {
            "pending": pending_count,
            "approved": approved_count,
            "total_requests": pending_count + approved_count + reproved_count,
            "people_on_vacation_now": people_on_vacation
        },
        "metrics": {
            "avg_approval_time_days": avg_approval_time_days,
            "avg_vacation_per_sector": avg_vacation_per_sector,
            "seasonality": sazonalidade_chart
        },
        "macro_vacations": macro_vacations
    }