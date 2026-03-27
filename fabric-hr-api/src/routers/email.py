import os
import requests
import msal
import base64
from dotenv import load_dotenv

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.database import get_db
from src import models

load_dotenv() 

# ---------------------------------------------------------
# 1. A CLASSE DE SERVIÇO (S-Rank intacta!)
# ---------------------------------------------------------
class EmailService:
    def __init__(self):
        self.sender_email = os.getenv("SMTP_USER")
        self.dp_email = os.getenv("DP_EMAIL")
        self.TENANT_ID = os.getenv("AZURE_TENANT_ID")
        self.CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
        self.CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
        
    def send_real_email_graph(self, manager_name: str, department: str, csv_data: str, manager_email: str):
        token = self.get_graph_token()
        if not token or not self.sender_email or not self.dp_email:
            print("🚨 [EMAIL] Falha ao obter token ou variáveis de e-mail ausentes no .env.")
            return False

        url = f"https://graph.microsoft.com/v1.0/users/{self.sender_email}/sendMail"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        body_content = f"""
        Olá time de Departamento Pessoal,

        O gestor(a) {manager_name} ({department}) acabou de aprovar e fechar o lote de férias da equipe através do portal FabricHR.

        Em anexo, segue a relação completa (CSV) do período fechado para o processamento da folha e auditoria de bloqueios no Entra ID.

        Atenciosamente,
        Robô S-Rank do FabricHR 🤖
        """

        csv_b64 = base64.b64encode(csv_data.encode('utf-8')).decode('utf-8')

        payload = {
            "message": {
                "subject": f"🚀 [FabricHR] Lote de Férias Liberado - {department}",
                "body": {
                    "contentType": "Text",
                    "content": body_content
                },
                # Corrigido self.DP_EMAIL para self.dp_email (Atenção aqui na tipagem do Python!)
                "toRecipients": [{"emailAddress": {"address": self.dp_email}}],
                "replyTo": [{"emailAddress": {"address": manager_email, "name": manager_name}}],
                "attachments": [
                    {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        "name": f"Lote_Ferias_{department.replace(' ', '_')}.csv",
                        "contentType": "text/csv",
                        "contentBytes": csv_b64
                    }
                ]
            },
            "saveToSentItems": "true"
        }

        try:
            # Corrigido o requests.post (tirou o 'self' que tava sobrando ali)
            response = requests.post(url, headers=headers, json=payload)
            if response.status_code == 202:
                print(f"📧 [EMAIL] Lote com CSV disparado via Graph API para {self.dp_email}! (Reply-To ativado para {manager_email})")
                return True
            else:
                print(f"❌ [EMAIL] Erro da Graph API ({response.status_code}): {response.text}")
                return False
        except Exception as e:
            print(f"❌ [EMAIL] Erro Crítico: {e}")
            return False

    def get_graph_token(self):
        if not self.TENANT_ID or not self.CLIENT_ID or not self.CLIENT_SECRET:
            print("🚨 Chaves do Azure ausentes no .env!")
            return None
        authority = f"https://login.microsoftonline.com/{self.TENANT_ID}"
        app = msal.ConfidentialClientApplication(self.CLIENT_ID, authority=authority, client_credential=self.CLIENT_SECRET)
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        return result.get("access_token")
    
    
    def update_entra_id_account(self, email: str, enable: bool):
        token = self.get_graph_token()
        if not token: 
            return False

        url = f"https://graph.microsoft.com/v1.0/users/{email}"
        headers = {
            "Authorization": f"Bearer {token}", 
            "Content-Type": "application/json"
        }
        payload = {"accountEnabled": enable}
        
        try:
            response = requests.patch(url, headers=headers, json=payload)
            if response.status_code in (200, 204):
                print(f"✅ [ENTRA ID] Conta {email} {'ATIVADA' if enable else 'BLOQUEADA'}!")
                return True
            else:
                print(f"❌ [ENTRA ID] Erro ({response.status_code}): {response.text}")
                return False
        except Exception as e:
            print(f"❌ [ENTRA ID] Falha de conexão: {e}")
            return False

# ---------------------------------------------------------
# 2. O GUICHÊ DE ATENDIMENTO (Onde o Next.js vai bater)
# ---------------------------------------------------------

router = APIRouter()

class DispatchPayload(BaseModel):
    email: str
    csv_data: str

@router.post("/gestor/dispatch")
def dispatch_vacations_lote(payload: DispatchPayload, db: Session = Depends(get_db)):
    
    # Busca o gestor para pegar nome e departamento
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Gestor não encontrado no banco de dados.")

    # Inicia o robô
    email_svc = EmailService()
    
    # Manda a bala
    sucesso = email_svc.send_real_email_graph(
        manager_name=user.full_name,
        department=user.department,
        csv_data=payload.csv_data,
        manager_email=user.email
    )

    if not sucesso:
        raise HTTPException(status_code=500, detail="Erro ao enviar o e-mail pela Graph API.")

    return {"message": "Lote disparado pro DP com sucesso!"}