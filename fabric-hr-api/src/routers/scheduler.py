from datetime import date, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from src.database import SessionLocal # Importe sua sessão do banco
from src import models
from src.routers.microsoft_service import EntraIDService

entra_service = EntraIDService()

def robo_bloqueio_ferias_continuo():
    """
    Varredura 360º S-Rank: Verifica todo mundo que está no período de férias HOJE.
    Se o cara tá de férias e a conta ainda tá ativa no Entra ID, a gente passa o cerol.
    """
    db = SessionLocal()
    hoje = date.today()
    
    try:
        # A MÁGICA AQUI: Pega quem tem o 'hoje' caindo no meio das férias
        # Ajuste o 'end_date' para o nome exato da coluna no seu banco
        ferias_ativas = db.query(models.VacationRequest).filter(
            models.VacationRequest.start_date <= hoje,
            models.VacationRequest.end_date >= hoje,
            models.VacationRequest.status == "APROVADO"
        ).all()

        for ferias in ferias_ativas:
            user = ferias.user
            
            # Se a sombra local acusa que ele NÃO tá bloqueado, a gente age!
            if not user.is_entra_blocked:
                # 1. Derruba a sessão e bloqueia na Nuvem
                sucesso = entra_service.auth_provider.update_account_status(user.email, False)
                
                if sucesso:
                    # 2. Atualiza a Sombra Local (Badge vermelho na tela do Gestor)
                    user.is_entra_blocked = True
                    
                    # 3. Grava o Log de Auditoria Implacável
                    novo_log = models.EntraAuditLog(
                        target_user_id=user.id,
                        action="BLOQUEIO AUTOMÁTICO (CORREÇÃO DE ROTA)",
                        performed_by="AUTOMAÇÃO DE SEGURANÇA CONTÍNUA"
                    )
                    db.add(novo_log)
                    print(f"✅ [ROBÔ] Pegamos no pulo! Acesso de {user.full_name} cortado para férias (Início: {ferias.start_date}).")

        db.commit() 
    except Exception as e:
        print(f"🚨 [ROBÔ] Erro na automação de varredura: {e}")
    finally:
        db.close() 

# 🚀 INICIA O MOTOR DO ROBÔ
scheduler = BackgroundScheduler()
# Mantém rodando no fim do dia (ou bota pra rodar de hora em hora pra ser mais agressivo)
scheduler.add_job(robo_bloqueio_ferias_continuo, 'cron', hour=23, minute=50)
scheduler.start()