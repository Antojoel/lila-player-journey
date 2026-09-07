# Pipeline: reads the raw .nakama-0 dataset and writes the static JSON + minimaps
# the web app consumes. One-shot batch job, not a service.
#
#   docker build -t lila-pipeline ./pipeline
#   docker run --rm \
#     -v /abs/path/to/player_data:/data:ro \
#     -v "$PWD/web/public":/out \
#     lila-pipeline
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY lib.py build.py verify_coords.py ./

# Raw dataset mounts read-only at /data; generated output goes to /out.
ENV PLAYER_DATA_DIR=/data \
    OUTPUT_DIR=/out \
    PYTHONUNBUFFERED=1

ENTRYPOINT ["python", "build.py"]
