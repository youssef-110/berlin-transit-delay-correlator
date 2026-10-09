"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineBadge, Logo, Spinner } from "./ui";
import type { DashboardDTO, LineStatusDTO, AlertLogDTO } from "@/services/status";

interface DashboardClientProps {
  initialData: DashboardDTO;
}

// Preset commute options for quick onboarding
const PRESETS = [
  { lineName: "S7", stopId: "900230999", stopName: "S Potsdam Hauptbahnhof", direction: "Ahrensfelde" },
  { lineName: "RE1", stopId: "900230999", stopName: "S Potsdam Hauptbahnhof", direction: "Frankfurt (Oder)" },
  { lineName: "U2", stopId: "900100003", stopName: "S+U Alexanderplatz Bhf", direction: "Ruhleben" },
  { lineName: "M10", stopId: "900120004", stopName: "S+U Warschauer Str.", direction: "Moabit" },
  { lineName: "S1", stopId: "900100001", stopName: "S+U Friedrichstr. Bhf", direction: "Wannsee" },
  { lineName: "S41", stopId: "900120003", stopName: "S Ostkreuz Bhf", direction: "Ringbahn" },
];

const POPULAR_HUBS = [
  { id: "900230999", name: "S Potsdam Hauptbahnhof", lines: "S7, RE1, RB23" },
  { id: "900100003", name: "S+U Alexanderplatz Bhf", lines: "S3, S5, S7, U2, U5, RE1" },
  { id: "900100001", name: "S+U Friedrichstr. Bhf", lines: "S1, S2, S25, U6, RE1" },
  { id: "900023201", name: "S+U Zoologischer Garten Bhf", lines: "S3, S5, S7, U2, U9, RE1" },
  { id: "900120004", name: "S+U Warschauer Str.", lines: "S3, S5, S7, U1, U3, M10" },
  { id: "900120003", name: "S Ostkreuz Bhf", lines: "S3, S5, S8, S41, S42, RE1" },
];

const TRAM_PRESETS = [
  { id: "900230014", name: "Potsdam, Platz der Einheit/West", line: "Tram 91/92" },
  { id: "900230086", name: "Potsdam, Kirschallee", line: "Tram 92" },
  { id: "900230107", name: "Potsdam, Bisamkiez", line: "Tram 93/96" },
  { id: "900120004", name: "S+U Warschauer Str.", line: "Tram M10" },
  { id: "900100003", name: "S+U Alexanderplatz Bhf", line: "Tram M4/M5/M6" },
  { id: "900110011", name: "U Eberswalder Str.", line: "Tram M10/M1" },
];

const DESTINATION_PRESETS = [
  { id: "900100003", name: "S+U Alexanderplatz Bhf" },
  { id: "900003201", name: "S+U Berlin Hauptbahnhof" },
  { id: "900100001", name: "S+U Friedrichstr. Bhf" },
  { id: "900023201", name: "S+U Zoologischer Garten Bhf" },
  { id: "900230999", name: "S Potsdam Hauptbahnhof" },
  { id: "900120003", name: "S Ostkreuz Bhf" },
];

