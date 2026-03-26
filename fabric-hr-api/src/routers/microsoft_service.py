from fastapi import HTTPException
from sqlalchemy.orm import Session
from src.routers.email import EmailService
from src import schemas, models

class EntraIDService:
    def __init__(self):
        self.email_service = EmailService()
        
    def toggle_entra_status(self, user_id: int, payload: schemas.EntraToggleRequest, db: Session):
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Colaborador não encontrado")
        
        sucesso = self.email_service.update_entra_id_account(user.email, payload.enable)
        if not sucesso:
            raise HTTPException(status_code=500, detail="Falha ao comunicar com a Microsoft Graph API.")
        
        status_msg = "desbloqueada" if payload.enable else "bloqueada"
        return {"message": f"Conta na nuvem {status_msg} com sucesso!"}