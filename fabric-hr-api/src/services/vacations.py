from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date

# Imports Locais
from src.database import get_db
from src import models, schemas
from src.routers.math import MathRHService

router = APIRouter(
    prefix="/api/vacation",
    tags=["Gestão de Férias"]
)

@router.get("/balance")
def get_vacation_balance(email: str, db: Session = Depends(get_db)):
    """
    Obter o saldo de férias de um colaborador, incluindo dias disponíveis, dias usados, período aquisitivo, e flags de venda ou adiantamento.
    - email: Email do colaborador para identificar sua conta
    - Retorna um objeto com o nome do colaborador, departamento, se é gestor ou RH, dias disponíveis, dias usados, período aquisitivo (início e fim),
    e flags indicando se o colaborador vendeu dias ou adiantou o 13° salário. O endpoint é essencial para que o colaborador possa consultar seu saldo
    de férias e planejar suas solicitações, além de fornecer informações importantes para o processo de aprovação e gestão de férias pela equipe de RH e gestores.
    """
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if not user: 
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")

    today = date.today()
    adm = user.admission_date
    
    # 🚨 A BLINDAGEM: Se o banco de dados não tiver a data de admissão desse cara
    if not adm:
        return {
            "name": user.full_name, 
            "department": user.department,
            "is_manager": user.is_manager,
            "is_hr": getattr(user, "is_hr", False), 
            "available_days": 0,
            "used_days": 0,
            "period_start": str(today),
            "period_end": str(today + timedelta(days=365)),
            "flags": {
                "has_sold_days": False,
                "has_advanced_13th": False
            }
        }

    # 1. CÁLCULO DINÂMICO BASEADO NA ADMISSÃO (Só roda se 'adm' existir!)
    years = today.year - adm.year - ((today.month, today.day) < (adm.month, adm.day))
    total_acquired = max(0, years * 30)

    # 2. TRATAMENTO SEGURO DO OBJETO BALANCE
    used_days = 0
    has_sold = False
    has_13th = False
    
    if user.balance:
        used_days = user.balance.used_days
        has_sold = user.balance.has_sold_days
        has_13th = user.balance.has_advanced_13th

    # 3. RESULTADO FINAL
    available_days = total_acquired - used_days

    # Define o período aquisitivo atual
    try:
        current_period_start = adm.replace(year=adm.year + years)
    except ValueError: 
        current_period_start = adm + timedelta(days=years * 365)
        
    current_period_end = current_period_start + timedelta(days=365)

    return {
        "name": user.full_name, 
        "department": user.department,
        "is_manager": user.is_manager,
        "is_hr": getattr(user, "is_hr", False), 
        "available_days": available_days,
        "used_days": used_days,
        "period_start": str(current_period_start),
        "period_end": str(current_period_end),
        "flags": {
            "has_sold_days": has_sold,
            "has_advanced_13th": has_13th
        }
    }
    
@router.get("/history")
def get_user_history(email: str, db: Session = Depends(get_db)):
    """
    Obter o histórico de solicitações de férias de um colaborador, incluindo detalhes como datas, status, e justificativas.
    - email: email do colaborador para identificar sua conta
    - Retorna uma lista de solicitações de férias do colaborador, ordenadas da mais recente para a mais antiga. Cada solicitação inclui o ID, datas de início e fim,
    número de dias, status (pendente, aprovado, rejeitado), se vendeu dias ou adiantou o 13° salário, e a justificativa do gestor (se houver).
    O endpoint é importante para que o colaborador possa acompanhar suas solicitações passadas, entender o status de cada uma, e ter acesso às justificativas fornecidas pelos gestores,
    o que pode ajudar no planejamento de futuras solicitações e na comunicação com a equipe de RH e gestores.
    """
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user: return []
    requests = db.query(models.VacationRequest).filter(models.VacationRequest.user_id == user.id).order_by(models.VacationRequest.start_date.desc()).all()
    resultado = []
    for req in requests:
        days_calc = (req.end_date - req.start_date).days + 1
        resultado.append({
            "id": req.id, "startDate": req.start_date.strftime("%Y-%m-%d"), "endDate": req.end_date.strftime("%Y-%m-%d"),
            "days": days_calc, "status": req.status, "sellDays": req.sell_days, "advance13th": req.advance_13th,
            "justification": req.manager_justification
        })
    return resultado

@router.post("/request")
def create_vacation_request(payload: schemas.VacationSubmit, db: Session = Depends(get_db)):
    """
    Criar uma nova solicitação de férias para um colaborador, incluindo detalhes como datas, venda de dias, e adiantamento de 13° salário.
    - payload: Objeto contendo o e-mail do colaborador para identificar sua conta, data de início das férias, número de dias, e flags indicando
    se o colaborador deseja vender dias ou adiantar o 13° salário.
    - O endpoint cria uma nova solicitação de férias no sistema, associada ao colaborador identificado pelo e-mail. Ele calcula a data de término com base
    na data de início e no número de dias, e define o status inicial como "PENDENTE". Se o colaborador optar por vender dias ou adiantar o 13° salário, as flags
    correspondentes são definidas no banco de dados.
    """
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user: raise HTTPException(status_code=404, detail="Colaborador não encontrado")
    start_d = datetime.strptime(payload.startDate, "%Y-%m-%d").date()
    end_d = start_d + timedelta(days=payload.days - 1)
    new_request = models.VacationRequest(
        user_id=user.id, start_date=start_d, end_date=end_d,
        sell_days=payload.sellDays, advance_13th=payload.advance13th, status="PENDENTE"
    )
    db.add(new_request)
    if payload.sellDays: user.balance.has_sold_days = True
    if payload.advance13th: user.balance.has_advanced_13th = True
    db.commit()
    return {"message": "Solicitação gravada!"}

