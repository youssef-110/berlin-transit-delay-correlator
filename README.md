# 🚄 VBB Pulse: Berlin-Potsdam Transit & Delay Correlator

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.16-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A production-ready, performant, and secure distributed transit intelligence platform for the Berlin & Potsdam metropolitan region. **VBB Pulse** monitors real-time public transit delays, cancellations, and disruptions across the VBB / BVG / S-Bahn Berlin / DB Regio network, correlates them with micro-local weather anomalies and major public events, and automatically alerts commuters via email with intelligent deduplication and zero-spam guarantees.

---

## 🏛️ System Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │               VBB Pulse Engine (Next.js 15)            │
                    │                                                        │
┌────────────────┐  │  ┌───────────────┐   ┌──────────────────────────────┐  │
│  VBB / HAFAS   │──┼─>│ Single-Flight │──>│ Real-time Disruption Engine  │  │
│  REST API v6   │  │  │ In-Memory TTL │   │  - Scheduled vs. Actual      │  │
└────────────────┘  │  │ Cache (60s)   │   │  - Severity & Status Calc    │  │
                    │  └───────────────┘   └──────────────┬───────────────┘  │
┌────────────────┐  │  ┌───────────────┐                  │                  │
│  Open-Meteo    │──┼─>│ Resilient     │──────────────────┼──────────────┐   │
│  Weather API   │  │  │ HTTP Client   │                  │              │   │
└────────────────┘  │  │ (Exponential  │                  ▼              │   │
                    │  │  Backoff +    │   ┌──────────────────────────┐  │   │
┌────────────────┐  │  │  Jitter)      │   │ Correlation Engine       │  │   │
│  Events Radar  │──┼─>│               │──>│  - Weather Impact        │  │   │
│  (Arenas/Messe)│  │  └───────────────┘   │  - Arena / Stadium Crowd │  │   │
└────────────────┘  │                      │  - Route Alternatives    │  │   │
                    │                      └──────────────┬───────────┘  │   │
                    │                                     │              │   │
                    │  ┌───────────────────────────────┐  │              │   │
                    │  │ Smart Anti-Spam Notifier      │◄─┘              │   │
                    │  │  - Disruption Signature Hash  │                 │   │
                    │  │  - Cooldown Window Guard      │                 │   │
                    │  │  - Escalation Delta Detection │                 │   │
                    │  │  - Timezone-Aware Quiet Hours │                 │   │
                    │  └──────────────┬────────────────┘                 │   │
                    │                 ▼                                  │   │
                    │  ┌───────────────────────────────┐                 │   │
                    │  │ Unified Email Transport       │                 │   │
                    │  │  1. Resend API                │                 │   │
                    │  │  2. SMTP (Nodemailer Pool)    │                 │   │
                    │  │  3. Console Mock (Fallback)   │                 │   │
                    │  └──────────────┬────────────────┘                 │   │
                    └─────────────────┼──────────────────────────────────┼───┘
                                      │                                  │
                                      ▼                                  ▼
                             ┌─────────────────┐                ┌─────────────────┐
                             │ Commuter Alerts │                │ Live Dashboard  │
                             │ (HTML Email)    │                │ (Web Telemetry) │
                             │ + In-App Modal  │                │                 │
                             └─────────────────┘                └─────────────────┘
```

---

## ⚡ Core Features

### 1. High-Precision Transit Disruption Telemetry
- Integrates with the public **VBB REST API v6** (`https://v6.vbb.transport.rest`) with resilient fallback logic.
- Analyzes scheduled departure (`plannedWhen`) vs. real-time estimated departure (`when`), identifying delays and cancellations across:
  - **S-Bahn Berlin**: S7, S1, S3, S5, S9, S41/S42 Ringbahn, S2, S25, etc.
  - **DB Regio / Regionalbahn**: RE1 (Magdeburg–Potsdam–Berlin–Frankfurt/Oder), RB23, RB21, FEX Airport Express.
  - **BVG U-Bahn**: U2, U5, U8, U1/U3, U6, U7.
  - **Trams & Buses**: M10, M4, Tram 91/92/96 (ViP Potsdam).
