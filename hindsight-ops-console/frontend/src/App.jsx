import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  FlaskConical,
  History,
  ListChecks,
  Loader2,
  Radio,
  RotateCcw,
  ShieldAlert,
  Siren,
  Terminal,
  Wifi,
  WifiOff,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

/* -------------------------------------------------------------------------- */
/* Static config                                                              */
/* -------------------------------------------------------------------------- */

const WORKFLOWS = {
  1: {
    endpoint: "/api/trigger-incident-1",
    name: "Triage and Hindsight analysis",
    actionsTitle: "Recommended actions",
  },
  2: {
    endpoint: "/api/trigger-remediation-2",
    name: "Auto-remediation",
    actionsTitle: "Remediation steps",
  },
};

const SEVERITIES = [
  {
    id: "P0",
    label: "Critical",
    active: "border-red-400/60 bg-red-500/15 text-red-200 shadow-[0_0_16px_rgba(248,113,113,0.35)]",
  },
  {
    id: "P1",
    label: "High",
    active: "border-orange-400/60 bg-orange-500/15 text-orange-200 shadow-[0_0_16px_rgba(251,146,60,0.3)]",
  },
  {
    id: "P2",
    label: "Medium",
    active: "border-yellow-300/60 bg-yellow-400/10 text-yellow-100 shadow-[0_0_16px_rgba(253,224,71,0.22)]",
  },
  {
    id: "P3",
    label: "Low",
    active: "border-sky-400/60 bg-sky-500/15 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.25)]",
  },
];

const SEVERITY_CHIP = {
  P0: "border-red-400/40 bg-red-500/15 text-red-200",
  P1: "border-orange-400/40 bg-orange-500/15 text-orange-200",
  P2: "border-yellow-300/40 bg-yellow-400/10 text-yellow-100",
  P3: "border-sky-400/40 bg-sky-500/15 text-sky-200",
};

const STATUS = {
  idle: {
    label: "Standing by",
    dot: "bg-slate-400",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  },
  running: {
    label: "Workflow running",
    dot: "bg-amber-300",
    badge: "border-amber-300/40 bg-amber-400/10 text-amber-200 shadow-[0_0_18px_rgba(252,211,77,0.3)]",
  },
  success: {
    label: "Brief ready",
    dot: "bg-emerald-400",
    badge: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.3)]",
  },
  error: {
    label: "Run failed",
    dot: "bg-red-400",
    badge: "border-red-400/40 bg-red-500/10 text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.3)]",
  },
};

const LOG_STYLE = {
  info: "text-slate-300",
  success: "text-emerald-300",
  error: "text-red-300",
  warn: "text-amber-300",
};

const PRESETS = [
  {
    name: "Connection pool exhausted",
    service: "payments-api",
    severity: "P0",
    environment: "production",
    errorMessage:
      "FATAL: remaining connection slots are reserved for non-replication superuser connections. 5,200 requests waiting on pool, p99 latency 14s.",
  },
  {
    name: "Frontend crash after deploy",
    service: "checkout-web",
    severity: "P1",
    environment: "production",
    errorMessage:
      "Uncaught TypeError: Cannot read properties of undefined (reading 'items') at CartSummary.jsx:84. Error rate 18% since release 2026.11.04-3.",
  },
  {
    name: "Pod restart loop",
    service: "search-indexer",
    severity: "P2",
    environment: "staging",
    errorMessage: "OOMKilled: container exceeded 2Gi memory limit. Restarted 14 times in 30 minutes. Last exit code 137.",
  },
];

