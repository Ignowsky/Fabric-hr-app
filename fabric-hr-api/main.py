from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta, date
from typing import Optional

from src import models
from src.database import engine, get_db

# importando os routers
from src.services import users, vacations, rh
# 🚨 1. IMPORTANDO O SEU NOVO ARQUIVO DE E-MAIL
from src.routers import email 

app = FastAPI()

# 🚀 A Lista VIP (Onde o seu Front-end mora)
origins = [
    "http://localhost:3000", # Mantém pro seu PC continuar funcionando
    "https://fabric-hr-app.vercel.app" # Lindo, sem a barra!
]

# Configurando o Leão de Chácara (Middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Libera GET, POST, PUT, DELETE
    allow_headers=["*"],
)

# Cria as tabelas no banco de dados se elas não existirem
models.Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------
# ROTAS DO RH E CRUD DE USUÁRIOS
# ROTAS DO COLABORADOR & DO GESTOR (FÉRIAS)
# ---------------------------------------------------------

app.include_router(users.router)
app.include_router(vacations.router)
app.include_router(rh.router)

# 🚨 2. CONECTANDO O GUICHÊ DE E-MAIL NA API
# Coloquei o prefixo "/api" para a URL final ficar igual a que o Front-end chama: /api/gestor/dispatch
app.include_router(email.router, prefix="/api") 

@app.get("/")
def root():
    return {"message": "Bem-vindo ao FabricHR API! Explore as rotas para colaboradores, gestores e RH."}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(content=b"", media_type="image/x-icon")