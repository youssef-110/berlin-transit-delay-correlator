# 🚀 Vercel Deployment & GitHub Push Guide

This folder (`vbb-pulse-github`) is **100% ready to push to GitHub and deploy to Vercel**.
All build caches, temporary files, `node_modules`, and secret files (`.env`, `dev.db`) have been omitted so your repository remains clean, secure, and compliant.

---

## 📋 Step 1: Push to GitHub

Open **PowerShell** or terminal, navigate to this folder, and run:

```bash
cd c:\Users\rryou\Downloads\vbb-pulse-github

# Initialize git repository
git init

# Stage all files
git add .

# Commit
git commit -m "feat: VBB Pulse transit correlator ready for Vercel"

# Rename branch to main
git branch -M main

# Link to your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git

# Push to GitHub
git push -u origin main
```

---

## 🗄️ Step 2: Set Up Free Cloud PostgreSQL (Neon.tech)

> **Why?** Vercel runs on AWS Lambda serverless functions with a read-only filesystem. Local SQLite (`dev.db`) cannot persist across serverless invocations. PostgreSQL is required for production.

1. Go to **[neon.tech](https://neon.tech)** and sign up for a free account.
2. Click **Create Project** (e.g. `vbb-pulse`).
3. Copy your **PostgreSQL Connection String**:
   ```
   postgresql://username:password@ep-cool-butterfly-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. From your computer, apply the database schema to your cloud Postgres:
   ```bash
   # In PowerShell inside vbb-pulse-github:
   $env:DATABASE_URL="YOUR_NEON_POSTGRESQL_CONNECTION_STRING"
   npx prisma db push
   ```

*(Alternative: You can also use [Supabase](https://supabase.com) or Vercel Postgres).*

---

## ⚡ Step 3: Deploy to Vercel

1. Log in to **[vercel.com](https://vercel.com)**.
2. Click **Add New...** → **Project**.
3. Import your GitHub repository (`vbb-pulse`).
4. In the **Environment Variables** section, add the following variables:

| Variable Name | Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://...` | Your Neon / Supabase Postgres connection string |
| `RESEND_API_KEY` | `re_MmwD6uqn_67Hg3jmKwpA8HxpQDy6qyrW8` | Your active Resend API key |
| `EMAIL_FROM` | `VBB Pulse <onboarding@resend.dev>` | Email sender address |
| `SESSION_SECRET` | `VSTfc_GsUc2AR3OwLPWYJTaaC4NnUPk5FuQsYixhZofI2thvSKXrrbLgM0PriGHB` | Session encryption key |
| `APP_URL` | `https://your-project-name.vercel.app` | Your Vercel domain |
| `CRON_SECRET` | `vbb_cron_secret_2026` | *(Optional)* Protects the background cron endpoint |

5. Click **Deploy**. Vercel will install dependencies, generate the Prisma client, build Next.js 15, and launch your site!

---

## ⏱️ Step 4: Background Polling on Vercel

- **Vercel Cron**: A `vercel.json` file is already included in this repository. It automatically schedules background disruption checks via `/api/cron/poll`.
- **Free 2-Minute Polling (Optional)**: If you want checks every 2 minutes without upgrading to Vercel Pro, create a free job on **[cron-job.org](https://cron-job.org)** pointing to:
  `GET https://your-project-name.vercel.app/api/cron/poll`
