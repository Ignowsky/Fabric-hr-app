from datetime import date, timedelta, datetime
from apscheduler.schedulers.background import BackgroundScheduler
from src.database import SessionLocal # Importe sua sessão do banco
from src import models
from src.routers.microsoft_service import EntraIDService
from src.routers.email import EmailService

entra_service = EntraIDService()
email_service = EmailService()

def robo_bloqueio_ferias_continuo():
    """
    Varredura 360º S-Rank: Verifica todo mundo que está no período de férias HOJE.
    Se o cara tá de férias e a conta ainda tá ativa no Entra ID, a gente passa o cerol.
    """
    db = SessionLocal()
    hoje = date.today()
    print(f"[ROBÔ] Iniciando varredura de segurança Entra ID. Data base: {hoje}")
    
    try:
        # ==========================================================
        # 1. A LISTA DE QUEM DEVE FICAR FORA DA MATRIX HOJE
        # ==========================================================
        ferias_ativas = db.query(models.VacationRequest).filter(
            models.VacationRequest.start_date <= hoje,
            models.VacationRequest.end_date >= hoje,
            models.VacationRequest.status == "APROVADO"
        ).all()

        # Guarda os IDs da galera que tá na praia hoje pra checar depois
        usuarios_em_ferias_ids = [f.user_id for f in ferias_ativas]

        # 🚨 BLOQUEIA QUEM TÁ DE FÉRIAS MAS TÁ COM A CONTA ATIVA
        for ferias in ferias_ativas:
            user = ferias.user
            
            if not user.is_entra_blocked:
                # O cara tá na praia mas a conta tá ativa. CORTA!
                sucesso = entra_service.auth_provider.update_account_status(user.email, False)
                
                if sucesso:
                    user.is_entra_blocked = True
                    db.add(models.EntraAuditLog(
                        target_user_id=user.id,
                        action="BLOQUEIO AUTOMÁTICO",
                        performed_by="ROBÔ ANBU (15 MIN)"
                    ))
                    print(f"🔒 [ANBU] Pegamos no pulo! Acesso de {user.full_name} cortado para férias.")

        # ==========================================================
        # 2. A LISTA DE QUEM JÁ VOLTOU E PRECISA TRABALHAR
        # ==========================================================
        usuarios_bloqueados = db.query(models.User).filter(
            models.User.is_entra_blocked == True
        ).all()

        # 🚨 LIBERA QUEM TÁ BLOQUEADO MAS NÃO TÁ MAIS DE FÉRIAS
        for user in usuarios_bloqueados:
            if user.id not in usuarios_em_ferias_ids:
                # Tá com badge de bloqueado, mas a data de férias já passou. LIBERA!
                sucesso = entra_service.auth_provider.update_account_status(user.email, True)
                
                if sucesso:
                    user.is_entra_blocked = False
                    db.add(models.EntraAuditLog(
                        target_user_id=user.id,
                        action="DESBLOQUEIO AUTOMÁTICO",
                        performed_by="ROBÔ ANBU (15 MIN)"
                    ))
                    print(f"🔓 [ANBU] Férias acabaram! Acesso de {user.full_name} liberado.")

        db.commit() 
        print("✅ [ROBÔ] Varredura concluída com sucesso!")
        
    except Exception as e:
        print(f"🚨 [ROBÔ] Erro na automação de varredura: {e}")
        db.rollback() # Limpa a transação se der erro
    finally:
        db.close() # Nunca esqueça de fechar a porta do banco!

# 🚀 INICIA O MOTOR DO ROBÔ
scheduler = BackgroundScheduler()

# 🚨 TROCA DO MOTOR: De 'cron' para 'interval'
# Agora roda religiosamente a cada 15 minutos. 
# (Dica: Pra testar agora no Render, muda pra 'minutes=2' e olha os logs, depois volta pra 15)
scheduler.add_job(robo_bloqueio_ferias_continuo, 'interval', minutes=5, id='patrulha_entra_id', next_run_time=datetime.now() + timedelta(seconds=10)) # Começa 10 segundos depois do deploy pra já pegar o pessoal que tá de férias 
scheduler.start()