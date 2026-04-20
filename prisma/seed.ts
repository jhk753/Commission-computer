// Seed: two reps, one admin, a plan with three components (commission +
// quarterly bonus + annual kicker), plus realistic won/open deals so the
// dashboard renders something interesting.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.deal.deleteMany({});
  await prisma.planAssignment.deleteMany({});
  await prisma.accelerator.deleteMany({});
  await prisma.planComponent.deleteMany({});
  await prisma.plan.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.integration.deleteMany({});

  const year = new Date().getUTCFullYear();

  const admin = await prisma.user.create({
    data: {
      email: "admin@demo.io",
      name: "Admin Demo",
      role: "admin",
      passwordHash: await bcrypt.hash("admin123", 10),
    },
  });

  const alice = await prisma.user.create({
    data: {
      email: "alice@demo.io",
      name: "Alice Martin",
      role: "rep",
      crmOwnerId: "owner-1",
      passwordHash: await bcrypt.hash("rep12345", 10),
    },
  });
  const bob = await prisma.user.create({
    data: {
      email: "bob@demo.io",
      name: "Bob Lefèvre",
      role: "rep",
      crmOwnerId: "owner-2",
      passwordHash: await bcrypt.hash("rep12345", 10),
    },
  });

  const plan = await prisma.plan.create({
    data: {
      name: `AE Enterprise FY${year}`,
      description: "Plan AE Enterprise avec accélérateurs et kicker",
      periodYear: year,
      ote: 120000,
      baseSalary: 70000,
    },
  });

  // Component 1: commission quarterly on New ARR
  const newArr = await prisma.planComponent.create({
    data: {
      planId: plan.id,
      name: "New ARR – Commission",
      kind: "commission",
      cadence: "quarterly",
      weight: 0.7,
      quotaAnnual: 800000,
      baseRate: 0.08,
      floor: 0.5,
      cap: 0,
      kickerAt100: 0,
    },
  });
  await prisma.accelerator.createMany({
    data: [
      { componentId: newArr.id, fromPercent: 1.0, toPercent: 1.2, multiplier: 1.5 },
      { componentId: newArr.id, fromPercent: 1.2, toPercent: null, multiplier: 2.0 },
    ],
  });

  // Component 2: quarterly bonus on Upsell
  const upsell = await prisma.planComponent.create({
    data: {
      planId: plan.id,
      name: "Upsell – Bonus",
      kind: "bonus",
      cadence: "quarterly",
      weight: 0.2,
      quotaAnnual: 200000,
      baseRate: 0.05,
      floor: 0,
      cap: 2,
      kickerAt100: 0,
    },
  });

  // Component 3: annual kicker — paid once per year if quota hit
  const annualKicker = await prisma.planComponent.create({
    data: {
      planId: plan.id,
      name: "Kicker annuel",
      kind: "bonus",
      cadence: "annually",
      weight: 0.1,
      quotaAnnual: 1000000, // combined revenue threshold
      baseRate: 0,          // no variable — just a flat kicker on attainment
      floor: 1.0,           // only pays if 100% hit
      cap: 0,
      kickerAt100: 10000,
    },
  });

  await prisma.planAssignment.createMany({
    data: [
      { userId: alice.id, planId: plan.id },
      { userId: bob.id, planId: plan.id },
    ],
  });

  // Deals for Alice: mix of won + open across the year
  const baseAlice = [
    { month: 1,  amount: 80000,  stage: "won",  prob: 1,    name: "ACME Corp" },
    { month: 2,  amount: 120000, stage: "won",  prob: 1,    name: "Globex" },
    { month: 3,  amount: 60000,  stage: "won",  prob: 1,    name: "Initech" },
    { month: 4,  amount: 200000, stage: "won",  prob: 1,    name: "Soylent" },
    { month: 5,  amount: 150000, stage: "open", prob: 0.8,  name: "Umbrella" },
    { month: 6,  amount: 90000,  stage: "open", prob: 0.6,  name: "Tyrell" },
    { month: 7,  amount: 75000,  stage: "open", prob: 0.4,  name: "Wayne Ent." },
    { month: 9,  amount: 120000, stage: "open", prob: 0.3,  name: "Hooli" },
    { month: 11, amount: 200000, stage: "open", prob: 0.2,  name: "Pied Piper" },
  ];
  // Deals for Bob: smaller volume but steadier
  const baseBob = [
    { month: 1,  amount: 40000, stage: "won",  prob: 1,    name: "Stark Industries" },
    { month: 2,  amount: 50000, stage: "won",  prob: 1,    name: "Vandelay" },
    { month: 4,  amount: 70000, stage: "won",  prob: 1,    name: "Oscorp" },
    { month: 6,  amount: 100000, stage: "open", prob: 0.7, name: "Dunder Mifflin" },
    { month: 9,  amount: 80000,  stage: "open", prob: 0.5, name: "Cyberdyne" },
  ];

  for (const [user, deals] of [[alice, baseAlice], [bob, baseBob]] as const) {
    for (const d of deals) {
      await prisma.deal.create({
        data: {
          userId: user.id,
          source: "manual",
          sourceId: null,
          name: d.name,
          amount: d.amount,
          currency: "EUR",
          stage: d.stage,
          probability: d.prob,
          closeDate: new Date(Date.UTC(year, d.month - 1, 15)),
          product: "ARR",
        },
      });
    }
    // A couple of upsell deals so component #2 has something to show.
    await prisma.deal.createMany({
      data: [
        {
          userId: user.id, source: "manual",
          name: `${user.name.split(" ")[0]} – Upsell #1`,
          amount: 30000, currency: "EUR", stage: "won",
          probability: 1,
          closeDate: new Date(Date.UTC(year, 2, 20)),
          product: "upsell",
        },
        {
          userId: user.id, source: "manual",
          name: `${user.name.split(" ")[0]} – Upsell #2`,
          amount: 25000, currency: "EUR", stage: "open",
          probability: 0.5,
          closeDate: new Date(Date.UTC(year, 5, 20)),
          product: "upsell",
        },
      ],
    });
  }

  console.log("Seed OK — admin@demo.io/admin123, alice@demo.io/rep12345, bob@demo.io/rep12345");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
