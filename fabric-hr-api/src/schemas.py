from pydantic import BaseModel
from typing import Optional, List

# ---------------------------------------------------------
# SCHEMAS (CONTRATOS DE DADOS)
# ---------------------------------------------------------
class DispatchRequest(BaseModel):
    email: str
    
class VacationSubmit(BaseModel):
    email: str
    startDate: str
    days: int
    sellDays: bool
    advance13th: bool

class ActionRequest(BaseModel):
    action: str
    justification: Optional[str] = None

class UserCreate(BaseModel):
    full_name: str
    email: str
    role: str
    department: str
    admission_date: str
    is_manager: bool = False
    is_hr: bool = False
    manager_id: Optional[int] = None

class UserUpdate(BaseModel):
    full_name: str
    role: str
    department: str
    is_manager: bool
    is_hr: bool
    manager_id: Optional[int] = None
    
class QuitarPeriodoRequest(BaseModel):
    dias_a_quitar: float
    
class DispatchRequest(BaseModel):
    email: str
    csv_data: str 

class EntraToggleRequest(BaseModel):
    enable: bool

class DispatchPayload(BaseModel):
    email: str
    csv_data: str
    
class CompanyCreate(BaseModel):
    name: str
    cnpj: Optional[str] = None

class CompanyStatusUpdate(BaseModel):
    is_active: bool
    
class UserCompanyLink(BaseModel):
    company_ids: List[int]
    primary_company_id: int