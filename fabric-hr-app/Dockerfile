# 🚀 MUDANÇA S-RANK: De 18-alpine para 20-alpine
FROM node:20-alpine

WORKDIR /app

# Copia arquivos de dependência
COPY package*.json ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_FONT_GOOGLE_MOCKED=true
ENV DISABLE_ESLINT_PLUS_TYPECHECK=1

RUN npm install

# Copia o resto do código
COPY . .

# Ignora erros de rede das fontes do Google se houver
ENV NEXT_FONT_GOOGLE_MOCKED=true

# Build do Next.js para produção
RUN npm run build

# Expõe a porta do Next
EXPOSE 3000

# Inicia a aplicação
CMD ["npm", "start"]