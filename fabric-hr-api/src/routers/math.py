from datetime import datetime, timedelta, date


# Função para calcular os períodos aquisitivos e os dias disponíveis, levando em conta os dias já usados (FIFO)
class MathRHService:
    @staticmethod
    def calcular_periodos_aquisitivos(admissao, dias_usados):
        """Motor de cálculo de Período Aquisitivo (CLT)
        - Cada período é de 1 ano, começando na data de admissão.
        - A cada mês completo, o funcionário adquire 2.5 dias de férias.
        - O cálculo é feito em tempo real, considerando a data atual e os dias já usados (FIFO).
        """
        if not admissao: return []
        
        hoje = date.today()
        periodos = []
        data_inicio = admissao
        
        while data_inicio <= hoje:
            try:
                data_fim = data_inicio.replace(year=data_inicio.year + 1)
            except ValueError: # Tratamento S-Rank para Ano Bissexto (29 Fev)
                data_fim = data_inicio + timedelta(days=365)
            
            # Conta meses inteiros trabalhados neste período
            if hoje >= data_fim:
                meses_trabalhados = 12
            else:
                meses_trabalhados = (hoje.year - data_inicio.year) * 12 + (hoje.month - data_inicio.month)
                if hoje.day < data_inicio.day:
                    meses_trabalhados -= 1
                meses_trabalhados = max(0, meses_trabalhados)
            
            # 2.5 dias por mês completado
            dias_adquiridos = float(meses_trabalhados * 2.5)
            periodos.append({"label": f"{data_inicio.year}/{data_fim.year}", "available": dias_adquiridos})
            data_inicio = data_fim

        # Lógica de Auditoria ERP (FIFO): desconta os dias já gozados dos períodos mais antigos
        restante_usados = float(dias_usados) if dias_usados else 0.0
        for p in periodos:
            if restante_usados <= 0: break
            if restante_usados >= p["available"]:
                restante_usados -= p["available"]
                p["available"] = 0.0
            else:
                p["available"] -= restante_usados
                restante_usados = 0.0

        # Retorna apenas os períodos que ainda têm saldo
        return [p for p in periodos if p["available"] > 0]
