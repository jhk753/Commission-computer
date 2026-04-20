# Commission Computer

Une app web façon Qobra : connecte HubSpot ou Salesforce, configure des
plans de commission composables (commission trimestrielle, bonus annuel,
accélérateurs, kickers, floor, cap…) et permet à chaque commercial de
voir son estimation de commission **fin de trimestre** et **fin d'année**
en temps réel.

## Démo locale

```bash
npm install
cp .env.example .env       # rien à modifier pour la démo locale
npm run setup              # prisma generate + db push + seed
npm run dev
```

Comptes seedés :

| Email           | Mot de passe | Rôle  |
| --------------- | ------------ | ----- |
| admin@demo.io   | admin123     | admin |
| alice@demo.io   | rep12345     | rep   |
| bob@demo.io     | rep12345     | rep   |

## Concepts

### Plan
Un **plan** s'applique à une année fiscale, a un OTE et un salaire de base.
Il contient une ou plusieurs **composantes**.

### PlanComponent
Chaque composante a :
- un **type** (`commission`, `bonus`, `sdr_meeting`, `mbo`)
- une **cadence** de paiement (`monthly`, `quarterly`, `annually`)
- un **quota annuel**
- un **taux de base** (% de l'attainment versé)
- un **floor** (gate sous lequel rien n'est payé)
- un **cap** (multiple maximum du taux de base)
- un **kicker** (bonus fixe à 100% d'attainment)
- une liste d'**accélérateurs** par paliers

Le quota annuel est automatiquement réparti par période selon la cadence
(quota Q = quota_annuel/4, quota mois = quota_annuel/12).

### Accélérateur
Un accélérateur multiplie le taux de base sur la portion d'attainment
au-delà d'un seuil.

Exemple — sur le composant *New ARR* :
- 0–100% : taux de base 8%
- 100–120% : 8% × 1.5 = 12%
- >120% : 8% × 2.0 = 16%

Le calcul est *intégré* sur les bandes : toucher 130% rapporte
8% × 100% + 12% × 20% + 16% × 10% du quota.

### Estimation
Pour le tableau de bord du commercial, chaque période montre :
- ✅ **Acquis** : commission sur les deals `won`
- 🟪 **Projeté** : `acquis + pipeline pondéré + run-rate top-up`

Le *run-rate top-up* extrapole les deals gagnés à ce jour au rythme
restant de la période — utile en début de trimestre quand la pipeline
est encore mince.

## Architecture

```
src/
├── app/                     Next.js App Router
│   ├── page.tsx             Landing
│   ├── login/               Auth (server actions)
│   ├── dashboard/           Vue commercial
│   ├── admin/
│   │   ├── plans/           CRUD plans + composantes + accélérateurs
│   │   ├── users/           Gestion équipe + mapping CRM
│   │   └── integrations/    HubSpot / Salesforce
│   └── api/me/commission/   API JSON (engine output)
├── lib/
│   ├── commission-engine.ts Cœur de calcul (testable, pur)
│   ├── period.ts            Découpage fiscal mensuel/trim/annuel
│   ├── auth.ts              Sessions JWT (jose) + bcrypt
│   ├── db.ts                Prisma singleton
│   └── integrations/        Adapters CRM (HubSpot, Salesforce)
└── components/Shell.tsx     Layout authentifié
```

## Brancher un vrai CRM

### HubSpot
1. Crée une *Private App* dans Settings → Integrations → Private Apps
2. Donne-lui les scopes `crm.objects.deals.read` et `crm.objects.owners.read`
3. Va sur **/admin/integrations** et colle l'access token (`pat-na1-…`)
4. Pour chaque rep, renseigne son `hubspot_owner_id` dans **/admin/users**
5. Clique **Synchroniser les deals**

### Salesforce
1. Crée une Connected App, OAuth web flow
2. Récupère un access token (via OAuth ou `sfdx force:auth`) et l'instance URL
3. Renseigne-les sur **/admin/integrations**
4. Pour chaque rep, renseigne son Salesforce `OwnerId` dans **/admin/users**
5. Clique **Synchroniser**

L'adapter requête `Opportunity` via SOQL et normalise stage/probability.
Si tu veux passer en OAuth complet (refresh tokens), les colonnes
`Integration.refreshToken` / `expiresAt` sont déjà prêtes — il suffit
d'ajouter une route `/api/integrations/{provider}/callback`.

## Tester le moteur seul

Le moteur est pur (pas de DB), testable sans Next.js :

```ts
import { computeComponent } from "@/lib/commission-engine";
import { quarterPeriods } from "@/lib/period";

const period = quarterPeriods(2026)[0];
const result = computeComponent({
  component: { /* … */, accelerators: [/* … */] },
  deals: [/* … */],
  period,
  now: new Date(),
});
console.log(result.projectedPayout);
```

## Stack

- **Next.js 14** App Router, Server Actions
- **Prisma + SQLite** (basculer vers Postgres = changer `provider`)
- **Tailwind CSS**
- **jose + bcryptjs** pour l'auth (pas de NextAuth)
- **TypeScript strict**