const DEMO_RESPONSES = {
  1: {
    summary:
      "Connection pool saturation on the primary database is causing cascading timeouts in the service. New checkouts are failing at roughly one in four requests.",
    root_cause:
      "A deploy 22 minutes ago raised worker concurrency from 40 to 120 without raising the database pool limit, so workers queue for connections until requests time out.",
    impact: "About 25% of payment attempts failing in production. No data loss detected.",
    severity: "P0",
    confidence: 0.91,
    similar_incidents: [
      {
        id: "INC-2291",
        title: "Pool exhaustion after worker scale-up",
        resolution: "Rolled back concurrency and raised max_connections through the pooler.",
        similarity: 0.93,
      },
      {
        id: "INC-1874",
        title: "Slow queries holding connections open",
        resolution: "Added a statement timeout and killed idle-in-transaction sessions.",
        similarity: 0.81,
      },
    ],
    recommended_actions: [
      "Roll back worker concurrency to 40 on payments-api",
      "Terminate idle-in-transaction sessions older than 60 seconds",
      "Raise pooler max connections after confirming database headroom",
      "Open a follow-up to tie worker concurrency to pool size in config",
    ],
  },
  2: {
    summary: "Remediation plan prepared from the matching runbook. Steps below are sample output for demo mode.",
    recommended_actions: [
      { title: "Scale worker concurrency back to 40", detail: "Applies the previous deployment config." },
      { title: "Drain idle database sessions", detail: "Frees pooled connections without restarting the service." },
      { title: "Verify error rate drops under 1%", detail: "Checks the five-minute window after each step." },
    ],
    commands: [
      "kubectl set env deploy/payments-api WORKER_CONCURRENCY=40",
      "psql -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle in transaction';\"",
    ],
  },
};

const TEXT_KEYS = ["output", "text", "response", "message", "result", "content"];
const SUMMARY_KEYS = ["summary", "triage_summary", "triage_brief", "brief", "incident_summary", "analysis"];
const ROOT_CAUSE_KEYS = ["root_cause", "rootCause", "cause"];
const IMPACT_KEYS = ["impact", "blast_radius"];
const MEMORY_KEYS = ["similar_incidents", "past_incidents", "related_incidents", "hindsight", "memories"];
const ACTION_KEYS = ["recommended_actions", "remediation_steps", "actions", "steps", "runbook"];
const COMMAND_KEYS = ["commands", "command"];

/* -------------------------------------------------------------------------- */
/* Response parsing helpers                                                   */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pick = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

function tryParse(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!/^[[{]/.test(cleaned)) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function toText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toText).join("\n");
  return JSON.stringify(value, null, 2);
}

function unwrap(data) {
  let d = data;
  if (typeof d === "string") d = { output: d };
  if (Array.isArray(d)) d = d.length === 1 ? d[0] : { items: d };
  if (d && typeof d === "object" && d.json && typeof d.json === "object") d = d.json;
  if (d && typeof d === "object") {
    // LLM nodes often return a JSON document as a string inside "output" / "text".
    for (const key of TEXT_KEYS) {
      const parsed = tryParse(d[key]);
      if (parsed && !Array.isArray(parsed)) d = { ...d, ...parsed };
    }
  }
  return d;
}

function toList(value) {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .map((title) => ({ title }));
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return { title: item };
      if (item && typeof item === "object") {
        const title = pick(item, ["title", "name", "incident", "incident_id", "id", "step", "action", "command"]);
        const detail = pick(item, ["description", "detail", "details", "summary", "resolution", "fix", "outcome", "content", "text"]);
        const meta = pick(item, ["similarity", "score", "confidence"]);
        return {
          title: title !== undefined ? String(title) : JSON.stringify(item),
          detail: detail !== undefined ? toText(detail) : undefined,
          meta,
        };
      }
      return { title: String(item) };
    });
  }
  if (typeof value === "object") return toList([value]);
  return [{ title: String(value) }];
}

function formatMeta(meta) {
  if (meta === undefined || meta === null) return null;
  const n = Number(meta);
  if (!Number.isNaN(n)) return n >= 0 && n <= 1 ? `${Math.round(n * 100)}% match` : String(n);
  return String(meta);
}

function normalizeBrief(data) {
  const d = unwrap(data);
  if (!d || typeof d !== "object") {
    return { summary: String(d ?? ""), rootCause: "", impact: "", memories: [], actions: [], commands: [] };
  }
  const narrative = pick(d, TEXT_KEYS);
  const plainNarrative = typeof narrative === "string" && !tryParse(narrative) ? narrative : "";
  const confidence = Number(pick(d, ["confidence", "confidence_score"]));
  return {
    stored: d.stored === true,
    incidentId: pick(d, ["incident_id", "incidentId"]),
    service: pick(d, ["service"]),
    summary: toText(pick(d, SUMMARY_KEYS)) || plainNarrative,
    rootCause: toText(pick(d, ROOT_CAUSE_KEYS)),
    impact: toText(pick(d, IMPACT_KEYS)),
    severity: pick(d, ["severity", "priority"]),
    confidence: Number.isNaN(confidence) ? undefined : confidence,
    memories: toList(pick(d, MEMORY_KEYS)),
    actions: toList(pick(d, ACTION_KEYS)),
    commands: toList(pick(d, COMMAND_KEYS)),
  };
}

