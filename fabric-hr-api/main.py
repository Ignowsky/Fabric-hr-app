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


app = FastAPI(title="FabricHR Enterprise API")

# Cria as tabelas no banco de dados se elas não existirem
models.Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# ROTAS DO RH E CRUD DE USUÁRIOS
# ROTAS DO COLABORADOR & DO GESTOR (FÉRIAS)
# ---------------------------------------------------------

app.include_router(users.router)
app.include_router(vacations.router)
app.include_router(rh.router)

@app.get("/")
def root():
    return {"message": "Bem-vindo ao FabricHR API! Explore as rotas para colaboradores, gestores e RH."}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(content=b"", media_type="image/x-icon")

# ---------------------------------------------------------
# NOVO: MOTOR DE MÉTRICAS GLOBAIS DO RH
# ---------------------------------------------------------

# ---------------------------------------------------------
# MOTOR DE DISPARO DE E-MAILS
# --------------------------------------------------------
# -
