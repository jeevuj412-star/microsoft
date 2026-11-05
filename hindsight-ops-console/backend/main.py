"""
Hindsight Ops Console - FastAPI bridge server
=============================================

Receives incident payloads from the React dashboard and forwards them to two
n8n production webhooks:

  POST /api/trigger-incident-1     -> n8n Webhook 1 (Triage + Hindsight memory analysis)
  POST /api/trigger-remediation-2  -> n8n Webhook 2 (Auto-remediation / runbooks)

Keeping the webhook URLs on the server means they never reach the browser.

Run:  python main.py        (or)   uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).with_name(".env.local"))

# ---------------------------------------------------------------------------
# CONFIGURATION
# Replace the two placeholder URLs below with your n8n PRODUCTION webhook URLs
# (n8n -> Webhook node -> "Production URL"), or export them as environment
# variables so no secrets live in the source file.
# ---------------------------------------------------------------------------
N8N_WEBHOOK_1_URL = os.getenv(
    "N8N_WEBHOOK_1_URL",
    "https://YOUR-N8N-HOST/webhook/REPLACE-WITH-TRIAGE-WEBHOOK-PATH",
)
N8N_WEBHOOK_2_URL = os.getenv(
    "N8N_WEBHOOK_2_URL",
    "https://YOUR-N8N-HOST/webhook/REPLACE-WITH-REMEDIATION-WEBHOOK-PATH",
)

# Optional: if your n8n Webhook nodes use "Header Auth", set both of these.
N8N_AUTH_HEADER_NAME = os.getenv("N8N_AUTH_HEADER_NAME", "")
N8N_AUTH_HEADER_VALUE = os.getenv("N8N_AUTH_HEADER_VALUE", "")

# LLM-backed workflows can be slow; give n8n plenty of time to respond.
REQUEST_TIMEOUT_SECONDS = float(os.getenv("N8N_TIMEOUT_SECONDS", "90"))

# Comma-separated list of allowed browser origins. "*" is fine for a hackathon.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

PLACEHOLDER_MARKERS = ("YOUR-N8N-HOST", "REPLACE-WITH")


def is_configured(url: str) -> bool:
    """True once the placeholder has been replaced with a real http(s) URL."""
    return url.startswith(("http://", "https://")) and not any(m in url for m in PLACEHOLDER_MARKERS)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class IncidentPayload(BaseModel):
    """Payload sent to n8n Webhook 1 (triage + Hindsight analysis)."""

    service: str = Field(..., min_length=1, max_length=120, description="Target service name")
    error_message: str = Field(..., min_length=1, max_length=8000, description="Error signature / log line")
    severity: Literal["P0", "P1", "P2", "P3"] = "P1"
    environment: str = Field("production", max_length=40)
    incident_id: Optional[str] = Field(None, max_length=64)
    context: Optional[dict[str, Any]] = None


class RemediationPayload(IncidentPayload):
    """Payload sent to n8n Webhook 2. Optionally carries the triage output."""

    triage_summary: Optional[str] = Field(None, max_length=8000)
    root_cause: Optional[str] = Field(None, max_length=4000)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Hindsight Ops Console API",
    description="Bridge between the incident dashboard and n8n workflows.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def forward_to_n8n(workflow: str, url: str, body: dict[str, Any]) -> dict[str, Any]:
    """POST `body` to an n8n webhook and return a normalized envelope."""
    if not is_configured(url):
        raise HTTPException(
            status_code=503,
            detail={
                "message": (
                    f"The n8n webhook for '{workflow}' is not configured. Set the "
                    "N8N_WEBHOOK_1_URL / N8N_WEBHOOK_2_URL environment variables or edit "
                    "the placeholders at the top of backend/main.py."
                ),
                "workflow": workflow,
            },
        )

    headers = {"Content-Type": "application/json"}
    if N8N_AUTH_HEADER_NAME and N8N_AUTH_HEADER_VALUE:
        headers[N8N_AUTH_HEADER_NAME] = N8N_AUTH_HEADER_VALUE

    outgoing = {
        **body,
        "source": "hindsight-ops-console",
        "triggered_at": datetime.now(timezone.utc).isoformat(),
    }

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(REQUEST_TIMEOUT_SECONDS, connect=10.0)) as client:
            response = await client.post(url, json=outgoing, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail={
                "message": f"n8n did not respond within {REQUEST_TIMEOUT_SECONDS:.0f}s for '{workflow}'.",
                "workflow": workflow,
            },
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": f"Could not reach n8n for '{workflow}': {exc.__class__.__name__}.",
                "workflow": workflow,
            },
        )

    duration_ms = round((time.perf_counter() - started) * 1000)

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "message": f"n8n returned HTTP {response.status_code} for '{workflow}'.",
                "workflow": workflow,
                "upstream_body": response.text[:1500],
            },
        )

    # n8n may answer with JSON, plain text, or an empty body (immediate-response mode).
    text = response.text.strip()
    if not text:
        data: Any = {"message": "Workflow accepted by n8n (the response body was empty)."}
    else:
        try:
            data = response.json()
        except ValueError:
            data = {"output": text}

    return {
        "ok": True,
        "workflow": workflow,
        "status_code": response.status_code,
        "duration_ms": duration_ms,
        "data": data,
    }


@app.get("/api/health")
async def health() -> dict[str, Any]:
    """Used by the dashboard to show backend + webhook readiness."""
    return {
        "status": "ok",
        "webhooks_configured": {
            "incident_1": is_configured(N8N_WEBHOOK_1_URL),
            "remediation_2": is_configured(N8N_WEBHOOK_2_URL),
        },
    }


@app.post("/api/trigger-incident-1")
async def trigger_incident_1(payload: IncidentPayload) -> dict[str, Any]:
    """Webhook 1: triage + Hindsight memory analysis."""
    return await forward_to_n8n("triage-and-memory", N8N_WEBHOOK_1_URL, payload.model_dump())


@app.post("/api/trigger-remediation-2")
async def trigger_remediation_2(payload: RemediationPayload) -> dict[str, Any]:
    """Webhook 2: auto-remediation / runbooks."""
    return await forward_to_n8n("auto-remediation", N8N_WEBHOOK_2_URL, payload.model_dump())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
