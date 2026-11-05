# Hindsight Ops Console: Frontend

React (Vite) and Tailwind CSS dashboard for the incident command center.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dashboard expects the FastAPI bridge at
`http://localhost:8000`. To point elsewhere, copy `.env.example` to `.env`
and change `VITE_API_BASE_URL`.

## Using the dashboard

1. Pick a scenario (or write your own incident): target service, error signature, severity.
2. **Run triage and Hindsight analysis** sends the incident to n8n Webhook 1.
3. **Run auto-remediation** sends it to n8n Webhook 2, including the triage summary and root cause from step 2 when available.
4. The AI command output panel shows the parsed brief, matched past incidents, steps, and the raw n8n response.

**Demo mode** (header toggle) returns built-in sample responses without calling the backend, so you can
rehearse the walkthrough if the network or n8n is unavailable. Results are labeled "Demo data".

## Build

```bash
npm run build     # outputs to dist/
```
