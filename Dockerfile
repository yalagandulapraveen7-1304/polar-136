# Dockerfile for PolarOPS backend (Render deployment)
FROM python:3.12-slim

# Install system dependencies (gcc and libgomp1 required for LightGBM OpenMP)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies with memory-efficient flags
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefer-binary -r requirements.txt

# Copy only the backend source code
COPY backend/ ./backend/
COPY requirements.txt ./

# Default fallback port (Render injects $PORT at runtime)
ENV PORT=10000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