export function DashboardClient({ initialData }: DashboardClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [data, setData] = useState<DashboardDTO>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testMessage, setTestMessage] = useState<{ text: string; logId?: string; isError?: boolean } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [previewLogId, setPreviewLogId] = useState<string | null>(null);

  // Commute Journey / Tram Route State
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromStation, setFromStation] = useState<{ id: string; name: string } | null>({
    id: "900230014",
    name: "Potsdam, Platz der Einheit/West",
  });
  const [toStation, setToStation] = useState<{ id: string; name: string } | null>({
    id: "900100003",
    name: "S+U Alexanderplatz Bhf",
  });
  const [fromSearching, setFromSearching] = useState(false);
  const [toSearching, setToSearching] = useState(false);
  const [fromResults, setFromResults] = useState<{ id: string; name: string }[]>([]);
  const [toResults, setToResults] = useState<{ id: string; name: string }[]>([]);
  const [departureTime, setDepartureTime] = useState("");
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeys, setJourneys] = useState<any[] | null>(null);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [emailingJourney, setEmailingJourney] = useState(false);
  const [journeyEmailStatus, setJourneyEmailStatus] = useState<string | null>(null);

  // Email Server Configuration State
  const [emailProvider, setEmailProvider] = useState<"smtp" | "resend">("smtp");
  const [smtpConfig, setSmtpConfig] = useState({
    host: "smtp.gmail.com",
    port: 587,
    user: data.settings.email,
    pass: "",
    from: `VBB Pulse <${data.settings.email}>`,
  });
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendFrom, setResendFrom] = useState("VBB Pulse <onboarding@resend.dev>");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Add line form state
  const [addLineData, setAddLineData] = useState({ lineName: "", stopId: "", stopName: "", direction: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);

  // Settings form state
  const [settings, setSettings] = useState(data.settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Auto-refresh every 45s
  useEffect(() => {
    const timer = setInterval(() => {
      refreshData(true);
    }, 45000);
    return () => clearInterval(timer);
  }, []);

  async function refreshData(silent = false) {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (res.ok) {
        const fresh = await res.json();
        setData(fresh);
      }
    } catch {
      // keep existing data on network glitch
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }

  // Station search debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/stations?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const json = await res.json();
          setSearchResults(json.stations || []);
        }
      } catch {
        // ignore search error
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function handleSendTestEmail() {
    setTestSending(true);
    setTestMessage(null);
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setTestMessage({
          text: `Success! ${json.message}`,
          logId: json.logId,
          isError: false,
        });
        // refresh data to show the new alert log
        await refreshData(true);
      } else {
        setTestMessage({
          text: json.error || "Failed to trigger test email.",
          isError: true,
        });
      }
    } catch {
      setTestMessage({ text: "Network error sending test email.", isError: true });
    } finally {
      setTestSending(false);
    }
  }

  async function handleAddLine(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setAddError(null);
    setAddingLine(true);
    try {
      const res = await fetch("/api/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addLineData),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddError(json.error || "Could not track line");
        return;
      }
      setShowAddModal(false);
      setAddLineData({ lineName: "", stopId: "", stopName: "", direction: "" });
      setSearchQuery("");
      await refreshData();
    } catch {
      setAddError("Network error adding line");
    } finally {
      setAddingLine(false);
    }
  }

  async function handleQuickAdd(preset: typeof PRESETS[0]) {
    setAddError(null);
    setAddingLine(true);
    try {
      const res = await fetch("/api/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
      if (res.ok) {
        await refreshData();
      } else {
        const json = await res.json();
        alert(json.error || "Could not add preset");
      }
    } catch {
      alert("Network error");
    } finally {
      setAddingLine(false);
    }
  }

  async function handleDeleteLine(id: string) {
    if (!confirm("Stop monitoring this line?")) return;
    try {
      const res = await fetch(`/api/lines/${id}`, { method: "DELETE" });
      if (res.ok) {
        await refreshData();
      }
    } catch {
      alert("Failed to delete line");
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) {
        setSettingsError(json.error || "Failed to save settings");
        return;
      }
      setSettingsSuccess(true);
      if (json.settings) {
        setData((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...json.settings,
          },
        }));
      }
      setTimeout(() => setShowSettingsModal(false), 800);
      await refreshData();
    } catch {
      setSettingsError("Network error saving settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  }

  // From Station debounce
  useEffect(() => {
    if (fromQuery.trim().length < 2) {
      setFromResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setFromSearching(true);
      try {
        const res = await fetch(`/api/stations?q=${encodeURIComponent(fromQuery)}`);
        if (res.ok) {
          const json = await res.json();
          setFromResults(json.stations || []);
        }
      } catch {
        // ignore
      } finally {
        setFromSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [fromQuery]);

  // To Station debounce
  useEffect(() => {
    if (toQuery.trim().length < 2) {
      setToResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setToSearching(true);
      try {
        const res = await fetch(`/api/stations?q=${encodeURIComponent(toQuery)}`);
        if (res.ok) {
          const json = await res.json();
          setToResults(json.stations || []);
        }
      } catch {
        // ignore
      } finally {
        setToSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [toQuery]);

  async function handleSearchJourney() {
    if (!fromStation || !toStation) {
      setJourneyError("Please select both origin and destination stations");
      return;
    }
    setJourneyLoading(true);
    setJourneyError(null);
    setJourneyEmailStatus(null);
    try {
      let url = `/api/journey?from=${encodeURIComponent(fromStation.id)}&to=${encodeURIComponent(toStation.id)}`;
      if (departureTime) {
        url += `&departure=${encodeURIComponent(departureTime)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        setJourneyError(json.error || "Failed to load journey routes");
      } else {
        setJourneys(json.journeys || []);
      }
    } catch {
      setJourneyError("Network error loading journeys");
    } finally {
      setJourneyLoading(false);
    }
  }

  async function handleEmailJourney(journey: any) {
    if (!fromStation || !toStation) return;
    setEmailingJourney(true);
    setJourneyEmailStatus(null);
    try {
      const res = await fetch("/api/journey/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journey,
          fromName: fromStation.name,
          toName: toStation.name,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setJourneyEmailStatus(`✅ ${json.message}`);
        await refreshData(true);
      } else {
        setJourneyEmailStatus(`⚠️ ${json.error || "Failed to email route"}`);
      }
    } catch {
      setJourneyEmailStatus("⚠️ Network error emailing route report");
    } finally {
      setEmailingJourney(false);
    }
  }

  async function handleSaveEmailSetup(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    setEmailStatusMsg(null);
    try {
      const payload =
        emailProvider === "smtp"
          ? {
              provider: "smtp",
              smtpHost: smtpConfig.host,
              smtpPort: smtpConfig.port,
              smtpUser: smtpConfig.user,
              smtpPass: smtpConfig.pass,
              emailFrom: smtpConfig.from,
              sendTestNow: true,
            }
          : {
              provider: "resend",
              resendApiKey,
              emailFrom: resendFrom,
              sendTestNow: true,
            };
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        setEmailStatusMsg({
          text: json.message,
          isError: json.testResult && !json.testResult.delivered,
        });
        await refreshData(true);
      } else {
        setEmailStatusMsg({ text: json.error || "Failed to save configuration", isError: true });
      }
    } catch {
      setEmailStatusMsg({ text: "Network error saving email configuration", isError: true });
    } finally {
      setSavingEmail(false);
    }
  }

  // Count active disruptions
  const activeDisruptions = data.lines.filter(
    (l) => l.health === "DELAYED" || l.health === "CANCELLED"
  ).length;

  return (
    <div className="min-h-screen pb-20">
      {/* ── Top Bar ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Logo size={32} />
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-mono text-[11px]">
                CYCLE #{data.system.poller.cycles} · {data.system.poller.intervalSeconds}s
              </span>
            </div>
            <button
              onClick={() => setShowEmailModal(true)}
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition cursor-pointer ${
                data.system.emailTransport === "console"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              }`}
              title="Click to configure real email delivery (Gmail or Resend)"
            >
              <span>{data.system.emailTransport === "console" ? "⚠️ Mock Email" : "✓ Email Active"}</span>
              <span className="uppercase font-mono font-bold">({data.system.emailTransport})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="instant-test-btn"
              onClick={handleSendTestEmail}
              disabled={testSending}
              className="btn bg-gradient-to-r from-amber-500 to-orange-500 text-ink-950 font-bold shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400"
              title="Dispatches an immediate delay alert scenario to your email"
            >
              {testSending ? <Spinner /> : <span>⚡</span>}
              <span className="hidden sm:inline">Send Test Delay Email</span>
              <span className="sm:hidden">Test Email</span>
            </button>

            <button
              id="email-setup-btn"
              onClick={() => setShowEmailModal(true)}
              className="btn-ghost p-2.5 sm:px-3 text-xs"
              title="Configure real email delivery (Gmail App Password or Resend)"
            >
              <span>✉️</span>
              <span className="hidden md:inline">Email Setup</span>
            </button>

            <button
              id="refresh-btn"
              onClick={() => refreshData()}
              disabled={isRefreshing}
              className="btn-ghost p-2.5 sm:px-3.5"
              title="Refresh live status"
            >
              <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
              <span className="hidden md:inline">Refresh</span>
            </button>

            <button
              id="settings-btn"
              onClick={() => setShowSettingsModal(true)}
              className="btn-ghost p-2.5 sm:px-3.5"
              title="Alert Preferences"
            >
              <span>⚙️</span>
              <span className="hidden md:inline">Settings</span>
            </button>

            <button
              id="logout-btn"
              onClick={handleLogout}
              className="btn-ghost p-2.5 text-slate-400 hover:text-rose-300"
              title="Sign Out"
            >
              <span>🚪</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Test Email Toast / Feedback ─────────────────────────── */}
      {testMessage && (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
              testMessage.isError
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{testMessage.isError ? "⚠️" : "✅"}</span>
              <span>{testMessage.text}</span>
            </div>
            <div className="flex items-center gap-2">
              {testMessage.logId && (
                <button
                  onClick={() => setPreviewLogId(testMessage.logId!)}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-100 underline hover:bg-emerald-500/30 text-xs"
                >
                  View Rendered HTML Email →
                </button>
              )}
              <button
                onClick={() => setTestMessage(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto mt-6 max-w-7xl space-y-8 px-4 sm:px-6">
        {/* ── Stats Summary Bar ──────────────────────────────── */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="glass p-4 sm:p-5">
            <div className="section-title">Tracked Lines</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{data.lines.length}</span>
              <span className="text-xs text-slate-400">commute legs</span>
            </div>
          </div>

          <div className="glass p-4 sm:p-5">
            <div className="section-title">Active Disruptions</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-3xl font-extrabold ${
                  activeDisruptions > 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {activeDisruptions}
              </span>
              <span className="text-xs text-slate-400">
                {activeDisruptions === 0 ? "All lines smooth" : "Requiring attention"}
              </span>
            </div>
          </div>

          <div className="glass p-4 sm:p-5">
            <div className="section-title">Delay Threshold</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-indigo-300">
                ≥ {data.settings.delayThresholdMin}m
              </span>
              <span className="text-xs text-slate-400">
                Cooldown {data.settings.cooldownMinutes}m
              </span>
            </div>
          </div>

          <div className="glass p-4 sm:p-5">
            <div className="section-title">Alert Target</div>
            <div className="mt-2 flex items-baseline gap-2 truncate">
              <span className="text-sm font-semibold text-slate-200 truncate" title={data.settings.email}>
                {data.settings.email}
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  data.settings.emailEnabled
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-slate-500/20 text-slate-400"
                }`}
              >
                {data.settings.emailEnabled ? "Active" : "Muted"}
              </span>
            </div>
          </div>
        </section>

        {/* ── Commute Route & Tram Alert Checker ────────────────── */}
        <section className="glass p-5 sm:p-6 space-y-5 border border-indigo-500/20 shadow-xl shadow-indigo-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🚋</span>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Commute Route & Tram Alert Checker
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Enter any tram station, bus stop, or train station you depart from and your final destination to inspect real-time delays, cancellations, and corridor disruptions during your commute.
              </p>
            </div>
            <div className="text-xs font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
              Live VBB Journey Engine
            </div>
          </div>

          {/* Route Inputs Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Origin (From) */}
            <div className="space-y-1.5 relative">
              <label className="block text-xs font-semibold text-slate-300">
                <span>Origin (e.g. Tram Stop, S-Bahn, Bus)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search tram stop or station..."
                  value={fromQuery || (fromStation ? fromStation.name : "")}
                  onChange={(e) => {
                    setFromQuery(e.target.value);
                    if (fromStation) setFromStation(null);
                  }}
                  className="input text-xs w-full pr-8"
                />
                {fromSearching && (
                  <div className="absolute right-2.5 top-2.5">
                    <Spinner />
                  </div>
                )}
              </div>

              {/* Quick Tram chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                <span className="text-[10px] text-slate-500 self-center mr-1">Trams:</span>
                {TRAM_PRESETS.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setFromStation({ id: p.id, name: p.name });
                      setFromQuery("");
                      setFromResults([]);
                    }}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                      fromStation?.id === p.id
                        ? "bg-indigo-600 text-white"
                        : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {p.line.split(" ")[0]} {p.name.split(",")[1]?.trim() || p.name}
                  </button>
                ))}
              </div>

              {/* Autocomplete Dropdown */}
              {fromResults.length > 0 && (
                <div className="absolute left-0 right-0 top-16 z-30 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl">
                  {fromResults.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setFromStation({ id: st.id, name: st.name });
                        setFromQuery("");
                        setFromResults([]);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-200 hover:bg-indigo-600/30 transition flex items-center justify-between"
                    >
                      <span className="truncate">{st.name}</span>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">Select</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Destination (To) */}
            <div className="space-y-1.5 relative">
              <label className="block text-xs font-semibold text-slate-300">
                <span>Final Destination</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search final destination..."
                  value={toQuery || (toStation ? toStation.name : "")}
                  onChange={(e) => {
                    setToQuery(e.target.value);
                    if (toStation) setToStation(null);
                  }}
                  className="input text-xs w-full pr-8"
                />
                {toSearching && (
                  <div className="absolute right-2.5 top-2.5">
                    <Spinner />
                  </div>
                )}
              </div>

              {/* Quick Destination chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                <span className="text-[10px] text-slate-500 self-center mr-1">Hubs:</span>
                {DESTINATION_PRESETS.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setToStation({ id: p.id, name: p.name });
                      setToQuery("");
                      setToResults([]);
                    }}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                      toStation?.id === p.id
                        ? "bg-indigo-600 text-white"
                        : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {p.name.replace(/^(S\+U|S)\s+/, "").replace(/\s+Bhf$/, "")}
                  </button>
                ))}
              </div>

              {/* Autocomplete Dropdown */}
              {toResults.length > 0 && (
                <div className="absolute left-0 right-0 top-16 z-30 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl">
                  {toResults.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setToStation({ id: st.id, name: st.name });
                        setToQuery("");
                        setToResults([]);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-200 hover:bg-indigo-600/30 transition flex items-center justify-between"
                    >
                      <span className="truncate">{st.name}</span>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">Select</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Departure Time & Trigger Button */}
            <div className="space-y-1.5 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Departure Time (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              <button
                type="button"
                onClick={handleSearchJourney}
                disabled={journeyLoading || !fromStation || !toStation}
                className="btn-primary w-full py-2.5 font-bold flex items-center justify-center gap-2 mt-2"
              >
                {journeyLoading ? <Spinner /> : <span>🔍</span>}
                <span>Check Route Alerts & Delays</span>
              </button>
            </div>
          </div>

          {/* Feedback messages */}
          {journeyError && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              {journeyError}
            </div>
          )}

          {journeyEmailStatus && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-center justify-between">
              <span>{journeyEmailStatus}</span>
              <button
                onClick={() => setJourneyEmailStatus(null)}
                className="text-slate-400 hover:text-white ml-2 text-[11px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Journey Results */}
          {journeys && (
            <div className="space-y-4 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Available Connections:</span>
                  <span className="text-xs text-slate-400 font-normal">
                    {fromStation?.name} → {toStation?.name}
                  </span>
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  {journeys.length} routes calculated
                </span>
              </div>

              {journeys.length === 0 ? (
                <div className="text-center p-6 text-xs text-slate-500">
                  No direct or connected routes found for the selected time window.
                </div>
              ) : (
                <div className="space-y-4">
                  {journeys.map((j: any, idx: number) => {
                    const isCancelled = j.isCancelled;
                    const hasDelay = j.worstDelayMin > 0;
                    const statusBg = isCancelled
                      ? "border-rose-500/40 bg-rose-500/5"
                      : hasDelay
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-emerald-500/30 bg-emerald-500/5";

                    return (
                      <div
                        key={j.id || idx}
                        className={`rounded-2xl border p-4 sm:p-5 transition space-y-4 ${statusBg}`}
                      >
                        {/* Route Summary Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-black text-white font-mono">
                              {new Date(j.departure).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-slate-400 text-sm">→</span>
                            <span className="text-2xl font-black text-white font-mono">
                              {new Date(j.arrival).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-mono text-slate-300">
                              ~{j.durationMin} min
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isCancelled ? (
                              <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-extrabold text-rose-300">
                                ⚠️ CANCELLED LEGS
                              </span>
                            ) : hasDelay ? (
                              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-extrabold text-amber-300">
                                +{j.worstDelayMin} MIN DELAY
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
                                ✓ ON TIME
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleEmailJourney(j)}
                              disabled={emailingJourney}
                              className="btn bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 font-semibold shadow"
                              title="Send complete delay & route report to your email"
                            >
                              {emailingJourney ? <Spinner /> : <span>✉️</span>}
                              <span>Email Me Route Report</span>
                            </button>
                          </div>
                        </div>

                        {/* Visual Leg Timeline */}
                        <div className="space-y-2 border-t border-white/[0.06] pt-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Transit Legs & Transfers
                          </div>
                          <div className="space-y-2">
                            {j.legs.map((leg: any, legIdx: number) => {
                              const isWalk = leg.walking;
                              const isLegCancelled = leg.cancelled;
                              const legDelay = leg.departureDelayMin;

                              return (
                                <div
                                  key={legIdx}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-900/60 p-2.5 sm:px-3 text-xs border border-white/5"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {isWalk ? (
                                      <span className="rounded bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                                        🚶 WALK
                                      </span>
                                    ) : (
                                      <LineBadge line={leg.line || "T"} size="sm" />
                                    )}

                                    <div className="truncate">
                                      <span className="font-semibold text-slate-200">
                                        {leg.fromName.replace(/^(S\+U|S)\s+/, "")}
                                      </span>
                                      <span className="text-slate-500 mx-1.5">→</span>
                                      <span className="text-slate-300 font-medium">
                                        {leg.toName.replace(/^(S\+U|S)\s+/, "")}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                                    {leg.platform && (
                                      <span className="text-slate-400">Pl. {leg.platform}</span>
                                    )}
                                    <span className="text-slate-400">
                                      {leg.departure
                                        ? new Date(leg.departure).toLocaleTimeString("de-DE", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : "–"}
                                    </span>

                                    {isLegCancelled ? (
                                      <span className="font-bold text-rose-400">Cancelled</span>
                                    ) : legDelay && legDelay > 0 ? (
                                      <span className="font-bold text-amber-400">+{legDelay}m</span>
                                    ) : (
                                      <span className="text-emerald-400">On time</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Disruption Notices on Route */}
                        {j.warnings && j.warnings.length > 0 && (
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200 space-y-1">
                            <div className="font-bold flex items-center gap-1.5 text-amber-300">
                              <span>⚠️</span>
                              <span>Official VBB Disruption & Construction Notices:</span>
                            </div>
                            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-100/90 pl-1">
                              {j.warnings.map((w: string, wIdx: number) => (
                                <li key={wIdx}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Monitored Lines Grid ────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Your Monitored Commute</h2>
              <p className="text-xs text-slate-400">
                Live VBB departure telemetry, correlated with real-time weather anomalies and major public events.
              </p>
            </div>
            <button
              id="add-line-btn"
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
            >
              <span>+</span>
              <span>Track New Line</span>
            </button>
          </div>

          {data.lines.length === 0 ? (
            <div className="glass p-8 text-center sm:p-12">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-2xl">
                🚆
              </div>
              <h3 className="text-lg font-bold text-white">No commute lines tracked yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
                Add the lines you ride daily (e.g., S7 from Potsdam to Berlin, RE1, or U2). We&apos;ll monitor delays and alert you automatically.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <span className="text-xs font-semibold text-slate-400 self-center mr-2">Quick Add:</span>
                {PRESETS.slice(0, 4).map((p) => (
                  <button
                    key={`${p.lineName}-${p.stopId}`}
                    onClick={() => handleQuickAdd(p)}
                    disabled={addingLine}
                    className="btn-ghost text-xs py-1.5 px-3"
                  >
                    <span className="font-bold">{p.lineName}</span> · {p.stopName.replace(/^(S\+U|S)\s+/, "")}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {data.lines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  onDelete={() => handleDeleteLine(line.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Correlation Intelligence (Weather + Events) ──────── */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Weather Widget */}
          <div className="glass p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌦️</span>
                <h3 className="font-bold text-white">Open-Meteo Weather Radar</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Potsdam & Berlin</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(["berlin", "potsdam"] as const).map((reg) => {
                const w = data.weather[reg];
                if (!w || !w.available) {
                  return (
                    <div key={reg} className="rounded-xl border border-white/5 bg-ink-900/50 p-3">
                      <div className="font-semibold capitalize text-slate-300">{reg}</div>
                      <div className="mt-1 text-xs text-slate-500">Temporarily unavailable</div>
                    </div>
                  );
                }
                const hasAnomaly = w.anomalies.length > 0;
                return (
                  <div
                    key={reg}
                    className={`rounded-xl border p-3 transition ${
                      hasAnomaly
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-white/10 bg-ink-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{w.label}</span>
                      <span className="text-xs text-slate-400">{w.description}</span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-white">
                        {Math.round(w.temperatureC)}°C
                      </span>
                      <span className="text-xs text-slate-400">
                        feels {Math.round(w.apparentC)}°
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                      <div>Rain: {w.precipitationMmH.toFixed(1)} mm/h</div>
                      <div>Gusts: {Math.round(w.gustKmh)} km/h</div>
                    </div>
                    {hasAnomaly && (
                      <div className="mt-2.5 rounded bg-amber-500/15 p-1.5 text-[11px] font-medium text-amber-200">
                        ⚠️ {w.anomalies[0]?.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              High winds, snow & freezing rain directly correlate to rail switch faults (Weichenstörungen) and overhead power interruptions.
            </p>
          </div>

          {/* Events Widget */}
          <div className="glass p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏟️</span>
                <h3 className="font-bold text-white">Major Public Events Radar</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Transit Crowd Drivers</span>
            </div>

            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {data.events.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No major stadium or arena events in the immediate correlation window.
                </div>
              ) : (
                data.events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-ink-900/50 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{ev.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        📍 {ev.venue} · Nearby: <span className="text-indigo-300">{ev.nearbyStops.join(", ")}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Affected lines: {ev.affectedLines.slice(0, 5).join(", ")}
                        {ev.expectedAttendance ? ` · ~${ev.expectedAttendance.toLocaleString()} attendees` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-slate-300">
                      {new Date(ev.startsAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Aggregated from Olympiastadion, Uber Arena, Messe Berlin & Park Babelsberg venues to predict post-event platform overcrowding.
            </p>
          </div>
        </section>

        {/* ── Dispatched Alert History & Logs ──────────────────── */}
        <section className="glass p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h3 className="font-bold text-white">Alert Dispatch Audit Log</h3>
              <p className="text-xs text-slate-400">
                Full delivery history showing anti-spam deduplication and email verification proofs.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {data.alerts.length} events logged
            </span>
          </div>

          {data.alerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No alert emails dispatched yet. Click &quot;Send Test Delay Email&quot; in the header to trigger an instant verification!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-2.5 font-semibold">Time</th>
                    <th className="pb-2.5 font-semibold">Line</th>
                    <th className="pb-2.5 font-semibold">Status / Delay</th>
                    <th className="pb-2.5 font-semibold">Reason</th>
                    <th className="pb-2.5 font-semibold">Transport</th>
                    <th className="pb-2.5 font-semibold">Status</th>
                    <th className="pb-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {data.alerts.map((al) => (
                    <tr key={al.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 font-mono text-slate-400">
                        {new Date(al.createdAt).toLocaleString("de-DE", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <LineBadge line={al.lineName} size="sm" />
                          <span className="text-slate-300">{al.stopName.replace(/^(S\+U|S)\s+/, "")}</span>
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`font-bold ${
                            al.status === "CANCELLED"
                              ? "text-rose-400"
                              : al.delayMin >= 10
                              ? "text-orange-400"
                              : "text-amber-300"
                          }`}
                        >
                          {al.status === "CANCELLED" ? "CANCELLED" : `+${al.delayMin}m`}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            al.isTest
                              ? "bg-amber-500/20 text-amber-300"
                              : al.reason === "ESCALATED"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-indigo-500/20 text-indigo-300"
                          }`}
                        >
                          {al.isTest ? "TEST" : al.reason}
                        </span>
                      </td>
                      <td className="py-2.5 uppercase font-mono text-[11px] text-slate-400">
                        {al.transport}
                      </td>
                      <td className="py-2.5">
                        {al.delivered ? (
                          <span className="text-emerald-400 font-medium">✓ Sent</span>
                        ) : (
                          <span className="text-rose-400 font-medium" title={al.error || ""}>
                            ✗ Failed
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => setPreviewLogId(al.id)}
                          className="rounded bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/10"
                        >
                          View HTML
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ── Modal: Add Line ─────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 animate-fade-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white">Track a Commute Line</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddLine} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Search Station or Hub (Berlin & Potsdam)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Potsdam Hbf, Alexanderplatz, Friedrichstraße..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                {searching && <div className="mt-1 text-xs text-slate-400">Searching VBB database...</div>}

                {searchResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-ink-900 p-1 space-y-1">
                    {searchResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setAddLineData((prev) => ({ ...prev, stopId: s.id, stopName: s.name }));
                          setSearchQuery(s.name);
                          setSearchResults([]);
                        }}
                        className="w-full text-left rounded-lg p-2 text-xs text-slate-200 hover:bg-white/10 flex items-center justify-between"
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">{s.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Or quick-select verified hubs */}
              <div>
                <div className="mb-1 text-xs text-slate-400">Or pick a popular hub:</div>
                <div className="grid grid-cols-2 gap-2">
                  {POPULAR_HUBS.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setAddLineData((prev) => ({ ...prev, stopId: h.id, stopName: h.name }));
                        setSearchQuery(h.name);
                        setSearchResults([]);
                      }}
                      className={`rounded-lg border p-2 text-left text-xs transition ${
                        addLineData.stopId === h.id
                          ? "border-indigo-500 bg-indigo-500/20 text-white"
                          : "border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      <div className="font-semibold">{h.name.replace(/^(S\+U|S)\s+/, "")}</div>
                      <div className="text-[10px] text-slate-400">{h.lines}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Line Identifier
                  </label>
                  <input
                    type="text"
                    required
                    className="input uppercase"
                    placeholder="e.g. S7, RE1, U2, M10"
                    value={addLineData.lineName}
                    onChange={(e) => setAddLineData((prev) => ({ ...prev, lineName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Direction (Optional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Ahrensfelde"
                    value={addLineData.direction}
                    onChange={(e) => setAddLineData((prev) => ({ ...prev, direction: e.target.value }))}
                  />
                </div>
              </div>

              {addError && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  {addError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingLine || !addLineData.stopId || !addLineData.lineName}
                  className="btn-primary"
                >
                  {addingLine ? <Spinner /> : null}
                  <span>Track Line</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Alert Preferences & Settings ───────────────── */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-md p-6 animate-fade-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white">Alert Preferences</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Notification Email Address
                </label>
                <input
                  type="email"
                  className="input text-xs"
                  placeholder="your.email@example.com"
                  value={settings.email || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))}
                  required
                />
                <span className="text-[11px] text-slate-400">
                  Transit alerts and delay updates will be dispatched to this inbox.
                </span>
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-300">
                  <span>Delay Threshold (Minutes)</span>
                  <span className="font-bold text-indigo-300">{settings.delayThresholdMin} min</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="45"
                  step="1"
                  value={settings.delayThresholdMin}
                  onChange={(e) => setSettings((s) => ({ ...s, delayThresholdMin: Number(e.target.value) }))}
                  className="w-full accent-indigo-500"
                />
                <span className="text-[11px] text-slate-400">
                  Only notify when delay meets or exceeds this amount (cancellations always alert).
                </span>
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-300">
                  <span>Cooldown Between Alerts (Minutes)</span>
                  <span className="font-bold text-indigo-300">{settings.cooldownMinutes} min</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="180"
                  step="10"
                  value={settings.cooldownMinutes}
                  onChange={(e) => setSettings((s) => ({ ...s, cooldownMinutes: Number(e.target.value) }))}
                  className="w-full accent-indigo-500"
                />
                <span className="text-[11px] text-slate-400">
                  Prevents spam for the same ongoing disruption.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Quiet Hours Start</label>
                  <input
                    type="time"
                    className="input text-xs"
                    value={settings.quietHoursStart || ""}
                    onChange={(e) => setSettings((s) => ({ ...s, quietHoursStart: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Quiet Hours End</label>
                  <input
                    type="time"
                    className="input text-xs"
                    value={settings.quietHoursEnd || ""}
                    onChange={(e) => setSettings((s) => ({ ...s, quietHoursEnd: e.target.value || null }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="email-toggle"
                  checked={settings.emailEnabled}
                  onChange={(e) => setSettings((s) => ({ ...s, emailEnabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-white/20 bg-ink-900 accent-indigo-500"
                />
                <label htmlFor="email-toggle" className="text-xs text-slate-200">
                  Enable automated email notifications
                </label>
              </div>

              <div className="flex items-start gap-3 pt-1 border-t border-white/[0.06] pt-3">
                <input
                  type="checkbox"
                  id="city-alerts-toggle"
                  checked={settings.cityAlertsEnabled ?? true}
                  onChange={(e) => setSettings((s) => ({ ...s, cityAlertsEnabled: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-ink-900 accent-indigo-500"
                />
                <label htmlFor="city-alerts-toggle" className="text-xs text-slate-200">
                  <span className="font-semibold text-white block">City-Wide Disruption Radar</span>
                  <span className="text-[11px] text-slate-400">
                    Automatically email me when major switch failures, severe weather, or arena crowd surges occur anywhere across Berlin &amp; Potsdam.
                  </span>
                </label>
              </div>

              {settingsError && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  {settingsError}
                </div>
              )}
              {settingsSuccess && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                  Preferences updated successfully!
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="btn-ghost"
                >
                  Close
                </button>
                <button type="submit" disabled={savingSettings} className="btn-primary">
                  {savingSettings ? <Spinner /> : null}
                  <span>Save Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Email Server & Delivery Setup ───────────────── */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="glass max-h-[92vh] w-full max-w-lg overflow-y-auto p-6 animate-fade-up space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✉️</span>
                <h3 className="text-lg font-bold text-white">Email Server Delivery Setup</h3>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="rounded-xl border border-white/10 bg-ink-900/60 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Current Active Transport:</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] uppercase ${
                  data.system.emailTransport === "console"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}>
                  {data.system.emailTransport}
                </span>
              </div>
              {data.system.emailTransport === "console" ? (
                <p className="text-amber-200/90 text-[11px] pt-1">
                  ⚠️ Alerts are currently in <strong>Mock Mode</strong> (printed to terminal and HTML preview only). Connect your Gmail or Resend account below to receive actual emails in your inbox!
                </p>
              ) : (
                <p className="text-emerald-300 text-[11px] pt-1">
                  ✓ Real email delivery is connected! Alerts are being sent directly to your inbox.
                </p>
              )}
            </div>

            {/* Provider Switcher */}
            <div className="flex rounded-xl bg-ink-950 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setEmailProvider("smtp")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                  emailProvider === "smtp" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Gmail / SMTP (App Password)
              </button>
              <button
                type="button"
                onClick={() => setEmailProvider("resend")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                  emailProvider === "resend" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Resend API (Cloud)
              </button>
            </div>

            <form onSubmit={handleSaveEmailSetup} className="space-y-4">
              {emailProvider === "smtp" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-[11px] text-indigo-200 space-y-1">
                    <span className="font-bold block text-indigo-100">Quick Gmail Setup (1 minute):</span>
                    <ol className="list-decimal list-inside space-y-0.5 text-indigo-200/90">
                      <li>Go to Google Account &rarr; Security &rarr; 2-Step Verification.</li>
                      <li>Scroll to <strong>App Passwords</strong> and create one for &quot;Mail&quot;.</li>
                      <li>Copy the 16-character code and paste below.</li>
                    </ol>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">SMTP Host</label>
                    <input
                      type="text"
                      className="input text-xs"
                      value={smtpConfig.host}
                      onChange={(e) => setSmtpConfig((s) => ({ ...s, host: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-300">Your Email (Username)</label>
                      <input
                        type="email"
                        className="input text-xs"
                        value={smtpConfig.user}
                        onChange={(e) => setSmtpConfig((s) => ({ ...s, user: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">Port</label>
                      <input
                        type="number"
                        className="input text-xs"
                        value={smtpConfig.port}
                        onChange={(e) => setSmtpConfig((s) => ({ ...s, port: Number(e.target.value) }))}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      16-Character Google App Password
                    </label>
                    <input
                      type="password"
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="input text-xs font-mono"
                      value={smtpConfig.pass}
                      onChange={(e) => setSmtpConfig((s) => ({ ...s, pass: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-[11px] text-indigo-200">
                    <span className="font-bold block text-indigo-100">Resend.com Setup:</span>
                    <span>Sign up free at <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline font-bold">resend.com</a> and paste your API key below. Free tier gives 3,000 emails/month.</span>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Resend API Key</label>
                    <input
                      type="password"
                      placeholder="re_123456789..."
                      className="input text-xs font-mono"
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Sender Address (From)</label>
                    <input
                      type="text"
                      className="input text-xs"
                      value={resendFrom}
                      onChange={(e) => setResendFrom(e.target.value)}
                      required
                    />
                    <span className="text-[10px] text-slate-500">
                      Use onboarding@resend.dev to test immediately without custom domain.
                    </span>
                  </div>
                </div>
              )}

              {emailStatusMsg && (
                <div className={`rounded-xl border p-3 text-xs ${
                  emailStatusMsg.isError
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                }`}>
                  {emailStatusMsg.text}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEmail}
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  {savingEmail ? <Spinner /> : <span>⚡</span>}
                  <span>Save &amp; Send Verification Email</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Email HTML Preview ──────────────────────────── */}
      {previewLogId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="flex h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden animate-fade-up">
            <div className="flex items-center justify-between border-b border-white/10 bg-ink-950 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-base">✉️</span>
                <span className="text-sm font-bold text-white">Dispatched Email HTML Preview</span>
              </div>
              <button
                onClick={() => setPreviewLogId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-slate-200">
              <iframe
                src={`/api/alerts/${previewLogId}/preview`}
                className="h-full w-full border-0"
                title="Rendered Email HTML"
                sandbox="allow-same-origin"
              />
            </div>
            <div className="border-t border-white/10 bg-ink-950 px-5 py-2.5 text-right">
              <button
                onClick={() => setPreviewLogId(null)}
                className="btn-ghost text-xs py-1.5"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponent: Individual Monitored Line Card ──────────────
function LineCard({
  line,
  onDelete,
}: {
  line: LineStatusDTO;
  onDelete: () => void;
}) {
  const isHealthy = line.health === "ON_TIME";
  const isMinor = line.health === "MINOR";
  const isDelayed = line.health === "DELAYED";
  const isCancelled = line.health === "CANCELLED";

  const statusColor = isCancelled
    ? "border-rose-500/30 bg-rose-500/5"
    : isDelayed
    ? "border-amber-500/30 bg-amber-500/5"
    : isMinor
    ? "border-yellow-500/20 bg-yellow-500/5"
    : "border-white/10 bg-white/[0.02]";

  return (
    <article className={`rounded-2xl border p-5 transition duration-300 ${statusColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <LineBadge line={line.lineName} size="lg" />
          <div>
            <h4 className="font-bold text-white text-base">
              {line.stopName.replace(/^(S\+U|S)\s+/, "")}
            </h4>
            <div className="text-xs text-slate-400">
              {line.direction ? `Direction: ${line.direction}` : "All directions"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          {isCancelled && (
            <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-xs font-extrabold text-rose-300">
              CANCELLED
            </span>
          )}
          {isDelayed && (
            <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-extrabold text-amber-300">
              +{line.worstDelayMin} MIN DELAY
            </span>
          )}
          {isMinor && (
            <span className="rounded-full bg-yellow-500/20 px-2.5 py-1 text-xs font-bold text-yellow-300">
              MINOR (+{line.worstDelayMin}m)
            </span>
          )}
          {isHealthy && (
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
              ON TIME
            </span>
          )}
          {line.health === "NO_DATA" && (
            <span className="rounded-full bg-slate-500/20 px-2.5 py-1 text-xs text-slate-400">
              NO DATA
            </span>
          )}

          <button
            onClick={onDelete}
            className="text-slate-500 hover:text-rose-400 p-1"
            title="Remove from monitoring"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Upcoming departures list */}
      <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Upcoming Departures
        </div>
        {line.departures.length === 0 ? (
          <div className="text-xs text-slate-500 py-1">No departures in the next 45 minutes</div>
        ) : (
          <div className="space-y-1">
            {line.departures.map((d) => (
              <div
                key={d.tripId}
                className="flex items-center justify-between text-xs py-1 px-2 rounded bg-ink-900/40"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-mono text-slate-400">
                    {d.plannedWhen
                      ? new Date(d.plannedWhen).toLocaleTimeString("de-DE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "–"}
                  </span>
                  <span className="text-slate-300 truncate">
                    → {d.direction.replace(/^(S\+U|S)\s+/, "")}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.platform && (
                    <span className="text-[10px] text-slate-400">Pl. {d.platform}</span>
                  )}
                  {d.cancelled ? (
                    <span className="text-rose-400 font-bold">Cancelled</span>
                  ) : d.delayMin && d.delayMin > 0 ? (
                    <span className="text-amber-400 font-semibold">+{d.delayMin}m</span>
                  ) : (
                    <span className="text-emerald-400 font-medium">On time</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Correlated Insights */}
      {line.insights && line.insights.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Correlated Context
          </div>
          {line.insights.map((ins, i) => (
            <div
              key={i}
              className={`rounded-lg border p-2 text-xs ${
                ins.kind === "weather"
                  ? "border-sky-500/20 bg-sky-500/5 text-sky-200"
                  : ins.kind === "event"
                  ? "border-purple-500/20 bg-purple-500/5 text-purple-200"
                  : "border-slate-500/20 bg-white/[0.02] text-slate-300"
              }`}
            >
              <div className="font-semibold flex items-center gap-1.5">
                <span>{ins.kind === "weather" ? "☁️" : ins.kind === "event" ? "🎫" : "⚠️"}</span>
                <span>{ins.message}</span>
              </div>
              {ins.detail && (
                <div className="mt-0.5 text-[11px] opacity-80 pl-5">{ins.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Alternative suggestion banner */}
      {line.alternative && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
          <div className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wide text-emerald-300">
            <span>💡</span> Recommended Alternative
          </div>
          <div className="mt-0.5">{line.alternative}</div>
        </div>
      )}
    </article>
  );
}