- Evaluates key hubs: **Potsdam Hbf, Alexanderplatz, Friedrichstraße, Zoologischer Garten, Berlin Hbf, Warschauer Str., Ostkreuz, Messe Süd, Olympiastadion, Babelsberg**.

### 2. Multi-Source Contextual Correlation Engine
- **Weather Anomaly Detection (Open-Meteo)**: Zero-friction real-time meteorological queries for Berlin (`52.52, 13.40`) and Potsdam (`52.39, 13.06`). Detects:
  - Heavy rain (`≥ 7.6 mm/h` / `≥ 15 mm/h`) → track flooding and reduced track adhesion.
  - Snowfall & hard frost → switch heating failure (*Weichenstörung*).
  - High wind gusts (`≥ 62 km/h`) → fallen trees and catenary line damage.
  - Severe thunderstorms & lightning → signaling power outages.
- **Major Events & Crowd Drivers**: Automatically correlates incidents with high-density events at:
  - **Olympiastadion Berlin** (Hertha BSC, DFB-Pokal, stadium concerts).
  - **Uber Arena** (Eisbären Berlin DEL, ALBA Berlin EuroLeague, arena tours).
  - **Messe Berlin / CityCube** (Grüne Woche, ITB, IFA, InnoTrans).
  - **Park Babelsberg / Filmpark** (festivals, open-air concerts).
  - Extensible adapter architecture for live **Ticketmaster Discovery API**.
- **Alternative Route Suggester**: Scans live departure boards for immediate on-time parallel departures heading to the same destination corridor, or suggests curated bypass corridors.

### 3. Smart Anti-Spam Notification Engine (Idempotent State Machine)
- **Problem**: Naive background pollers spam users every 2 minutes for the same ongoing delay.
- **Solution**: Multi-layered idempotency state machine:
  1. **Disruption Signature Hashing**: `SHA-256(lineName | stopId | direction | status | remarkKey)`.
  2. **Threshold Filter**: Alerts only if delay $\ge$ user's configured threshold (e.g., 5 min). Cancellations always qualify.
  3. **Escalation Rules**: Re-alerts on ongoing incidents **only** if the delay increases significantly (e.g., $+10$ minutes or status flips to `CANCELLED`).
  4. **Cooldown Enforcement**: Ensures a minimum quiet period (e.g., 60 minutes) per tracked line.
  5. **Timezone-Aware Quiet Hours**: Honors `Europe/Berlin` midnight-wrapping quiet hours (e.g., `22:00` to `06:30`).

### 4. Resilient Email Pipeline & In-App Diagnostics
- **Automatic Fallback Transport**:
  1. Priority 1: **Resend** HTTP API (if `RESEND_API_KEY` is supplied).
  2. Priority 2: **SMTP** via pooled Nodemailer (if `SMTP_HOST` is supplied).
  3. Priority 3: **Console Mock Transport** (zero-config local dev with full formatted output and in-dashboard HTML preview).
- **In-Dashboard Email Setup**: Configure Resend API keys or SMTP credentials directly in the dashboard UI with 1-click test delivery verification.
- **Instant Test Delay Button**: A dedicated dashboard trigger generates a realistic delay scenario with live weather and event context and fires an immediate test email, providing instantaneous end-to-end verification.
- **Audit Log & In-App HTML Email Preview**: Dispatched emails are recorded in the database, allowing users to inspect the exact rendered email in an isolated iframe.

### 5. Serverless & Cron Scheduling
- **Built-in Node.js Background Poller**: Automatically starts on server boot for long-running deployments (e.g., Docker, VPS).
- **Vercel Cron Endpoint**: `/api/cron/poll` secured via `CRON_SECRET` for serverless environments (configured in `vercel.json` every 10 minutes).

---

## 📂 Directory Structure

