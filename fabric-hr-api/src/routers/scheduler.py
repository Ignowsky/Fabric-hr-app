from datetime import date, timedelta, datetime
from apscheduler.schedulers.background import BackgroundScheduler
from src.database import SessionLocal
from src import models

# 🚨 IMPORTA SÓ A ARMA CERTA: EmailService
from src.routers.email import EmailService

# 🚨 INSTANCIA A ARMA S-RANK
robo_ms = EmailService()

def robo_bloqueio_ferias_continuo():
    """
    Varredura 360º S-Rank: Verifica todo mundo que está no período de férias HOJE.
    """
    db = SessionLocal()
    hoje = date.today()
    print(f"🕵️‍♂️ [ROBÔ] Iniciando varredura de segurança Entra ID. Data base: {hoje}")
    
    try:
        # ==========================================================
        # 1. A LISTA DE QUEM DEVE FICAR FORA DA MATRIX HOJE
        # ==========================================================
        ferias_ativas = db.query(models.VacationRequest).filter(
            models.VacationRequest.start_date <= hoje,
            models.VacationRequest.end_date >= hoje,
            models.VacationRequest.status == "APROVADO"
        ).all()

        usuarios_em_ferias_ids = [f.user_id for f in ferias_ativas]

        # 🚨 BLOQUEIA QUEM TÁ DE FÉRIAS
        for ferias in ferias_ativas:
            user = ferias.user
            
            if not user.is_entra_blocked:
                # ⚔️ O CORTE S-RANK: Usando a instância robo_ms
                sucesso = robo_ms.update_entra_id_account(user.email, False)
                
                if sucesso:
                    user.is_entra_blocked = True
                    db.add(models.EntraAuditLog(
                        target_user_id=user.id,
                        action="BLOQUEIO AUTOMÁTICO",
                        performed_by="ROBÔ DE BLOQUEIO DE FÉRIAS"
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
                # ⚔️ O DESBLOQUEIO S-RANK: Usando a mesma instância robo_ms
                sucesso = robo_ms.update_entra_id_account(user.email, True)
                
                if sucesso:
                    user.is_entra_blocked = False
                    db.add(models.EntraAuditLog(
                        target_user_id=user.id,
                        action="DESBLOQUEIO AUTOMÁTICO",
                        performed_by="ROBÔ DE LIBERAÇÃO DE FÉRIAS"
                    ))
                    print(f"🔓 [ROBÔ] Férias acabaram! Acesso de {user.full_name} liberado.")

        db.commit() 
        print("✅ [ROBÔ] Varredura concluída com sucesso!")
        
    except Exception as e:
        print(f"🚨 [ROBÔ] Erro na automação de varredura: {e}")
        db.rollback() 
    finally:
        db.close()

# 🚀 INICIA O MOTOR DO ROBÔ (Lembra de não dar o .start() se já tiver no main.py)
scheduler = BackgroundScheduler()

scheduler.add_job(
    robo_bloqueio_ferias_continuo, 
    'interval', 
    minutes=5, 
    id='patrulha_entra_id', 
    next_run_time=datetime.now() + timedelta(seconds=10)
)
scheduler.start() # <-- DEIXA COMENTADO SE O MAIN.PY JÁ TIVER CHAMANDO