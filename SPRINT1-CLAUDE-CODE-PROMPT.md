# Sprint 1 — Prompt de démarrage Claude Code
> À coller dans Claude Code au lancement de la session, dans un repo vide.

---

## Contexte

Tu es l'assistant de développement du **Project Lifecycle Orchestrator (PLO)**, un outil de suivi et de détection d'anomalies pour un retailer bricolage & aménagement de la maison omnicanal. Le SPEC complet est dans `SPEC.md` à la racine du repo — **lis-le intégralement avant d'écrire la moindre ligne de code**.

---

## Objectif de ce sprint

Construire les **fondations de données** du PLO : schéma PostgreSQL, migrations Prisma, types TypeScript, et seed de démonstration. Rien d'autre — pas d'API, pas de frontend.

---

## Stack imposée

- **Runtime :** Node.js 20+ / TypeScript strict (`"strict": true`)
- **ORM :** Prisma 5+ avec PostgreSQL 15+
- **Base de données :** PostgreSQL (Docker Compose pour le dev local)
- **Package manager :** pnpm
- **Pas de framework applicatif dans ce sprint** — uniquement Prisma + scripts TypeScript

---

## Livrables attendus du Sprint 1

### 1. Structure du repo

```
plo/
├── prisma/
│   ├── schema.prisma        ← schéma complet
│   └── migrations/          ← générées par prisma migrate dev
├── src/
│   ├── types/
│   │   └── index.ts         ← tous les types TypeScript métier
│   └── seed/
│       └── index.ts         ← seed de démonstration
├── docker-compose.yml       ← PostgreSQL 15 local
├── package.json
├── tsconfig.json
├── .env.example
└── SPEC.md                  ← copie du spec (fourni)
```

### 2. Schéma Prisma — entités à modéliser

Modélise exactement ces entités dans cet ordre, en respectant scrupuleusement les champs du SPEC :

1. **Project** — dossier client (channel_origin, store_id, customer_id, project_type, status, metadata Json)
2. **ProjectExternalRef** — mapping cross-systèmes (project_id, source, ref) — contrainte unique (source, ref)
3. **Order** — commande (project_id, erp_order_ref, ecommerce_order_ref, status, delivery_address Json, installation_address Json, installation_required, lead_time_days, promised_delivery_date, promised_installation_date, metadata Json)
4. **OrderLine** — ligne de commande (order_id, sku, label, quantity, unit_price, installation_required, stock_status, metadata Json)
5. **Shipment** — tronçon de transport (order_id, project_id, oms_ref, leg_number, origin_type, origin_ref, destination_station_id, carrier, carrier_tracking_ref, status, estimated_arrival, actual_arrival, metadata Json)
6. **Consolidation** — agrégation en delivery station (project_id, station_id, station_name, status, orders_required String[], orders_arrived String[], estimated_complete_date, partial_delivery_approved, partial_approved_by Json, metadata Json)
7. **LastMileDelivery** — livraison client finale (project_id, consolidation_id, tms_delivery_ref, carrier, status, delivery_address Json, scheduled_date, scheduled_slot Json, is_partial, missing_order_ids String[], delivered_at, pod_url)
8. **Installation** — intervention à domicile (project_id, status, installation_address Json, scheduled_date, scheduled_slot Json, technician_id, technician_name, wfm_job_ref, orders_prerequisite String[], started_at, completed_at, report Json)
9. **Step** — étape du cycle de vie (project_id?, order_id?, installation_id? — exactement un non-null, step_type, status, expected_at, completed_at, assigned_to, metadata Json)
10. **Event** — événement horodaté (project_id, order_id?, installation_id?, step_id, event_type, source, source_ref, severity, payload Json, processed_at, acknowledged_by)
11. **AnomalyRule** — règle d'anomalie (name, scope, step_type, condition Json, severity, action Json, active)
12. **Notification** — notification sortante (project_id, order_id?, installation_id?, event_id, rule_id, channel, recipient, status, sent_at)

### Contraintes importantes sur le schéma :

- Tous les champs `Json` utilisent le type `Json` de Prisma (pas `String`)
- `Step` : ajoute un `@@check` ou une note de validation applicative — exactement un parmi `project_id`, `order_id`, `installation_id` doit être non-null
- `Event.source_ref` + `Event.source` : index unique pour la déduplication (`@@unique([source, source_ref])`)
- Tous les modèles ont `created_at DateTime @default(now())` et `updated_at DateTime @updatedAt`
- Utilise des enums Prisma pour les champs à valeurs fixes : `ProjectStatus`, `OrderStatus`, `ShipmentStatus`, `ConsolidationStatus`, `LastMileStatus`, `InstallationStatus`, `StepStatus`, `EventSeverity`, `NotificationChannel`, `NotificationStatus`
- Les champs `metadata` et `payload` sont `Json?` (nullable)

