FROM python:3.12-slim

# Keep Python from writing .pyc files and buffering stdout — the latter matters so
# `docker logs` shows output as it happens, not only after the process exits.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies are copied and installed BEFORE the rest of the source code. Docker caches
# each instruction as a layer; as long as requirements.txt doesn't change, this layer is
# reused on every rebuild instead of reinstalling everything just because a source file
# changed. This is the single biggest thing that makes Docker rebuilds fast in practice.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Don't run the app as root inside the container — standard container-security practice.
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
