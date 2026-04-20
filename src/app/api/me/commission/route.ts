import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeRepYear } from "@/lib/commission-engine";

export async function GET(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getUTCFullYear());

  const assignment = await prisma.planAssignment.findFirst({
    where: { userId: s.sub, plan: { periodYear: year } },
    include: { plan: { include: { components: { include: { accelerators: true } } } } },
  });
  if (!assignment) return NextResponse.json({ error: "no plan" }, { status: 404 });

  const deals = await prisma.deal.findMany({
    where: {
      userId: s.sub,
      closeDate: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
  });

  const view = computeRepYear({
    components: assignment.plan.components,
    deals,
    year,
    now: new Date(),
    ote: assignment.plan.ote,
    baseSalary: assignment.plan.baseSalary,
  });
  return NextResponse.json(view);
}