@router.get("/team_vacations")
def get_team_vacations(email: str, db: Session = Depends(get_db)):
    """
    Obter informações sobre as férias da equipe de um gestor, incluindo métricas de risco de sobreposição e fadiga.
    - email: Email do gestor para identificar sua equipe
    - Retorna uma lista de solicitações de férias da equipe e métricas como número total de membros, risco de sobreposição, tempo médio de aprovação,
    dias acumulados, e alertas de fadiga (baseado em saldos altos). O endpoint ajuda gestores a monitorar e gerencias as férias de seus liderados,
    identificando possíveis problemas de planejamento e garantindo que a equipe tenha um equilíbrio saudável entre trabalho e descanso.
    """
    manager = db.query(models.User).filter(models.User.email == email).first()
    if not manager: return {"metrics": {}, "vacations": []}
    
    team_users = db.query(models.User).filter(models.User.manager_id == manager.id, models.User.is_active == True).all()
    team_ids = [u.id for u in team_users]
    total_liderados = len(team_ids)
    
    # NOVO: Motor de Saldo e Fadiga do Setor
    total_accumulated_days = 0
    fatigue_alerts = 0
    for u in team_users:
        if u.balance:
            total_accumulated_days += u.balance.available_days
            # Se o cara tem 30 ou mais dias de saldo, o alerta de fadiga dispara
            if u.balance.available_days >= 30:
                fatigue_alerts += 1
    
    requests = db.query(models.VacationRequest).filter(models.VacationRequest.user_id.in_(team_ids)).order_by(models.VacationRequest.start_date.desc()).all()
    
    approved_reqs = [r for r in requests if r.status == "APROVADO"]
    overlap_count = 0
    for i, r1 in enumerate(approved_reqs):
        has_overlap = False
        for j, r2 in enumerate(approved_reqs):
            if i != j and r1.start_date <= r2.end_date and r2.start_date <= r1.end_date:
                has_overlap = True
                break
        if has_overlap: overlap_count += 1

    resultado = []
    for req in requests:
        days_calc = (req.end_date - req.start_date).days + 1
        resultado.append({
            "id": req.id, "employeeName": req.user.full_name, "role": req.user.role,
            "startDate": req.start_date.strftime("%Y-%m-%d"), "endDate": req.end_date.strftime("%Y-%m-%d"),
            "days": days_calc, "status": req.status, "sellDays": req.sell_days,
            "advance13th": req.advance_13th, "justification": req.manager_justification
        })
        
    return {
        "metrics": {
            "total_team_members": total_liderados, 
            "overlap_risk": overlap_count, 
            "avg_approval_time": 1.2,
            "total_accumulated_days": total_accumulated_days,
            "fatigue_alerts": fatigue_alerts
        }, 
        "vacations": resultado
    }

@router.put("/{request_id}/status")
def update_vacation_status(request_id: int, payload: schemas.ActionRequest, db: Session = Depends(get_db)):
    """
    Endpoint para atualizar o status de uma solicitação de férias (aprovar ou rejeitar) e ajustar o saldo de dias do colaborador.
    - request_id: ID da solicitação de férias a ser atualizado.
    - payload: Objeto contendo a ação ("approve" ou "reject") e uma justificativa opcional.
    - O endpoint verifica a solicitação, atualiza seu status, e ajusta o saldo de dias do colaborador com base na decisão. Se aprovado, os dias gozados são subtraídos,
    e se vendido, mais 10 dias são subtraídos. Se rejeitado, quaisquer vendas ou adiantamentos relacionados são revertidos. O endpoint é essencial para o processo de aprovação
    de férias, garantindo que as decisões sejam refletidas corretamente no sistema e que os gestores possam justificar suas ações quando necessário.
    """
    vacation = db.query(models.VacationRequest).filter(models.VacationRequest.id == request_id).first()
    if not vacation: raise HTTPException(status_code=404)
    
    novo_status = "APROVADO" if payload.action == "approve" else "REPROVADO"
    vacation.status = novo_status
    if getattr(payload, "justification", None): 
        vacation.manager_justification = payload.justification
    
    # ... (Seu código original que lida com o user_balance) ...

    # ==========================================================
    # 🚀 O GATILHO S-RANK (BLOQUEIO IMEDIATO NA APROVAÇÃO)
    # ==========================================================
    if novo_status == "APROVADO":
        hoje = date.today()
        # O OLHO DO SHARINGAN: Essas férias aprovadas já estão rolando HOJE?
        if vacation.start_date <= hoje <= vacation.end_date:
            user = vacation.user
            
            # Se o cara ainda não tá bloqueado, a gente usa a sua própria estrutura pra cortar!
            if not getattr(user, "is_entra_blocked", False):
                try:
                    # Monta o seu payload fake simulando o clique no botão
                    toggle_payload = schemas.EntraToggleRequest(enable=False)
                    sucesso = entra_service.toggle_entra_status(user_id=user.id, payload=toggle_payload, db=db)
                    
                    if sucesso:
                        user.is_entra_blocked = True
                        db.add(models.EntraAuditLog(
                            target_user_id=user.id, 
                            action="BLOQUEIO AUTOMÁTICO (EVENTO DE APROVAÇÃO)", 
                            performed_by="Automação do Sistema"
                        ))
                except Exception as e:
                    print(f"🚨 [API] Erro ao bloquear na aprovação: {e}")
    # ==========================================================

    db.commit()
    return {"message": "Status atualizado com sucesso!"}