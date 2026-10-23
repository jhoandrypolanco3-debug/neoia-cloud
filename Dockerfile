FROM python:3.12-slim

WORKDIR /app

# Copia el servidor y las paginas
COPY server.py ./
COPY public ./public

ENV PYTHONUNBUFFERED=1
ENV PORT=8080

EXPOSE 8080

# Solo biblioteca estandar: no hace falta pip install
CMD ["python", "server.py"]
