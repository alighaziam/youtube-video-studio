# One image: the editor and the API. Python 3.12 is already the local runtime.
# The editor is built in the first stage so Node does not stay in the running container.
FROM python:3.12-slim AS editor

RUN set -eu; \
    attempt=0; \
    until apt-get update; do \
      attempt=$((attempt + 1)); \
      if [ "$attempt" -ge 5 ]; then exit 1; fi; \
      echo "apt-get update failed (attempt ${attempt}), retrying"; \
      sleep 8; \
    done; \
    apt-get install -y --no-install-recommends ca-certificates nodejs npm; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN set -eu; \
    attempt=0; \
    until npm ci --no-audit --no-fund; do \
      attempt=$((attempt + 1)); \
      if [ "$attempt" -ge 3 ]; then exit 1; fi; \
      echo "npm ci failed (attempt ${attempt}), retrying"; \
      sleep 8; \
    done
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN set -eu; \
    attempt=0; \
    until apt-get update; do \
      attempt=$((attempt + 1)); \
      if [ "$attempt" -ge 5 ]; then exit 1; fi; \
      echo "apt-get update failed (attempt ${attempt}), retrying"; \
      sleep 8; \
    done; \
    apt-get install -y --no-install-recommends ca-certificates ffmpeg fontconfig fonts-dejavu-core; \
    rm -rf /var/lib/apt/lists/*; \
    fc-cache -f

WORKDIR /app

COPY backend/requirements.txt backend/requirements-voice.txt backend/
RUN set -eu; \
    attempt=0; \
    until pip install --no-cache-dir -r backend/requirements.txt -r backend/requirements-voice.txt; do \
      attempt=$((attempt + 1)); \
      if [ "$attempt" -ge 3 ]; then exit 1; fi; \
      echo "pip install failed (attempt ${attempt}), retrying"; \
      sleep 8; \
    done

COPY backend/app backend/app
COPY frontend/public/fonts frontend/public/fonts
COPY --from=editor /src/dist frontend/dist
COPY docker/serve.py docker/serve.py

EXPOSE 8000 5173

CMD ["python", "docker/serve.py"]
