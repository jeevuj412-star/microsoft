# Hindsight Ops Console

Autonomous DevOps incident management with Hindsight memory.
Built for Hack With Bangalore 4.0.

```
React dashboard  ->  FastAPI bridge  ->  n8n webhooks (Groq + vector memory)
 (frontend/)          (backend/)          1. triage + memory   2. remediation
```

## Quick start

```bash
# Terminal 1: backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export N8N_WEBHOOK_1_URL="https://your-n8n/webhook/..."
export N8N_WEBHOOK_2_URL="https://your-n8n/webhook/..."
python main.py

# Terminal 2: frontend
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. See `backend/README.md` and `frontend/README.md` for details.
