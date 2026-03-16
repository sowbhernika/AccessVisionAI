#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="live-accessibility-assistant"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "Building container image..."
gcloud builds submit --tag "${IMAGE}" --project "${PROJECT_ID}" .

echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY:?Set GEMINI_API_KEY env var}" \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --session-affinity \
  --min-instances 1 \
  --max-instances 5 \
  --port 8080 \
  --project "${PROJECT_ID}"

URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format "value(status.url)" \
  --project "${PROJECT_ID}")

echo ""
echo "Deployed successfully!"
echo "URL: ${URL}"
