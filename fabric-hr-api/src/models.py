from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Date, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from src.database import Base

class User(Base):
    __tablename__ = "users"
    __table_args__ = {'schema': 'vacation'}

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    role = Column(String(50), nullable=False)
    
    # NOVO: A CHAVE MESTRA DO RH
    department = Column(String(100), default='Geral')
    
    manager_id = Column(Integer, ForeignKey("vacation.users.id"), nullable=True)
    admission_date = Column(Date, nullable=False)
    demission_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    is_manager = Column(Boolean, default=False)
    is_hr = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    balance = relationship("VacationBalance", back_populates="user", uselist=False)
    requests = relationship("VacationRequest", back_populates="user") # Aqui chama "requests"
    
    is_entra_blocked = Column(Boolean, default=False)  # NOVO: Status da conta Entra ID


class VacationBalance(Base):
    __tablename__ = "vacation_balances"
    __table_args__ = {'schema': 'vacation'}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("vacation.users.id", ondelete="CASCADE"), unique=True)
    total_acquired_days = Column(Integer, default=0)
    used_days = Column(Integer, default=0)
    available_days = Column(Integer, default=0)
    has_sold_days = Column(Boolean, default=False)
    has_advanced_13th = Column(Boolean, default=False)
    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="balance")


class VacationRequest(Base):
    __tablename__ = "vacation_requests"
    __table_args__ = {'schema': 'vacation'}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("vacation.users.id", ondelete="CASCADE"))
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    sell_days = Column(Boolean, default=False)
    advance_13th = Column(Boolean, default=False)
    status = Column(String(50), default='PENDENTE')
    manager_justification = Column(Text, nullable=True)
    # ==========================================
    # ⏱️ TIMESTAMPS PARA MÉTRICAS S-RANK
    # ==========================================
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # CORREÇÃO: Apontando exatamente para o nome que está no User ("requests")
    user = relationship("User", back_populates="requests")
    
class EntraAuditLog(Base):
    __tablename__ = "entra_audit_logs"
    __table_args__ = {'schema': 'vacation'}
    
    
    id = Column(Integer, primary_key=True, index=True)
    target_user_id = Column(Integer, ForeignKey("vacation.users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(50))  # "enable" ou "disable"
    performed_by = Column(String(150))  # email ou nome do executor
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
# 1. O Contrato do Payload (O que o Next.js envia)
class DispatchPayload(BaseModel):
    email: str
    csv_data: str