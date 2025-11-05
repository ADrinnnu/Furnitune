FROM python:3.10-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./app.py
COPY model.py ./model.py
COPY artifacts ./artifacts
COPY web ./web

# If you want signed gs:// URLs in responses, uncomment these two lines
# COPY serviceAccountKey.json /app/serviceAccountKey.json
# ENV GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccountKey.json

ENV PORT=8080
EXPOSE 8080
CMD ["gunicorn", "-w", "1", "-k", "gthread", "-b", "0.0.0.0:8080", "app:app"]