```
vbb-pulse/
├── .env.example                     # Environment template with documentation
├── .gitignore                       # Git ignore list
├── next.config.ts                   # Next.js configuration with security headers
├── package.json                     # Dependencies and npm scripts
├── postcss.config.mjs               # PostCSS configuration for Tailwind CSS v4
├── tsconfig.json                    # Strict TypeScript configuration
├── vercel.json                      # Vercel Cron schedule definition
├── prisma/
│   ├── schema.prisma                # Database schema (User, TrackedLine, AlertState, AlertLog)
│   └── seed.ts                      # Database seeder (Demo user + verified commuter lines)
└── src/
    ├── instrumentation.ts           # Next.js server bootstrap (starts poller in Node runtime)
    ├── middleware.ts                # Edge auth protection, CSRF defense, route redirects
    ├── app/
    │   ├── globals.css              # Tailwind CSS v4 design system
    │   ├── layout.tsx               # Root layout with typography and metadata
    │   ├── page.tsx                 # Landing page with live preview showcase
    │   ├── login/page.tsx           # User login page
    │   ├── register/page.tsx        # User registration page
    │   ├── dashboard/page.tsx       # Server-rendered commuter dashboard
    │   └── api/
    │       ├── auth/                # Login, register, logout with sliding-window rate limiting
    │       ├── profile/route.ts     # User threshold, cooldown, quiet hours settings
    │       ├── settings/email/      # Real-time email transport configuration & verification
    │       ├── lines/               # Tracked commuter line management (IDOR-safe)
    │       ├── stations/route.ts    # Live VBB station search autocomplete
    │       ├── status/route.ts      # Live dashboard telemetry JSON endpoint
    │       ├── cron/poll/route.ts   # Vercel Cron & external scheduler endpoint
    │       ├── alerts/test/route.ts # Instant "Send Test Delay Email" trigger
    │       ├── alerts/[id]/preview/ # Rendered HTML email viewer (owner-only)
    │       ├── poller/run/route.ts  # Manual poll cycle trigger
    │       └── health/route.ts      # Database & system health probe
    ├── components/
    │   ├── ui.tsx                   # Logo, LineBadges with official VBB product colorways
    │   ├── AuthForm.tsx             # Shared login / register client form
    │   ├── DashboardClient.tsx      # Interactive dashboard, modals & telemetry cards
    │   └── EmailSettingsModal.tsx   # Modal for configuring Resend/SMTP live delivery
    ├── lib/
    │   ├── api.ts                   # API route error handlers and body parser
    │   ├── auth.ts                  # Password hashing (bcryptjs) & user session resolution
    │   ├── cache.ts                 # Single-flight TTL cache (prevents rate limits)
    │   ├── db.ts                    # Prisma Client singleton
    │   ├── env.ts                   # Zod-validated environment config
    │   ├── http.ts                  # Resilient fetch with exponential backoff & jitter
    │   ├── logger.ts                # Structured JSON / dev logger
    │   ├── rate-limit.ts            # Sliding-window in-memory rate limiter
    │   ├── sanitize.ts              # HTML escaping & email header injection prevention
    │   ├── session.ts               # Edge-safe HS256 JWT cookie management
    │   ├── time.ts                  # Europe/Berlin time, quiet hours & DST calculations
    │   └── validation.ts            # Zod validation schemas for all inputs
    └── services/
        ├── alerts/
        │   ├── dedup.ts             # Pure anti-spam deduplication & escalation rules
        │   └── notifier.ts          # Alert dispatch state machine & test scenario builder
        ├── correlation/
        │   └── engine.ts            # Delay detection, weather & event correlation engine
        ├── email/
        │   ├── template.ts          # Responsive HTML & plain-text email generator
        │   └── transport.ts         # Resend / SMTP / Console fallback dispatcher
        ├── events/
        │   ├── types.ts             # Event aggregator domain types
        │   ├── aggregator.ts        # Fault-isolated event combiner
        │   ├── seeded-venues.ts     # Stadium / arena schedule simulation & fair dates
        │   └── ticketmaster.ts      # Optional live Ticketmaster Discovery adapter
        ├── poller/
        │   └── poller.ts            # Background poller service with overlap protection
        ├── status.ts                # Per-user status DTO aggregator
        └── transit/
            ├── hubs.ts              # Curated Berlin/Potsdam hubs & fallback corridors
            └── vbb.ts               # VBB/HAFAS REST API client
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18.18.0 or newer (Node v20+ recommended).
- **npm** / **pnpm** / **yarn**.

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/youssef-110/berlin-transit-delay-correlator.git
cd berlin-transit-delay-correlator
npm install
```

