import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding VBB Pulse database...");

  const demoEmail = "commuter@vbbpulse.local";
  const passwordHash = await bcrypt.hash("berlin-transit-2026!", 12);

  // Upsert demo user
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash },
    create: {
      email: demoEmail,
      passwordHash,
      delayThresholdMin: 5,
      cooldownMinutes: 60,
      quietHoursStart: "23:00",
      quietHoursEnd: "06:00",
      emailEnabled: true,
    },
  });

  console.log(`👤 Demo user created/updated: ${user.email} (id: ${user.id})`);

  // Default commuter lines (Potsdam - Berlin corridor + trunk lines)
  const lines = [
    {
      lineName: "S7",
      stopId: "900230999",
      stopName: "S Potsdam Hauptbahnhof",
      direction: "Ahrensfelde",
    },
    {
      lineName: "RE1",
      stopId: "900230999",
      stopName: "S Potsdam Hauptbahnhof",
      direction: "Frankfurt (Oder)",
    },
    {
      lineName: "U2",
      stopId: "900100003",
      stopName: "S+U Alexanderplatz Bhf",
      direction: "Ruhleben",
    },
    {
      lineName: "M10",
      stopId: "900120004",
      stopName: "S+U Warschauer Str.",
      direction: "Moabit",
    },
  ];

  for (const l of lines) {
    await prisma.trackedLine.upsert({
      where: {
        userId_lineName_stopId_direction: {
          userId: user.id,
          lineName: l.lineName,
          stopId: l.stopId,
          direction: l.direction,
        },
      },
      update: {},
      create: {
        userId: user.id,
        lineName: l.lineName,
        stopId: l.stopId,
        stopName: l.stopName,
        direction: l.direction,
      },
    });
  }
  console.log(`🚆 Seeded ${lines.length} tracked commute lines for ${user.email}`);

  // Seed one initial historical alert log so audit UI displays nicely on first run
  const existingLog = await prisma.alertLog.findFirst({ where: { userId: user.id } });
  if (!existingLog) {
    await prisma.alertLog.create({
      data: {
        userId: user.id,
        lineName: "S7",
        stopName: "S Potsdam Hauptbahnhof",
        direction: "Ahrensfelde",
        status: "DELAYED",
        delayMin: 14,
        reason: "NEW",
        context: JSON.stringify({
          insights: [
            {
              kind: "weather",
              severity: "high",
              message: "Heavy rain detected (14mm/h) in Potsdam area",
              detail: "Likely factor for S-Bahn switch failure",
            },
            {
              kind: "event",
              severity: "moderate",
              message: "Event at Uber Arena ending at 22:30",
              detail: "Expect platform overcrowding at Warschauer Str.",
            },
          ],
          alternative: "RE1 from Potsdam Hbf (platform 6) on time",
        }),
        subject: "S7 delayed +14 min – Potsdam Hbf → Ahrensfelde",
        emailHtml: "<p>Sample seed notification</p>",
        transport: "console",
        delivered: true,
        isTest: false,
      },
    });
    console.log("📜 Seeded initial alert history log.");
  }

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
