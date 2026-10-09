import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LineBadge, Logo } from "@/components/ui";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export default async function Home() {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session) redirect("/dashboard");

  const features = [
    { t: "Live delay detection", d: "Scheduled vs. real-time departures from VBB/HAFAS for S-Bahn, U-Bahn, tram, bus and DB Regio – refreshed every 2 minutes." },
    { t: "Weather & event correlation", d: "Open-Meteo anomalies (storms, heavy rain, snow, frost) and crowds from Olympiastadion, Uber Arena, Messe & Babelsberg." },
    { t: "Smart, spam-free alerts", d: "Idempotent alert hashing, escalation detection, per-line cooldowns and quiet hours. One email per real problem." },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <nav className="flex gap-2">
          <Link href="/login" className="btn-ghost" id="nav-login">Sign in</Link>
          <Link href="/register" className="btn-primary" id="nav-register">Get started</Link>
        </nav>
      </header>

      <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live across the VBB network
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Know about delays <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-emerald-300 bg-clip-text text-transparent">before the platform does.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-400">
            VBB Pulse watches your Berlin–Potsdam commute in real time, explains <em>why</em> it&apos;s late – weather, events, operator notices – and emails you only when it matters.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base" id="hero-register">Create free account</Link>
            <Link href="/login" className="btn-ghost px-6 py-3 text-base" id="hero-login">I have an account</Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {["S7", "S1", "U2", "RE1", "M10", "S41", "U5"].map((l) => <LineBadge key={l} line={l} />)}
          </div>
        </div>

        <div className="glass animate-fade-up p-5 [animation-delay:120ms]">
          <div className="section-title mb-3">Example alert</div>
          <div className="rounded-xl border border-white/10 bg-ink-900/80 p-5">
            <div className="flex items-center gap-3">
              <LineBadge line="S7" size="lg" />
              <div className="text-sm font-semibold text-white">Potsdam Hbf → Ahrensfelde</div>
            </div>
            <div className="mt-4 text-5xl font-extrabold text-amber-400">+14 min</div>
            <div className="mt-1 text-sm text-slate-400">Scheduled 17:42 → Expected 17:56 · Platform 3</div>
            <div className="mt-5 space-y-2 text-sm">
              <div className="rounded-lg border-l-4 border-rose-500 bg-white/[0.03] px-3 py-2">☁ Heavy rain detected (14 mm/h) – likely factor for S-Bahn switch failure</div>
              <div className="rounded-lg border-l-4 border-orange-500 bg-white/[0.03] px-3 py-2">🎫 Event at Uber Arena ending at 22:30 – expect crowding at Warschauer Str.</div>
            </div>
            <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
              Alternative: RE1 → Frankfurt (Oder) at 17:48, platform 6 (on time)
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-16 md:grid-cols-3">
        {features.map((f) => (
          <article key={f.t} className="glass glass-hover p-5">
            <h2 className="font-semibold text-white">{f.t}</h2>
            <p className="mt-2 text-sm text-slate-400">{f.d}</p>
          </article>
        ))}
      </section>
      <footer className="border-t border-white/5 py-6 text-xs text-slate-500">Data: VBB/HAFAS via transport.rest · Open-Meteo. Not affiliated with VBB, BVG or Deutsche Bahn.</footer>
    </main>
  );
}