function describeError(body, status) {
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => `${(e.loc || []).slice(1).join(".")}: ${e.msg}`).join("; ");
  if (detail?.message) return detail.upstream_body ? `${detail.message} Upstream said: ${detail.upstream_body}` : detail.message;
  return `Backend returned HTTP ${status}.`;
}

/* -------------------------------------------------------------------------- */
/* Small UI pieces                                                            */
/* -------------------------------------------------------------------------- */

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-violet-400/60 focus:outline-none";

function Panel({ title, icon: Icon, right, children, className = "" }) {
  return (
    <section className={`glass rounded-2xl ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          {Icon && <Icon className="h-4 w-4 text-violet-300" aria-hidden="true" />}
          {title}
        </h2>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatusBadge({ state }) {
  const s = STATUS[state];
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${s.badge}`}
    >
      <span className="relative flex h-2 w-2">
        {state === "running" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${s.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="hidden items-center gap-1.5 font-mono text-xs text-slate-400 sm:inline-flex">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {now.toLocaleTimeString([], { hour12: false })}
    </span>
  );
}

function Stages({ status }) {
  const steps = ["Request sent", "n8n workflow running", status === "error" ? "Run failed" : "Brief ready"];
  const reached = status === "idle" ? -1 : status === "running" ? 1 : 2;
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Run progress">
      {steps.map((label, i) => {
        const done = i < reached || (i === reached && status !== "running");
        const active = i === reached && status === "running";
        const failed = status === "error" && i === 2;
        const tone = failed
          ? "text-red-300"
          : done
            ? "text-emerald-300"
            : active
              ? "text-amber-200"
              : "text-slate-500";
        return (
          <li key={label} className={`flex items-center gap-2 ${tone}`}>
            {active ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : failed ? (
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : done ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-600" aria-hidden="true" />
            )}
            <span>{label}</span>
            {i < steps.length - 1 && <span className="h-px w-5 bg-white/10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-white/5 bg-ink-950/40 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Icon className="h-4 w-4 text-violet-300" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[92, 70, 84, 55].map((w, i) => (
        <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
      ))}
      <div className="skeleton mt-4 h-24 rounded-xl" />
    </div>
  );
}

function Brief({ result }) {
  const { brief, raw, workflow } = result;
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const rawText = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  const storedAcknowledgement = brief.stored === true;
  const hasContent =
    storedAcknowledgement ||
    brief.summary ||
    brief.rootCause ||
    brief.impact ||
    brief.memories.length ||
    brief.actions.length ||
    brief.commands.length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can be blocked; ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {brief.severity && (
          <span className={`rounded-full border px-2.5 py-1 font-medium ${SEVERITY_CHIP[brief.severity] || "border-white/10 text-slate-300"}`}>
            Assessed as {String(brief.severity)}
          </span>
        )}
        {brief.confidence !== undefined && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
            Confidence {brief.confidence <= 1 ? Math.round(brief.confidence * 100) : brief.confidence}%
          </span>
        )}
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
          {WORKFLOWS[workflow].name}
        </span>
        {result.demo && (
          <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2.5 py-1 text-violet-200">
            Demo data
          </span>
        )}
      </div>

      {brief.summary && (
        <Section title="Triage brief" icon={Terminal}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{brief.summary}</p>
        </Section>
      )}

      {(brief.rootCause || brief.impact) && (
        <div className="grid gap-4 md:grid-cols-2">
          {brief.rootCause && (
            <Section title="Likely root cause" icon={ShieldAlert}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{brief.rootCause}</p>
            </Section>
          )}
          {brief.impact && (
            <Section title="Impact" icon={Zap}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{brief.impact}</p>
            </Section>
          )}
        </div>
      )}

      {brief.memories.length > 0 && (
        <Section title="Hindsight memory matches" icon={History}>
          <ul className="space-y-2.5">
            {brief.memories.map((m, i) => (
              <li key={i} className="rounded-lg border border-violet-400/15 bg-violet-500/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-100">{m.title}</p>
                  {formatMeta(m.meta) && (
                    <span className="shrink-0 rounded-full border border-violet-400/30 px-2 py-0.5 font-mono text-[11px] text-violet-200">
                      {formatMeta(m.meta)}
                    </span>
                  )}
                </div>
                {m.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{m.detail}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {brief.actions.length > 0 && (
        <Section title={WORKFLOWS[workflow].actionsTitle} icon={ListChecks}>
          <ol className="space-y-2.5">
            {brief.actions.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 font-mono text-[11px] text-emerald-200">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm text-slate-200">{a.title}</p>
                  {a.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-400">{a.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {brief.commands.length > 0 && (
        <Section title="Commands" icon={Terminal}>
          <div className="space-y-2">
            {brief.commands.map((c, i) => (
              <pre key={i} className="overflow-x-auto rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-xs text-emerald-200">
                {c.title}
              </pre>
            ))}
          </div>
        </Section>
      )}

      {storedAcknowledgement && (
        <Section title="Incident stored" icon={CheckCircle2}>
          <p className="text-sm leading-relaxed text-slate-300">
            n8n confirmed this incident was saved
            {brief.service ? ` for ${brief.service}` : ""}
            {brief.incidentId ? ` (${brief.incidentId})` : ""}.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {workflow === 2
              ? "The webhook did not return a remediation plan."
              : "The webhook did not return a triage brief or memory matches."}
          </p>
        </Section>
      )}

      {!hasContent && !storedAcknowledgement && (
        <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-4 text-sm text-amber-100">
          n8n responded, but no known fields (summary, root_cause, recommended_actions, similar_incidents) were found. The full response is shown below.
        </p>
      )}

      <div className="rounded-xl border border-white/5 bg-ink-950/40">
        <div className="flex items-center justify-between px-4 py-2.5">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw || !hasContent}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showRaw || !hasContent ? "rotate-180" : ""}`} aria-hidden="true" />
            Raw n8n response
          </button>
          <button type="button" onClick={copy} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {(showRaw || !hasContent) && (
          <pre className="max-h-72 overflow-auto border-t border-white/5 px-4 py-3 font-mono text-xs text-slate-300">{rawText}</pre>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

const newIncidentId = () => `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;

export default function App() {
  const [form, setForm] = useState({
    service: "payments-api",
    errorMessage: PRESETS[0].errorMessage,
    severity: "P0",
    environment: "production",
  });
  const [incidentId, setIncidentId] = useState(newIncidentId);
  const [status, setStatus] = useState("idle");
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [result, setResult] = useState(null);
  const [triage, setTriage] = useState(null);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [health, setHealth] = useState({ online: null, webhooks: null });
  const [runs, setRuns] = useState(0);
  const [lastMs, setLastMs] = useState(null);
  const [logs, setLogs] = useState([]);
  const logId = useRef(0);

  const addLog = useCallback((level, message) => {
    logId.current += 1;
    const entry = { id: logId.current, level, message, time: new Date().toLocaleTimeString([], { hour12: false }) };
    setLogs((prev) => [entry, ...prev].slice(0, 40));
  }, []);

  // Poll backend health so the header reflects whether the bridge and webhooks are ready.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        const body = await res.json();
        if (!cancelled) setHealth({ online: res.ok, webhooks: body.webhooks_configured });
      } catch {
        if (!cancelled) setHealth({ online: false, webhooks: null });
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    addLog("info", "Console ready. Choose a scenario or describe an incident to begin.");
  }, [addLog]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const applyPreset = (preset) => {
    setForm({
      service: preset.service,
      errorMessage: preset.errorMessage,
      severity: preset.severity,
      environment: preset.environment,
    });
    setFormError(null);
    addLog("info", `Loaded scenario: ${preset.name}`);
  };

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setTriage(null);
    setError(null);
    setActiveWorkflow(null);
    setIncidentId(newIncidentId());
    addLog("info", "Started a new incident. Previous triage context cleared.");
  };

  const run = async (workflow) => {
    if (status === "running") return;
    if (!form.service.trim() || !form.errorMessage.trim()) {
      setFormError("Enter a target service and an error message before running a workflow.");
      return;
    }
    setFormError(null);
    setError(null);
    setStatus("running");
    setActiveWorkflow(workflow);

    const wf = WORKFLOWS[workflow];
    addLog("info", `Sending ${form.severity} incident for ${form.service} to ${wf.name}.`);
    const started = performance.now();

    const payload = {
      service: form.service.trim(),
      error_message: form.errorMessage.trim(),
      severity: form.severity,
      environment: form.environment,
      incident_id: incidentId,
    };
    if (workflow === 2 && triage) {
      payload.triage_summary = triage.summary || undefined;
      payload.root_cause = triage.rootCause || undefined;
    }

    try {
      let envelope;
      if (demoMode) {
        await sleep(1600);
        envelope = { data: DEMO_RESPONSES[workflow] };
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 100000);
        try {
          const res = await fetch(`${API_BASE}${wf.endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) throw new Error(describeError(body, res.status));
          envelope = body;
        } finally {
          clearTimeout(timer);
        }
      }

      const durationMs = Math.round(performance.now() - started);
      const brief = normalizeBrief(envelope.data);
      setResult({ workflow, brief, raw: envelope.data, durationMs, demo: demoMode });
      if (workflow === 1) setTriage({ summary: brief.summary, rootCause: brief.rootCause });
      setRuns((n) => n + 1);
      setLastMs(durationMs);
      setStatus("success");
      addLog("success", `${wf.name} finished in ${(durationMs / 1000).toFixed(1)}s.`);
      if (brief.memories.length) addLog("info", `Hindsight surfaced ${brief.memories.length} related past incident(s).`);
    } catch (err) {
      let message = err.message || "Unexpected error.";
      if (err.name === "AbortError") message = "The request timed out after 100 seconds.";
      else if (err instanceof TypeError) message = `Cannot reach the backend at ${API_BASE}. Start it with "python main.py" or turn on demo mode.`;
      setError(message);
      setStatus("error");
      addLog("error", message);
    }
  };

  const running = status === "running";
  const webhooksReady = health.webhooks && health.webhooks.incident_1 && health.webhooks.remediation_2;

  return (
    <div className="relative min-h-screen overflow-x-hidden text-slate-200">
      <div className="orb orb-a" aria-hidden="true" />
      <div className="orb orb-b" aria-hidden="true" />

      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/15 shadow-[0_0_20px_rgba(139,124,255,0.35)]">
              <Siren className="h-5 w-5 text-violet-200" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-white">Hindsight Ops Console</h1>
              <p className="text-xs text-slate-400">Incident triage and auto-remediation with memory</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                health.online
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : health.online === false
                    ? "border-red-400/30 bg-red-500/10 text-red-200"
                    : "border-white/10 text-slate-400"
              }`}
            >
              {health.online === false ? <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Wifi className="h-3.5 w-3.5" aria-hidden="true" />}
              {health.online ? (webhooksReady ? "API online, webhooks set" : "API online, webhooks missing") : health.online === false ? "API offline" : "Checking API"}
            </span>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="h-3.5 w-3.5 accent-violet-400"
              />
              <FlaskConical className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
              Demo mode
            </label>
            <LiveClock />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <Panel
            title="Incident simulator"
            icon={Activity}
            right={<span className="font-mono text-xs text-slate-400">{incidentId}</span>}
          >
            <div className="mb-4 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-violet-400/40 hover:text-white"
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label htmlFor="service" className="mb-1.5 block text-xs text-slate-400">
                    Target service
                  </label>
                  <input id="service" className={`${fieldClass} font-mono`} value={form.service} onChange={update("service")} placeholder="payments-api" />
                </div>
                <div>
                  <label htmlFor="env" className="mb-1.5 block text-xs text-slate-400">
                    Environment
                  </label>
                  <select id="env" className={fieldClass} value={form.environment} onChange={update("environment")}>
                    <option value="production">production</option>
                    <option value="staging">staging</option>
                    <option value="development">development</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="error" className="mb-1.5 block text-xs text-slate-400">
                  Error signature or message
                </label>
                <textarea
                  id="error"
                  rows={4}
                  className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
                  value={form.errorMessage}
                  onChange={update("errorMessage")}
                  placeholder="Paste the log line, stack trace, or alert text"
                />
              </div>

              <fieldset>
                <legend className="mb-1.5 text-xs text-slate-400">Severity</legend>
                <div className="grid grid-cols-4 gap-2">
                  {SEVERITIES.map((s) => {
                    const selected = form.severity === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setForm((f) => ({ ...f, severity: s.id }))}
                        className={`rounded-lg border px-2 py-2 text-center transition-all ${
                          selected ? s.active : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{s.id}</span>
                        <span className="block text-[11px]">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {formError && (
                <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {formError}
                </p>
              )}

              <div className="grid gap-3 pt-1">
                <button
                  type="button"
                  disabled={running}
                  onClick={() => run(1)}
                  className="group flex items-center gap-3 rounded-xl border border-violet-400/40 bg-violet-500/15 px-4 py-3 text-left shadow-[0_0_24px_rgba(139,124,255,0.18)] transition-all hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running && activeWorkflow === 1 ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-200" aria-hidden="true" />
                  ) : (
                    <Brain className="h-5 w-5 shrink-0 text-violet-200" aria-hidden="true" />
                  )}
                  <span>
                    <span className="block text-sm font-semibold text-white">Run triage and Hindsight analysis</span>
                    <span className="block text-xs text-slate-400">Webhook 1. Classifies the incident and recalls similar past incidents.</span>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={running}
                  onClick={() => run(2)}
                  className="group flex items-center gap-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-left shadow-[0_0_24px_rgba(52,211,153,0.12)] transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running && activeWorkflow === 2 ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-emerald-200" aria-hidden="true" />
                  ) : (
                    <Wrench className="h-5 w-5 shrink-0 text-emerald-200" aria-hidden="true" />
                  )}
                  <span>
                    <span className="block text-sm font-semibold text-white">Run auto-remediation</span>
                    <span className="block text-xs text-slate-400">
                      Webhook 2. Applies runbooks{triage ? " using the triage result from this incident." : "."}
                    </span>
                  </span>
                </button>
              </div>

              <button type="button" onClick={reset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Start a new incident
              </button>
            </div>
          </Panel>

          <Panel title="Activity feed" icon={Radio}>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1 font-mono text-xs" aria-live="polite">
              {logs.map((l) => (
                <li key={l.id} className={`feed-item flex gap-3 ${LOG_STYLE[l.level]}`}>
                  <span className="shrink-0 text-slate-500">{l.time}</span>
                  <span>{l.message}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-7">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Workflow runs", value: runs },
              { label: "Last response", value: lastMs === null ? "None yet" : `${(lastMs / 1000).toFixed(1)}s` },
              { label: "Triage context", value: triage ? "Ready for remediation" : "Not captured" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-xl px-4 py-3">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="mt-1 truncate text-lg font-semibold text-white">{s.value}</p>
              </div>
            ))}
          </div>

          <Panel
            title="AI command output"
            icon={Terminal}
            right={<StatusBadge state={status} />}
            className="min-h-[28rem]"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <Stages status={status} />
              {result && status === "success" && (
                <span className="font-mono text-xs text-slate-400">{(result.durationMs / 1000).toFixed(2)}s</span>
              )}
            </div>

            {status === "idle" && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <Brain className="h-9 w-9 text-slate-600" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-300">No brief yet</p>
                <p className="max-w-sm text-sm text-slate-500">
                  Pick a scenario on the left and run triage. The brief from n8n, including matches from Hindsight memory, will appear here.
                </p>
              </div>
            )}

            {status === "running" && (
              <div>
                <p className="mb-4 text-sm text-slate-400">Waiting for n8n to finish {WORKFLOWS[activeWorkflow].name.toLowerCase()}.</p>
                <Skeleton />
              </div>
            )}

            {status === "error" && (
              <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  The workflow did not complete
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-red-100/90">{error}</p>
                <p className="mt-3 text-xs text-slate-400">
                  Check that the backend is running, both n8n webhook URLs are set in backend/main.py, and the n8n workflows are active.
                  Demo mode lets you rehearse without n8n.
                </p>
              </div>
            )}

            {status === "success" && result && <Brief result={result} />}
          </Panel>
        </div>
      </main>
    </div>
  );
}
