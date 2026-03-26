from datetime import date, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from src.database import SessionLocal # Importe sua sessão do banco
from src import models
from src.routers.microsoft_service import EntraIDService

entra_service = EntraIDService()

def robo_bloqueio_ferias_noturno():
    """
    Varre o banco de dados procurando férias aprovadas que começam no dia seguinte.
    Se achar, corta o acesso na Microsoft, atualiza a sombra local e gera log de auditoria.
    """
    db = SessionLocal() # Abre uma conexão pro robô
    amanha = date.today() + timedelta(days=1)
    
    try:
        # Busca a galera que sai de férias amanhã e a solicitação tá APROVADA
        ferias_para_iniciar = db.query(models.VacationRequest).filter(
            models.VacationRequest.start_date == amanha,
            models.VacationRequest.status == "APROVADO"
        ).all()

        for ferias in ferias_para_iniciar:
            user = ferias.user
            
            # Se já não estiver bloqueado, a gente passa o cerol
            if not user.is_entra_blocked:
                # 1. Bloqueia na Nuvem (enable=False)
                # Acessamos o método direto da classe que você criou
                sucesso = entra_service.auth_provider.update_account_status(user.email, False)
                
                if sucesso:
                    # 2. Atualiza a Sombra Local (Pra tela ficar com o badge vermelho)
                    user.is_entra_blocked = True
                    
                    # 3. Grava o Log S-Rank pra Auditoria
                    novo_log = models.EntraAuditLog(
                        target_user_id=user.id,
                        action="BLOQUEIO AUTOMÁTICO",
                        performed_by="AUTOMAÇÃO DE SEGURANÇA NOTURNA"
                    )
                    db.add(novo_log)
                    print(f"✅ [ROBÔ] Acesso de {user.full_name} cortado para férias!")

        db.commit() # Salva tudo no Postgres
    except Exception as e:
        print(f"🚨 [ROBÔ] Erro na automação noturna: {e}")
    finally:
        db.close() # Nunca esqueça de fechar a porta do banco!

# 🚀 INICIA O MOTOR DO ROBÔ
scheduler = BackgroundScheduler()
# Configura pra rodar todo dia às 23:50
scheduler.add_job(robo_bloqueio_ferias_noturno, 'cron', hour=23, minute=50)
scheduler.start()