### Step 2: Configure Environment
Copy the example environment template:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

By default, `.env` uses SQLite (`dev.db`) and the **Console Mock Email Transport**, meaning **no external email credentials or API keys are required to get started immediately**.

### Step 3: Run Database Migrations & Seed Data
```bash
npx prisma db push
npx tsx prisma/seed.ts
```

This initializes the database and seeds a ready-to-test commuter account:
- **Email**: `commuter@vbbpulse.local`
- **Password**: `berlin-transit-2026!`
- **Pre-tracked lines**:
  - `S7` (S Potsdam Hauptbahnhof → Ahrensfelde)
  - `RE1` (S Potsdam Hauptbahnhof → Frankfurt (Oder))
  - `U2` (S+U Alexanderplatz Bhf → Ruhleben)
  - `M10` (S+U Warschauer Str. → Moabit)

### Step 4: Start the Development Server
```bash
npm run dev
```

Open your browser to:
[http://localhost:3000](http://localhost:3000)

### Step 5: Test Real-Time Alerts
1. Log in with `commuter@vbbpulse.local` and `berlin-transit-2026!` (or create a new account).
2. Click **"Send Test Delay Email"** in the top navigation bar.
3. The server immediately simulates a real-world delay scenario with live weather and event insights:
   - If using the mock transport, the complete formatted email is printed to your terminal.
   - Click **"View Rendered HTML Email"** in the dashboard banner to view the responsive email layout in an in-app preview modal.
4. To enable real email delivery to your inbox, click the **"Configure Real Email Delivery"** button to enter a free [Resend API key](https://resend.com) or custom SMTP credentials.

---

## 🌐 Deployment

### Deploying on Vercel
1. Push your repository to GitHub.
2. Import the project into [Vercel](https://vercel.com).
3. Set the following Environment Variables in the Vercel dashboard:
   - `DATABASE_URL`: A cloud PostgreSQL connection string (e.g. Neon, Supabase, Railway).
   - `SESSION_SECRET`: A secure 32+ character random string.
   - `APP_URL`: Your production URL (e.g. `https://vbb-pulse.vercel.app`).
   - `RESEND_API_KEY`: Your Resend API key for real email delivery.
   - `CRON_SECRET`: Random secret string to secure `/api/cron/poll`.
4. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
5. Deploy! Vercel automatically detects `vercel.json` and invokes `/api/cron/poll` every 10 minutes.

### Deploying on Docker / Node VPS
VBB Pulse includes a native long-running background poller in `src/instrumentation.ts` that runs automatically in Node.js server environments:
```bash
npm run build
npm run start
```

---

## 🛡️ Security & Reliability Architecture

1. **Password Hashing**: Passwords hashed using `bcrypt` with 12 salt rounds. Login timing attacks are mitigated through dummy hash evaluation for non-existent users.
2. **Session Security**:
   - Cryptographically signed JWT session tokens using HS256 (`jose`).
   - Stored exclusively in `HttpOnly`, `SameSite=Strict`, `Path=/` cookies.
   - Validated via Next.js Edge middleware.
3. **CSRF & Origin Verification**: Mutating API calls (`POST`, `PUT`, `DELETE`) are verified against origin and host headers.
4. **Rate Limiting**: Sliding-window in-memory rate limiter on authentication routes (`/api/auth/login`, `/api/auth/register`), preventing credential stuffing.
5. **Input & Body Validation**: Strict Zod schemas with maximum payload size limits (16 KB) on all JSON route handlers.
6. **Email Injection Prevention**: All subject headers are stripped of CRLF control characters (`\r`, `\n`). HTML body attributes and texts are fully escaped.
7. **Graceful Upstream Degradation**: If Open-Meteo or the event aggregator experiences upstream downtime, transit telemetry and delay alerting continue operating uninterrupted.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