### 3. Types TypeScript

Dans `src/types/index.ts`, exporte :
- Un type TypeScript pour chaque entité Prisma (utilise `Prisma.ProjectGetPayload<{}>` etc.)
- Des types utilitaires pour les payloads JSON typés :
  - `DeliveryAddress` — { street, city, zip, country, floor?, access_code? }
  - `TimeSlot` — { start: string, end: string }
  - `InstallationReport` — { summary, issues[], reserves[], photos[], customer_signature }
  - `ConsolidationPartialApproval` — { customer: boolean, installer: boolean, approved_at: string }
  - `OmsShipmentPayload` — payload normalisé attendu de l'OMS
  - `TmsLastMilePayload` — payload normalisé attendu du TMS last mile
- L'enum `EventType` avec toutes les valeurs (`inspiration.started`, `stock.shortage`, `shipment.arrived_at_station`, `consolidation.complete`, `lastmile.delivered`, etc.) — liste exhaustive depuis le SPEC section 3

### 4. Seed de démonstration

Dans `src/seed/index.ts`, crée un scénario complet et réaliste :

**Scénario : Projet cuisine "Famille Dubois" avec anomalie active**

- 1 Project (type: kitchen, status: active, channel: mixed)
- 2 ProjectExternalRef (ERP ref + CRM ref)
- 2 Orders :
  - CMD-A : 4 lignes SKU (dont 1 en stock_status: shortage), delivery_address Lyon 7ème
  - CMD-B : 2 lignes SKU, même adresse
- 4 OrderLines pour CMD-A, 2 pour CMD-B
- 3 Shipments :
  - CMD-A : 2 legs (entrepôt → cross-dock Mâcon → station Lyon)
  - CMD-B : 1 leg direct (magasin → station Lyon)
- 1 Consolidation (status: in_progress, 1 commande arrivée sur 2, estimated_complete_date dans 3 jours)
- Steps correspondants à chaque étape franchie
- Events correspondants à chaque step (avec sources variées : erp, oms, manual)
- 1 AnomalyRule ANO-16 active (ETA Shipment dépasse date promise)
- 1 Notification générée (status: pending, channel: internal_alert)

Le seed doit être **idempotent** : s'il est lancé deux fois, il ne crée pas de doublons (utilise `upsert` ou `deleteMany` en début de script).

---

## Commandes à fournir

À la fin, donne-moi les commandes exactes pour :

```bash
# 1. Installer les dépendances
pnpm install

# 2. Démarrer PostgreSQL
docker-compose up -d

# 3. Appliquer les migrations
pnpm prisma migrate dev --name init

# 4. Générer le client Prisma
pnpm prisma generate

# 5. Lancer le seed
pnpm tsx src/seed/index.ts

# 6. Vérifier dans Prisma Studio
pnpm prisma studio
```

---

## Critères de validation du Sprint 1

- [ ] `pnpm prisma migrate dev` s'exécute sans erreur
- [ ] `pnpm prisma studio` affiche toutes les tables avec les bonnes colonnes
- [ ] `pnpm tsx src/seed/index.ts` insère le scénario Dubois sans erreur
- [ ] Le seed est idempotent (2ème exécution = pas d'erreur, pas de doublon)
- [ ] TypeScript compile sans erreur (`pnpm tsc --noEmit`)
- [ ] Tous les champs du SPEC sont présents dans le schéma

---

## Ce que tu NE dois PAS faire dans ce sprint

- Pas d'API REST ou GraphQL
- Pas de frontend
- Pas de logique métier (moteur d'anomalie, notifications) — seulement les données
- Pas de tests unitaires (sprint 3)
- Ne pas simplifier le schéma : chaque entité du SPEC doit exister, même si elle semble complexe

---

## Note sur la contrainte XOR de Step

Prisma ne supporte pas nativement les contraintes CHECK complexes. Implémente la validation XOR au niveau applicatif dans un fichier `src/lib/validators.ts` :

```typescript
export function validateStep(data: { project_id?: string, order_id?: string, installation_id?: string }) {
  const nonNullCount = [data.project_id, data.order_id, data.installation_id]
    .filter(Boolean).length;
  if (nonNullCount !== 1) {
    throw new Error('Step must have exactly one of: project_id, order_id, installation_id');
  }
}
```

Et ajoute un commentaire dans le schéma Prisma pour documenter cette contrainte.
