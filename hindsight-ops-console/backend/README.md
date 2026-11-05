# Hindsight Ops Console: Backend

FastAPI bridge between the React dashboard and your two n8n production webhooks.
Webhook URLs stay on the server and never reach the browser.

## Endpoints

| Method | Path                           | Forwards to                              |
|--------|--------------------------------|------------------------------------------|
| POST   | `/api/trigger-incident-1`      | n8n Webhook 1: triage and Hindsight memory |
| POST   | `/api/trigger-remediation-2`   | n8n Webhook 2: auto-remediation / runbooks |
| GET    | `/api/health`                  | Backend and webhook configuration status |

Interactive docs: http://localhost:8000/docs

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Configure your n8n webhooks

Set `N8N_WEBHOOK_1_URL` and `N8N_WEBHOOK_2_URL` in `backend/.env.local`:

```dotenv
N8N_WEBHOOK_1_URL=https://your-n8n/webhook/your-triage-path
N8N_WEBHOOK_2_URL=https://your-n8n/webhook/your-remediation-path
```

The backend loads `.env.local` at startup. Existing process environment variables take
precedence. Alternatively, export the variables before starting the backend (see `.env.example`).

```bash
export N8N_WEBHOOK_1_URL="https://your-n8n/webhook/..."
export N8N_WEBHOOK_2_URL="https://your-n8n/webhook/..."
```

Use the **Production URL** of each Webhook node (not the Test URL) and make sure the workflow is **Active**.
Set the Webhook node's HTTP method to **POST**, and for the dashboard to show a result, set
"Respond" to **When Last Node Finishes** (or use a Respond to Webhook node).

## Run

```bash
python main.py
```

The API starts on http://localhost:8000 (override with `PORT`).

## Payload n8n receives

```json
{
  "service": "payments-api",
  "error_message": "FATAL: remaining connection slots ...",
  "severity": "P0",
  "environment": "production",
  "incident_id": "INC-4F2K9A",
  "context": null,
  "source": "hindsight-ops-console",
  "triggered_at": "2026-11-04T10:15:00+00:00"
}
```

Webhook 2 additionally receives `triage_summary` and `root_cause` when triage ran first for the same incident.

## Response shape the dashboard understands

The dashboard renders any JSON, but displays these fields as a structured brief when present
(also when they arrive as a JSON string inside `output` or `text`, as LLM nodes often return):

`summary` (or `triage_brief`), `root_cause`, `impact`, `severity`, `confidence`,
`similar_incidents` (items with `id`/`title`, `resolution`, `similarity`),
`recommended_actions`, `commands`.

A storage-only acknowledgment such as `{"stored": true, "incident_id": "...", "service": "..."}`
is displayed as an incident-saved confirmation. It does not contain a triage brief or remediation
plan; return the structured fields above from the n8n workflow to display those results.
