from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, date
from typing import Dict
from src import models

def calculate_rh_metrics(db: Session):
    """
    Motor S-Rank de Business Intelligence (BI) para o RH.
    Otimizado para Zero N+1 Queries e Alta Performance.
    """
    today = date.today()

    # 1. Contagens Básicas (Queries super leves)
    pending_count = db.query(func.count(models.VacationRequest.id)).filter(models.VacationRequest.status == "PENDENTE").scalar() or 0
    approved_count = db.query(func.count(models.VacationRequest.id)).filter(models.VacationRequest.status == "APROVADO").scalar() or 0
    reproved_count = db.query(func.count(models.VacationRequest.id)).filter(models.VacationRequest.status == "REPROVADO").scalar() or 0
    
    # 2. Pessoas de Férias Agora
    people_on_vacation = db.query(func.count(models.User.id)).join(models.VacationRequest).filter(
        models.VacationRequest.status == "APROVADO",
        models.VacationRequest.start_date <= today,
        models.VacationRequest.end_date >= today
    ).scalar() or 0

    # ==========================================================
    # ARGA ÚNICA (Resolve o Passo 3, 4, 5 e 6 de uma vez)
    # Traz TODOS os pedidos E os dados do usuário na mesma query!
    # ==========================================================
    all_requests = db.query(models.VacationRequest).options(joinedload(models.VacationRequest.user)).all()

    # 3. Tempo Médio de Aprovação & 5. Sazonalidade (Feitos no mesmo loop!)
    total_seconds = 0
    valid_requests = 0
    seasonality = {f"{m:02d}": 0 for m in range(1, 13)}

    for req in all_requests:
        if req.status == "APROVADO":
            # --- Lógica da Sazonalidade ---
            month_key = req.start_date.strftime("%m")
            seasonality[month_key] += 1
            
            # --- Lógica do Tempo de Aprovação ---
            if req.created_at and req.updated_at:
                # Opcional: Garante que as datas não têm fuso horário para evitar aquele erro de offset
                c_clean = req.created_at.replace(tzinfo=None)
                u_clean = req.updated_at.replace(tzinfo=None)
                
                diff = u_clean - c_clean
                total_seconds += diff.total_seconds()
                valid_requests += 1

    avg_approval_time_days = round((total_seconds / valid_requests) / 86400, 1) if valid_requests > 0 else 0.0

    # Prepara o Chart de Sazonalidade pro Front-end
    meses_nome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    sazonalidade_chart = [{"mes": meses_nome[i], "pedidos": count} for i, count in enumerate(seasonality.values())]

    # 4. Média de Férias por Setor
    avg_vacation_per_sector: Dict[str, float] = {}
    sector_data = {} # Guarda os dias e a quantidade de pedidos { "TI": {"dias": 30, "pedidos": 2} }
    
    for req in all_requests:
        if req.status == "APROVADO" and req.user.department:
            dept = req.user.department
            dias = (req.end_date - req.start_date).days + 1
            
            if dept not in sector_data:
                sector_data[dept] = {"dias": 0, "pedidos": 0}
                
            sector_data[dept]["dias"] += dias
            sector_data[dept]["pedidos"] += 1

    for dept, data in sector_data.items():
        avg_vacation_per_sector[dept] = round(data["dias"] / data["pedidos"], 1)

    # 6. Preparação para o Calendário Macro
    macro_vacations = []
    for req in all_requests:
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
                "sellDays": req.sell_days,
                "advance13th": getattr(req, "advance_13th", False), # Usando getattr por segurança
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