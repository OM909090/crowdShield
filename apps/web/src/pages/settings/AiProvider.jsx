import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  Sparkles,
  Server,
  KeyRound,
  Cpu,
  Tag,
  Lock,
  RefreshCw,
  Zap,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import api from "../../utils/axios";
import GoogleMapsCard from "../../components/settings/GoogleMapsCard";

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-300";

// Friendly, kind-keyed copy for discovery failures (server message is a fallback).
const DISCOVER_MESSAGES = {
  auth: "Authentication failed — check your API key.",
  unreachable: "Couldn't reach that URL — check the base URL.",
  bad_response: "That endpoint didn't return a model list.",
};

const STATUS_META = {
  ok: {
    label: "Connected",
    cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    Icon: CheckCircle2,
  },
  error: {
    label: "Error",
    cls: "border-red-400/30 bg-red-500/10 text-red-300",
    Icon: AlertTriangle,
  },
  unconfigured: {
    label: "Not configured",
    cls: "border-slate-500/30 bg-slate-500/10 text-slate-400",
    Icon: Server,
  },
};

const looksLikeUrl = (v) => /^https?:\/\//i.test(v.trim());

const formatWhen = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function AiProvider() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null); // masked shape from the server, or null

  // form fields
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState(""); // a freshly typed key (never hydrated from server)
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("");

  // discovery state
  const [models, setModels] = useState([]); // [{ id }]
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState(null); // { kind, message }
  const [manualModel, setManualModel] = useState(false); // bad_response fallback

  // key-on-file handling
  const [replacingKey, setReplacingKey] = useState(false);

  // async button states
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedModelRef = useRef("");

  const keyOnFile = Boolean(config?.hasKey);
  const showKeyInput = !keyOnFile || replacingKey;

  // Hydrate once on mount. Every state update happens after the await (never
  // synchronously in the effect body), so we don't trigger cascading renders.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/ai/provider");
        if (!active) return;
        const cfg = res.data?.config || null;
        setConfig(cfg);
        if (cfg) {
          setBaseUrl(cfg.baseUrl || "");
          setLabel(cfg.label || "");
          setModel(cfg.model || "");
          savedModelRef.current = cfg.model || "";
          // Seed the dropdown with the saved model so it's visible/selectable
          // without forcing a re-discovery (which would need the key re-typed).
          setModels(cfg.model ? [{ id: cfg.model }] : []);
        }
      } catch (err) {
        if (active) toast.error(err.response?.data?.message || "Failed to load provider settings");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Lightweight refresh of just the stored-config metadata (status / lastTestedAt),
  // without disturbing anything the user is currently editing.
  const refreshConfigMeta = useCallback(async () => {
    try {
      const res = await api.get("/ai/provider");
      setConfig(res.data?.config || null);
    } catch {
      /* keep last known metadata */
    }
  }, []);

  const applyDiscoverError = (kind, serverMessage) => {
    const message = DISCOVER_MESSAGES[kind] || serverMessage || "Discovery failed. Please try again.";
    setDiscoverError({ kind, message });
    // Only the "bad_response" case reveals the manual model entry so an unusual
    // provider is never a dead end. auth/unreachable keep any seeded option.
    if (kind === "bad_response") {
      setManualModel(true);
      setModels([]);
    } else {
      setManualModel(false);
    }
  };

  const runDiscover = useCallback(async () => {
    const url = baseUrl.trim();
    const key = apiKey.trim();
    if (!url || !key) {
      toast.error("Enter a base URL and API key to discover models");
      return;
    }

    setDiscovering(true);
    setDiscoverError(null);
    try {
      const res = await api.post("/ai/provider/discover", { baseUrl: url, apiKey: key });
      const data = res.data || {};
      if (data.ok) {
        const list = Array.isArray(data.models) ? data.models.filter((m) => m && m.id) : [];
        const ids = list.map((m) => m.id);
        setModels(list);
        setManualModel(false);
        setModel((prev) => {
          if (prev && ids.includes(prev)) return prev;
          if (savedModelRef.current && ids.includes(savedModelRef.current)) return savedModelRef.current;
          return ids[0] || "";
        });
        toast.success(`Found ${ids.length} model${ids.length === 1 ? "" : "s"}`);
      } else {
        applyDiscoverError(data.kind, data.message);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.kind) applyDiscoverError(data.kind, data.message);
      else applyDiscoverError("unreachable", data?.message);
    } finally {
      setDiscovering(false);
    }
  }, [baseUrl, apiKey]);

  // Auto-trigger discovery when the key field is blurred and both fields look ready.
  const handleKeyBlur = () => {
    if (!discovering && looksLikeUrl(baseUrl) && apiKey.trim()) {
      runDiscover();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.post("/ai/provider/test");
      const { ok, message } = res.data || {};
      if (ok) toast.success(message || "Connection successful");
      else toast.error(message || "Connection failed");
      await refreshConfigMeta();
    } catch (err) {
      toast.error(err.response?.data?.message || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const canSave = Boolean(baseUrl.trim() && model.trim()) && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    const payload = { baseUrl: baseUrl.trim(), model: model.trim() };
    const trimmedLabel = label.trim();
    if (trimmedLabel) payload.label = trimmedLabel;
    // Omit apiKey to keep the already-stored key; only send a freshly typed one.
    const typedKey = apiKey.trim();
    if (typedKey) payload.apiKey = typedKey;

    setSaving(true);
    try {
      const res = await api.post("/ai/provider", payload);
      const cfg = res.data?.config || null;
      // Re-hydrate the visible state from the authoritative masked config.
      setConfig(cfg);
      if (cfg) {
        setBaseUrl(cfg.baseUrl || "");
        setLabel(cfg.label || "");
        setModel(cfg.model || "");
        savedModelRef.current = cfg.model || "";
        if (cfg.model) {
          setModels((prev) => (prev.some((m) => m.id === cfg.model) ? prev : [{ id: cfg.model }]));
        }
      }
      setApiKey("");
      setReplacingKey(false);
      toast.success("Provider saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not save provider");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-400">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  const statusKey = config?.status && STATUS_META[config.status] ? config.status : "unconfigured";
  const status = STATUS_META[statusKey];
  const StatusIcon = status.Icon;
  const lastTested = formatWhen(config?.lastTestedAt);
  const modelsReady = models.length > 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-3xl">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft size={15} />
          Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
            <Sparkles className="h-4 w-4" />
            AI Assistant Settings
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">LLM provider</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Connect an OpenAI-compatible endpoint that powers the CrowdShield assistant. Paste the
            base URL and API key, pick a model from the ones we discover, then test and save.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 sm:p-7"
        >
          {/* Status row */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${status.cls}`}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {status.label}
              </span>
              {config?.label && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
                  <Tag className="h-3.5 w-3.5" />
                  {config.label}
                </span>
              )}
            </div>
            {lastTested && (
              <p className="text-xs text-slate-500">Last tested {lastTested}</p>
            )}
          </div>

          <div className="space-y-4">
            {/* Base URL */}
            <div>
              <label htmlFor="ai-base-url" className={labelClass}>
                Base URL
              </label>
              <div className="relative">
                <Server className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="ai-base-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://api.openai.com/v1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className={`pl-11 ${inputClass}`}
                />
              </div>
            </div>

            {/* API Key */}
            <div>
              <label htmlFor="ai-api-key" className={labelClass}>
                API Key
              </label>
              {showKeyInput ? (
                <>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="ai-api-key"
                      type="password"
                      autoComplete="new-password"
                      placeholder={keyOnFile ? "Enter a new key to replace the stored one" : "sk-..."}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onBlur={handleKeyBlur}
                      className={`pl-11 ${inputClass}`}
                    />
                  </div>
                  {keyOnFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingKey(false);
                        setApiKey("");
                      }}
                      className="mt-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
                    >
                      Keep the stored key instead
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <Lock className="h-4 w-4 text-emerald-300" />
                    <span className="font-mono tracking-widest text-slate-400">••••••••</span>
                    configured
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingKey(true);
                      setApiKey("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/15"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Replace key
                  </button>
                </div>
              )}
            </div>

            {/* Discover */}
            <div>
              <motion.button
                type="button"
                onClick={runDiscover}
                disabled={discovering || !baseUrl.trim() || !apiKey.trim()}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {discovering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Discovering models...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Discover models
                  </>
                )}
              </motion.button>
              {!showKeyInput && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Discovery needs your key — choose “Replace key” above to re-list models.
                </p>
              )}
              {discoverError && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2.5 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{discoverError.message}</span>
                </div>
              )}
            </div>

            {/* Model */}
            <div>
              <label htmlFor={manualModel ? "ai-model-manual" : "ai-model"} className={labelClass}>
                Model
              </label>
              {manualModel ? (
                <>
                  <div className="relative">
                    <Cpu className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="ai-model-manual"
                      type="text"
                      autoComplete="off"
                      placeholder="Type the model id, e.g. gpt-4o-mini"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className={`pl-11 ${inputClass}`}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    We couldn’t list models automatically — enter the model id manually.
                  </p>
                </>
              ) : (
                <div className="relative">
                  <Cpu className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="ai-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={!modelsReady}
                    className={`appearance-none pl-11 ${inputClass}`}
                  >
                    {!modelsReady ? (
                      <option value="">Discover models to choose one</option>
                    ) : (
                      <>
                        {!model && <option value="">Select a model</option>}
                        {models.map((m) => (
                          <option key={m.id} value={m.id} className="bg-slate-950 text-white">
                            {m.id}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              )}
            </div>

            {/* Label (optional) */}
            <div>
              <label htmlFor="ai-label" className={labelClass}>
                Label <span className="text-slate-500">(optional)</span>
              </label>
              <div className="relative">
                <Tag className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="ai-label"
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. OpenAI production"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className={`pl-11 ${inputClass}`}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <motion.button
              type="button"
              onClick={handleTest}
              disabled={testing || !config}
              title={!config ? "Save a provider before testing" : "Test the saved connection"}
              whileTap={{ scale: 0.98 }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {testing ? "Testing..." : "Test connection"}
            </motion.button>

            <motion.button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              whileHover={canSave ? { scale: 1.01, y: -1 } : undefined}
              whileTap={canSave ? { scale: 0.98 } : undefined}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save provider"}
            </motion.button>
          </div>

          {/* Privacy note */}
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-xs leading-5 text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <span>Your API key is stored securely on the server and never displayed again.</span>
          </div>
        </motion.div>

        {/* Optional BYO Google Maps key for OUTSIDE-the-venue geography */}
        <div className="mt-6">
          <GoogleMapsCard />
        </div>
      </div>
    </div>
  );
}
