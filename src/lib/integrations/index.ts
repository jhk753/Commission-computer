import { prisma } from "../db";
import { HubSpotProvider } from "./hubspot";
import { SalesforceProvider } from "./salesforce";
import type { CRMDeal, CRMProvider } from "./types";

export type ProviderName = "hubspot" | "salesforce";

export async function getProvider(name: ProviderName): Promise<CRMProvider | null> {
  if (name === "hubspot") {
    // Prefer a Private App token (envvar) if available.
    const envToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (envToken) return new HubSpotProvider(envToken);

    const integ = await prisma.integration.findUnique({ where: { provider: "hubspot" } });
    if (!integ?.accessToken) return null;
    return new HubSpotProvider(integ.accessToken);
  }

  const integ = await prisma.integration.findUnique({ where: { provider: "salesforce" } });
  if (!integ?.accessToken) return null;
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL ?? "https://login.salesforce.com";
  return new SalesforceProvider(integ.accessToken, instanceUrl);
}

// Sync a provider's deals into the Deal table. Deals are upserted on
// (source, sourceId) and linked to a rep by matching the CRM owner id to
// user.crmOwnerId. Unmapped deals are skipped silently — admin will see
// this on the Integrations page.
export async function syncProvider(name: ProviderName, year: number): Promise<{
  fetched: number; synced: number; skipped: number;
}> {
  const provider = await getProvider(name);
  if (!provider) throw new Error(`${name} not configured`);

  const deals = await provider.fetchDeals(year);

  const users = await prisma.user.findMany({ where: { crmOwnerId: { not: null } } });
  const byOwner = new Map(users.map((u) => [u.crmOwnerId!, u.id]));

  let synced = 0, skipped = 0;
  for (const d of deals) {
    const userId = d.ownerExternalId ? byOwner.get(d.ownerExternalId) : undefined;
    if (!userId) { skipped++; continue; }
    await prisma.deal.upsert({
      where: { source_sourceId: { source: name, sourceId: d.sourceId } },
      create: {
        source: name,
        sourceId: d.sourceId,
        userId,
        name: d.name,
        amount: d.amount,
        currency: d.currency,
        stage: d.stage,
        probability: d.probability,
        closeDate: d.closeDate,
        product: d.product,
      },
      update: {
        userId,
        name: d.name,
        amount: d.amount,
        currency: d.currency,
        stage: d.stage,
        probability: d.probability,
        closeDate: d.closeDate,
        product: d.product,
      },
    });
    synced++;
  }
  return { fetched: deals.length, synced, skipped };
}

export type { CRMDeal, CRMProvider };
