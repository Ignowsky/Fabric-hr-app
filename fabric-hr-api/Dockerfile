FROM python:3.11-slim

WORKDIR /app

# Dependências de sistema (Essencial para o Postgres e MSAL/Cryptography)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# 🚀 Upgrade do PIP e instalação das libs críticas direto no motor
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir fastapi uvicorn sqlalchemy msal python-dotenv

# Copia o requirements que a gente limpou agora
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o resto do código
COPY . .

EXPOSE 8000

# Usamos o python -m pra garantir que o PATH não se perca no container
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]