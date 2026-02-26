# SPEC.md — Project Lifecycle Orchestrator (PLO)
> Outil de suivi et d'agrégation des événements du cycle de vie d'un projet client
> Retailer bricolage & aménagement de la maison — Omnicanal — v1.0

---

## 1. Contexte et objectifs

### Problème à résoudre
La chaîne de valeur d'un projet client (de l'inspiration à l'installation) implique de nombreux outils informatiques dissociés et des équipes opérationnelles insuffisamment coordonnées. Il en résulte :
- Des produits indisponibles ou oubliés lors de la préparation de commande
- Des installateurs qui arrivent sans le bon matériel
- Des clients non informés des retards ou problèmes
- Une détection tardive des anomalies, traitées en mode réactif plutôt qu'anticipatif

### Vision de l'outil
Le PLO est un **agrégateur d'événements et un système d'alerte précoce** qui centralise, dans une vue unifiée par dossier client, tous les événements du cycle de vie d'un projet — de son inspiration à sa réalisation. Il fonctionne comme un hub d'intégration normalisé : les outils existants poussent leurs événements, et le PLO détecte les anomalies, déclenche des alertes, et permet des mises à jour manuelles pour les étapes sans intégration.

### Priorité v1
**Détection anticipée des anomalies** — avant la visibilité interne et la communication client.

---

## 2. Entités métier

### Hiérarchie des données

```
Project (1)                ← étapes amont : Inspiration, Devis produits, Devis pose
  └── Order (N)            ← étapes par commande : Stock, Picking, Expédition → Delivery Station
        └── OrderLine (N)
              ├── sku
              └── quantity
        └── Shipment (N)   ← legs de transport : source → delivery station(s) → client
  └── Consolidation (1)    ← niveau projet : agrégation de toutes les commandes en station
                              avant last mile vers le client
  └── LastMileDelivery (1) ← livraison client finale (après consolidation)
  └── Installation (0/1)   ← optionnelle, après livraison client complète (ou accord partiel)
```

**Règles structurantes :**
- Un Order suit le trajet de ses produits depuis la source (entrepôt, magasin, fournisseur) jusqu'à la delivery station, via un ou plusieurs Shipments (cross-docking possible)
- La **Consolidation** est l'étape projet qui surveille l'arrivée de toutes les commandes en station et calcule la date prévisionnelle de livraison client
- Le **last mile** (livraison client) ne part qu'après consolidation complète — sauf accord explicite client ET installateur (livraison partielle consentie)
- L'**Installation** ne peut être planifiée qu'après `lastmile.delivered` ou accord partiel validé
- Le PLO ne pilote pas l'OMS / les applications de bufferisation : il **observe** les événements poussés et **alerte** en cas de dérive de planning
- Les Steps amont (Inspiration, Devis) → **Project**
- Les Steps de fulfillment (Stock, Picking, Expédition) → **Order**
- Les Steps de consolidation et last mile → **Project** (vue agrégée)
- Les Steps d'installation → **Installation**

---

### 2.1 Project (Dossier Client)

| Champ | Type | Description |
|---|---|---|
| `project_id` | UUID | Identifiant unique, généré à la création |
| `channel_origin` | string | `store` / `web` / `mixed` |
| `store_id` | string | Magasin référent (si applicable) |
| `customer_id` | string | Identifiant client (CRM) |
| `project_type` | string | `kitchen` / `bathroom` / `energy_renovation` / `other` |
| `status` | string | `draft` / `active` / `on_hold` / `completed` / `cancelled` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `metadata` | JSONB | Données libres (ex: liens vers outils inspiration, devis) |

**Steps rattachés au Project :**
- `inspiration`
- `quote_products`
- `quote_installation`
- `consolidation_in_progress` — au moins une commande arrivée en station, attente des autres
- `consolidation_complete` — toutes les commandes prérequises présentes en station
- `lastmile_scheduled` — créneau last mile confirmé avec le client (transporteur + date + plage)
- `lastmile_delivered` — livraison client effectuée (complète ou partielle consentie)
- `project_closed`

---

### 2.2 Order (Commande)

Un projet contient une ou plusieurs commandes. Chaque commande a sa propre adresse, son propre planning et son propre cycle de vie opérationnel.

| Champ | Type | Description |
|---|---|---|
| `order_id` | UUID | Identifiant interne PLO |
| `project_id` | UUID | Référence au projet parent |
| `erp_order_ref` | string | Référence commande dans l'ERP |
| `ecommerce_order_ref` | string | Référence panier/commande e-commerce (si applicable) |
| `status` | string | `draft` / `confirmed` / `in_fulfillment` / `delivered` / `installed` / `closed` / `cancelled` |
| `delivery_address` | JSONB | Adresse de livraison complète |
| `installation_address` | JSONB | Adresse d'installation (si différente de livraison) |
| `installation_required` | boolean | Pose à domicile requise pour cette commande |
| `lead_time_days` | integer | Lead time contractuel en jours |
| `promised_delivery_date` | date | Date de livraison consolidée communiquée au client (= date à laquelle tout est livré) |
| `promised_installation_date` | date | Date d'installation communiquée au client (si applicable) |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `metadata` | JSONB | Données libres |

**Steps rattachés à l'Order :**
- `order_confirmed`
- `stock_check`
- `picking_preparation`
- `shipment_dispatched` — départ depuis la source (entrepôt / magasin / fournisseur)
- `shipment_in_transit` — en transit (cross-docking intermédiaire si applicable)
- `shipment_arrived_at_station` — arrivée en delivery station (prérequis consolidation)

---

### 2.3 OrderLine (Ligne de commande)

| Champ | Type | Description |
|---|---|---|
| `line_id` | UUID | |
| `order_id` | UUID | Référence à la commande |
| `sku` | string | Référence produit |
| `label` | string | Libellé produit (dénormalisé pour affichage) |
| `quantity` | integer | Quantité commandée |
| `unit_price` | decimal | Prix unitaire HT |
| `installation_required` | boolean | Ce SKU nécessite une pose (niveau ligne, pour info) |
| `stock_status` | string | `available` / `shortage` / `backordered` — mis à jour par événement ERP |
| `metadata` | JSONB | Données libres (dimensions, poids, fournisseur...) |

---

### 2.4 Shipment (Expédition)

Un Order peut générer un ou plusieurs Shipments selon le nombre de legs de transport (cross-docking). Chaque Shipment représente un tronçon physique de transport.

| Champ | Type | Description |
|---|---|---|
| `shipment_id` | UUID | |
| `order_id` | UUID | Commande parente |
| `project_id` | UUID | Projet parent (dénormalisé pour requêtes) |
| `oms_ref` | string | Référence dans l'OMS |
| `leg_number` | integer | Numéro de tronçon (1 = source → station, 2 = cross-dock → station finale...) |
| `origin_type` | string | `warehouse` / `store` / `supplier` / `crossdock_station` |
| `origin_ref` | string | Identifiant du site d'origine |
| `destination_station_id` | string | Identifiant de la delivery station de destination |
| `carrier` | string | Transporteur (nom ou code) |
| `carrier_tracking_ref` | string | Numéro de suivi transporteur |
| `status` | string | `pending` / `dispatched` / `in_transit` / `arrived` / `exception` |
| `estimated_arrival` | timestamp | Date/heure d'arrivée estimée en station (recalculée par OMS) |
| `actual_arrival` | timestamp | Date/heure d'arrivée effective |
| `created_at` | timestamp | |
| `metadata` | JSONB | Données libres (poids, volume, nb colis...) |

---

### 2.5 Consolidation

Entité de niveau Project. Une seule Consolidation active par projet. Elle est créée automatiquement à la confirmation de la première commande et reste `in_progress` jusqu'à arrivée de tous les Shipments requis en station.

| Champ | Type | Description |
|---|---|---|
| `consolidation_id` | UUID | |
| `project_id` | UUID | |
| `station_id` | string | Identifiant de la delivery station de consolidation finale |
| `station_name` | string | Nom dénormalisé |
| `status` | string | `waiting` / `in_progress` / `complete` / `partial_approved` |
| `orders_required` | UUID[] | Liste des `order_id` devant être présents avant last mile |
| `orders_arrived` | UUID[] | `order_id` dont le dernier Shipment est arrivé (`shipment_arrived_at_station`) |
| `orders_missing` | UUID[] | `order_id` pas encore arrivés (calculé) |
| `estimated_complete_date` | date | Date estimée d'arrivée du dernier colis (= max des `estimated_arrival` des Shipments manquants) |
| `partial_delivery_approved` | boolean | Client ET installateur ont accordé une livraison partielle |
| `partial_approved_by` | JSONB | `{"customer": true, "installer": true, "approved_at": "ISO8601"}` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Règle clé :** `estimated_complete_date` est recalculée à chaque événement `shipment.eta_updated` reçu de l'OMS et déclenche une réévaluation de la date de livraison client promise.

---

### 2.6 LastMileDelivery (Livraison Client)

Entité de niveau Project. Représente la livraison finale au domicile du client, déclenchée après `consolidation.complete` (ou `partial_approved`).

| Champ | Type | Description |
|---|---|---|
| `lastmile_id` | UUID | |
| `project_id` | UUID | |
| `consolidation_id` | UUID | Consolidation ayant déclenché ce last mile |
| `tms_delivery_ref` | string | Référence dans le TMS last mile |
| `carrier` | string | Transporteur last mile |
| `status` | string | `pending` / `scheduled` / `in_transit` / `delivered` / `failed` / `partial_delivered` |
| `delivery_address` | JSONB | Adresse de livraison client |
| `scheduled_date` | date | Date de livraison planifiée |
| `scheduled_slot` | JSONB | `{"start": "HH:MM", "end": "HH:MM"}` |
| `is_partial` | boolean | Livraison partielle consentie |
| `missing_order_ids` | UUID[] | Commandes non incluses (si partielle) |
| `delivered_at` | timestamp | Horodatage livraison effective |
| `pod_url` | string | URL du proof of delivery (signature, photo) |
| `created_at` | timestamp | |

---

### 2.7 Step (Étape du cycle de vie)

| Champ | Type | Description |
|---|---|---|
| `step_id` | UUID | |
| `project_id` | UUID | Référence au projet *(NULL si step Order)* |
| `order_id` | UUID | Référence à la commande *(NULL si step Project)* |
| `step_type` | string | Type de l'étape (voir listes ci-dessus) |
| `status` | string | `pending` / `in_progress` / `completed` / `anomaly` / `skipped` |
| `expected_at` | timestamp | Date/heure attendue |
| `completed_at` | timestamp | Date/heure effective |
| `assigned_to` | string | Équipe ou outil responsable |
| `metadata` | JSONB | Données libres |

**Contrainte :** exactement un parmi (`project_id`, `order_id`, `installation_id`) doit être non-NULL — les Steps de Consolidation et LastMile sont rattachés au Project via `project_id`.

---

### 2.8 Event (Événement)

| Champ | Type | Description |
|---|---|---|
| `event_id` | UUID | |
| `project_id` | UUID | Référence au projet (toujours renseigné) |
| `order_id` | UUID | Référence à la commande *(NULL si event Project-level)* |
| `step_id` | UUID | Étape concernée |
| `event_type` | string | Type sémantique (ex: `delivery.partial`, `stock.shortage`) |
| `source` | string | `erp` / `oms` / `tms` / `tms_lastmile` / `wfm` / `crm` / `ecommerce` / `inspiration_tool` / `manual` |
| `source_ref` | string | ID de l'événement dans le système source |
| `severity` | string | `info` / `warning` / `critical` |
| `payload` | JSONB | Données brutes normalisées de la source |
| `created_at` | timestamp | |
| `processed_at` | timestamp | |
| `acknowledged_by` | string | Opérateur ayant acquitté (si applicable) |

---

### 2.9 AnomalyRule

| Champ | Type | Description |
|---|---|---|
| `rule_id` | UUID | |
| `name` | string | Libellé de la règle |
| `scope` | string | `project` / `order` / `consolidation` / `lastmile` / `installation` — niveau d'application |
| `step_type` | string | Étape concernée |
| `condition` | JSONB | Condition déclenchante (délai dépassé, event manquant, combinaison...) |
| `severity` | string | `warning` / `critical` |
| `action` | JSONB | Actions à déclencher (notification, escalade, blocage...) |
| `active` | boolean | |

---

### 2.10 Notification

| Champ | Type | Description |
|---|---|---|
| `notification_id` | UUID | |
| `project_id` | UUID | |
| `order_id` | UUID | *(NULL si notification Project-level)* |
| `event_id` | UUID | Événement déclencheur |
| `rule_id` | UUID | Règle ayant déclenché |
| `channel` | string | `email` / `crm_ticket` / `internal_alert` |
| `recipient` | string | Destinataire (client, équipe ops, manager) |
| `status` | string | `pending` / `sent` / `failed` |
| `sent_at` | timestamp | |

---

## 3. Cycle de vie complet et intégrations

### Vue d'ensemble

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  NIVEAU PROJECT — étapes amont                                                ║
║                                                                               ║
║  [Inspiration] ──► [Devis Produits] ──► [Devis Pose]                         ║
║  [Inspiration Tool]   [ERP/Ecom/Store]    [WFM/Manuel]                       ║
╚═══════════════════════════════╦═══════════════════════════════════════════════╝
                         N commandes
          ┌──────────────────────┴──────────────────────────────┐
          │  NIVEAU ORDER (répété par commande)                  │
          │                                                      │
          │  [Cmd Confirmée] → [Stock Check] → [Picking]         │
          │       [ERP]            [ERP]         [ERP/WMS]       │
          │                                          │           │
          │              [Expédition] ──────────────►│           │
          │         source → delivery station(s)     │           │
          │              [OMS / TMS]                 │           │
          │         (cross-docking possible)         │           │
          └──────────────────────────────────────────┘           │
                         toutes commandes arrivées en station    │
╔═══════════════════════════════════════════════════════════════════════════════╗
║  NIVEAU PROJECT — Consolidation & Last Mile                                   ║
║                                                                               ║
║  [Consolidation]  ◄── OMS pousse : arrivée colis, ETA recalculée             ║
║   · waiting                                                                   ║
║   · in_progress (N/M commandes arrivées)                                      ║
║   · complete  ──────────────────────────────────────────────────────────►     ║
║   · partial_approved (accord client + installateur)  ──────────────────►     ║
║                                                                               ║
║  [Last Mile Delivery]    ◄── TMS last mile                                    ║
║   · scheduled (créneau confirmé client)                                       ║
║   · in_transit                                                                ║
║   · delivered / partial_delivered                                             ║
╚═══════════════════════════════╦═══════════════════════════════════════════════╝
                    (si installation requise ET livraison OK ou accord partiel)
╔═══════════════════════════════╩═══════════════════════════════════════════════╗
║  NIVEAU INSTALLATION                                                          ║
║                                                                               ║
║  [Planification] → [Intervention] → [Compte-rendu + Signature] → [Clôture]   ║
║      [WFM]             [WFM/Mobile]        [WFM/Mobile]           [CRM]       ║
╚═══════════════════════════════════════════════════════════════════════════════╝

RÈGLES D'AGRÉGATION :
· Project "anomaly"   dès qu'une Order, Consolidation, LastMile ou Installation a une anomalie active
· Project "completed" quand LastMile = delivered ET Installation = closed (si requise)
· Consolidation.estimated_complete_date = max(ETA de tous les Shipments manquants)
· Last mile ne part qu'après consolidation_complete OU partial_approved (client + installateur)
```

---

### Étape 1 : Inspiration / Simulation
**Source :** Outils inspiration (simulateur cuisine, SDB, rénovation énergétique)
**Intégration :** Webhook entrant ou polling API
**Événements attendus :**
- `inspiration.started` — Client démarre une simulation
- `inspiration.completed` — Simulation terminée, liste de produits générée
- `inspiration.converted` — La simulation a donné lieu à un devis

**Cas d'anomalie :**
- Simulation abandonnée (aucun événement de conversion après X jours) → relance CRM

---

### Étape 2 : Devis Produits
**Source :** E-commerce / ERP / Magasin (saisie vendeur)
**Intégration :** Webhook ERP + e-commerce
**Événements attendus :**
- `quote_products.created` — Devis créé
- `quote_products.sent` — Devis envoyé au client
- `quote_products.accepted` — Devis accepté
- `quote_products.expired` — Devis expiré sans réponse

**Cas d'anomalie :**
- Devis expiré sans relance → alerte équipe commerciale
- Produits au devis non disponibles au catalogue → alerte acheteur

---

### Étape 3 : Devis Pose / Installation
**Source :** Outil WFM (planification pose)
**Intégration :** Webhook WFM ou saisie manuelle
**Événements attendus :**
- `quote_installation.created`
- `quote_installation.sent`
- `quote_installation.accepted`

**Cas d'anomalie :**
- Délai entre acceptation devis produits et création devis pose > 48h → alerte coordinateur

---

### Étape 4 : Commande Confirmée
**Source :** ERP + E-commerce
**Intégration :** Webhook ERP
**Événements attendus :**
- `order.confirmed` — Commande validée et payée
- `order.line_added` — Ajout d'une ligne (produit supplémentaire)
- `order.cancelled` — Annulation commande

**Données clés dans le payload :**
```json
{
  "order_id": "string",
  "lines": [{"sku": "string", "qty": int, "warehouse": "string"}],
  "delivery_address": "object",
  "installation_required": boolean
}
```

---

### Étape 5 : Vérification Stock
**Source :** ERP
**Intégration :** Polling ERP ou événement ERP dédié
**Événements attendus :**
- `stock.check_ok` — Tous les produits disponibles
- `stock.shortage` — Un ou plusieurs produits manquants
- `stock.partial` — Stock partiel (livraison fractionnée possible)

**Cas d'anomalie (PRIORITÉ CRITIQUE) :**
- `stock.shortage` sur un produit principal → alerte immédiate coordinateur + acheteur + information client
- `stock.shortage` détecté moins de 72h avant la livraison → escalade manager + rebooking automatique livraison proposé
- Produit de remplacement proposé sans validation client → bloquer la préparation

---

### Étape 6 : Préparation Commande (Picking)
**Source :** ERP / WMS
**Intégration :** Webhook ERP/WMS
**Événements attendus :**
- `picking.started`
- `picking.completed`
- `picking.discrepancy` — Écart constaté entre commande et préparation (produit oublié, endommagé)

**Cas d'anomalie (PRIORITÉ CRITIQUE) :**
- `picking.discrepancy` → alerte immédiate avant chargement livraison
- Préparation non démarrée X heures avant la livraison → alerte responsable entrepôt
- Produit oublié détecté après départ du camion → alerter TMS + client + installateur

---

### Étape 7 : Expédition (par commande)
**Niveau :** Order → Shipment
**Source :** OMS (Order Management System)
**Intégration :** Webhook OMS — le PLO ne pilote pas, il observe
**Événements attendus :**
- `shipment.dispatched` — Départ depuis la source (entrepôt / magasin / fournisseur)
- `shipment.in_transit` — En transit (mise à jour position ou cross-dock intermédiaire)
- `shipment.eta_updated` — ETA recalculée par l'OMS ou le transporteur
- `shipment.arrived_at_station` — Arrivée confirmée en delivery station
- `shipment.exception` — Incident transport (retard, perte, avarie)

**Données clés du payload OMS :**
```json
{
  "shipment_id": "string",
  "order_ref": "string",
  "leg_number": 1,
  "origin_type": "warehouse|store|supplier|crossdock_station",
  "origin_ref": "string",
  "destination_station_id": "string",
  "carrier": "string",
  "carrier_tracking_ref": "string",
  "estimated_arrival": "ISO8601",
  "actual_arrival": "ISO8601|null"
}
```

**Cas d'anomalie :**
- `shipment.eta_updated` → recalcul automatique de `Consolidation.estimated_complete_date` → si date de livraison client impactée, notification anticipée client
- `shipment.exception` → alerte coordinateur + recalcul ETA consolidation
- ETA d'un Shipment dépasse la date de livraison client promise → alerte critique + proposition de report au client

---

### Étape 8 : Consolidation en Delivery Station
**Niveau :** Project
**Source :** OMS
**Intégration :** Webhook OMS (événements d'arrivée + statut de complétude)
**Événements attendus :**
- `consolidation.order_arrived` — Une commande supplémentaire est arrivée en station (payload : `order_id`, `arrived_at`, `orders_remaining`)
- `consolidation.eta_updated` — Date prévisionnelle de complétion recalculée par l'OMS
- `consolidation.complete` — Toutes les commandes requises sont présentes en station
- `consolidation.partial_approved` — Livraison partielle autorisée (accord client + installateur reçu)
- `consolidation.exception` — Incident en station (colis endommagé, manquant après scan)

**Données clés du payload OMS :**
```json
{
  "consolidation_id": "string",
  "project_ref": "string",
  "station_id": "string",
  "orders_total": 3,
  "orders_arrived": 2,
  "orders_missing": ["order_id_3"],
  "estimated_complete_date": "ISO8601",
  "status": "in_progress|complete|partial_approved"
}
```

**Cas d'anomalie (PRIORITÉ CRITIQUE) :**
- `consolidation.eta_updated` avec nouvelle date dépassant la date client promise → notification proactive client + customer care + recalcul date installation
- `consolidation.exception` (colis manquant ou endommagé en station) → alerte coordinateur + acheteur + recalcul ETA
- Consolidation non complète J-3 date client promise → alerte coordinateur + proposition report client
- Aucun événement OMS reçu depuis 24h sur une commande en transit → alerte ops

---

### Étape 9 : Livraison Client — Last Mile
**Niveau :** Project
**Source :** TMS last mile
**Intégration :** Webhook TMS last mile
**Prérequis :** `consolidation.complete` OU `consolidation.partial_approved` (avec `partial_delivery_approved.customer = true` ET `partial_delivery_approved.installer = true`)
**Événements attendus :**
- `lastmile.scheduled` — Créneau last mile confirmé avec le client (date + plage horaire + transporteur)
- `lastmile.rescheduled` — Reprogrammation (avec motif)
- `lastmile.in_transit` — Départ depuis la station vers le client
- `lastmile.delivered` — Livraison réussie, POD signé
- `lastmile.partial_delivered` — Livraison partielle effectuée (accord préalable requis)
- `lastmile.failed` — Échec livraison (absent, accès impossible)
- `lastmile.damaged` — Produit livré endommagé constaté à la livraison

**Données clés :**
```json
{
  "lastmile_id": "string",
  "project_ref": "string",
  "carrier": "string",
  "carrier_tracking_ref": "string",
  "scheduled_date": "ISO8601",
  "time_slot": {"start": "HH:MM", "end": "HH:MM"},
  "is_partial": false,
  "missing_order_ids": [],
  "pod_url": "string|null"
}
```

**Cas d'anomalie (PRIORITÉ CRITIQUE) :**
- Last mile planifié sans `consolidation.complete` ni `partial_approved` → blocage + alerte coordinateur
- `lastmile.rescheduled` moins de 48h avant → notification client automatique + réévaluation date installation
- `lastmile.failed` → alerte client + replanification + alerte coordinateur installation
- `lastmile.partial_delivered` sans accord préalable → alerte critique + escalade manager
- `lastmile.damaged` → alerte coordinateur installation + ticket SAV
- Aucun event last mile 2h après fin de créneau → alerte TMS ops

---

### Étape 10 : Installation Planifiée
**Source :** WFM (planification pose)
**Intégration :** Webhook WFM
**Événements attendus :**
- `installation.scheduled` — Pose planifiée, installateur assigné
- `installation.rescheduled`
- `installation.cancelled`

**Règle métier clé :** L'installation ne doit être planifiée qu'après confirmation de `delivery.completed` ou `delivery.partial` avec validation coordinateur.

**Cas d'anomalie :**
- Installation planifiée sans livraison confirmée → blocage + alerte coordinateur
- Installateur assigné sans formation pour le type de projet → alerte RH / planning

---

### Étape 10 : Installation Effectuée
**Source :** WFM + saisie installateur (mobile)
**Intégration :** Webhook WFM ou saisie manuelle
**Événements attendus :**
- `installation.started`
- `installation.completed`
- `installation.issue` — Problème constaté (produit manquant, incompatibilité, malfaçon)
- `installation.partial` — Pose partielle (à compléter)

**Cas d'anomalie (PRIORITÉ CRITIQUE) :**
- `installation.issue` avec produit manquant → créer ticket SAV + alerter coordinateur + informer client
- Installation non démarrée X heures après créneau prévu → alerte coordinateur
- `installation.partial` → planifier une seconde intervention, informer client

---

### Étape 11 : Contrôle Qualité
**Source :** CRM / Saisie manuelle
**Intégration :** Saisie manuelle (appel client J+1) ou questionnaire automatique
**Événements attendus :**
- `quality.survey_sent`
- `quality.survey_completed`
- `quality.issue_raised` — Client signale un problème

**Cas d'anomalie :**
- Score satisfaction < seuil → escalade manager + ouverture ticket SAV automatique
- Pas de retour client après 5 jours → relance automatique

---

### Étape 12 : Clôture Dossier
**Source :** CRM
**Intégration :** Webhook CRM
**Événements attendus :**
- `project.closed` — Dossier clôturé positivement
- `project.closed_with_issue` — Clôture avec réserves
- `project.reopened` — Réouverture SAV

---

## 4. Règles d'anomalie prioritaires (v1)

Les règles suivantes constituent le **moteur d'anomalie critique** à implémenter en priorité absolue.

| ID | Nom | Déclencheur | Délai | Sévérité | Action |
|---|---|---|---|---|---|
| ANO-01 | Stock manquant tardif | `stock.shortage` < 72h livraison | immédiat | critical | Alerte coordinateur + acheteur + client |
| ANO-02 | Écart picking avant départ | `picking.discrepancy` | immédiat | critical | Bloquer chargement + alerte entrepôt |
| ANO-03 | Produit oublié après départ | `picking.discrepancy` post-chargement | immédiat | critical | Alerte TMS + client + installateur |
| ANO-04 | Livraison partielle avant pose | `delivery.partial` avec install < 48h | immédiat | critical | Escalade coordinateur + étude rebooking |
| ANO-05 | Installation sans livraison | `installation.scheduled` sans `delivery.completed` | immédiat | critical | Blocage + alerte coordinateur |
| ANO-06 | Problème pendant installation | `installation.issue` | immédiat | critical | Ticket SAV + alerte coordinateur + info client |
| ANO-07 | Livraison non planifiée | Pas de `delivery.scheduled` J-5 avant installation | quotidien | warning | Alerte coordinateur |
| ANO-08 | Picking non démarré | Pas de `picking.started` H-8 avant livraison | horaire | warning | Alerte responsable entrepôt |
| ANO-09 | Livraison sans clôture | Pas d'event clôture H+4 après fin créneau | horaire | warning | Alerte TMS ops |
| ANO-10 | Devis pose non créé | Pas de `quote_installation.created` H+48 après `quote_products.accepted` | quotidien | warning | Alerte coordinateur commercial |
| ANO-11 | Installation planifiée sans livraison | `installation.scheduled` avec Orders prérequises non delivered | immédiat | critical | Blocage + alerte coordinateur |
| ANO-12 | Incident bloquant en installation | `installation.issue` avec `severity: blocking` | immédiat | critical | Ticket SAV + alerte coordinateur + info client |
| ANO-13 | Technicien en retard | Pas de `installation.started` 2h après créneau | horaire | critical | Alerte coordinateur |
| ANO-14 | CR non soumis | Pas de `installation.report_submitted` 4h après `installation.completed` | horaire | warning | Relance technicien |
| ANO-15 | Refus signature client | `customer_signature.signed = false` | immédiat | critical | Alerte coordinateur + ticket litige CRM |
| ANO-16 | ETA Shipment dépasse date promise | `shipment.eta_updated` → ETA > promised_delivery_date | immédiat | critical | Notification client anticipée + recalcul consolidation + alerte coordinateur |
| ANO-17 | Consolidation incomplète J-3 | Pas de `consolidation.complete` J-3 date client | quotidien | critical | Alerte coordinateur + proposition report client |
| ANO-18 | Exception en station | `consolidation.exception` (colis manquant/endommagé) | immédiat | critical | Alerte coordinateur + acheteur + recalcul ETA |
| ANO-19 | Last mile sans consolidation | `lastmile.scheduled` sans `consolidation.complete` ni `partial_approved` | immédiat | critical | Blocage + alerte coordinateur |
| ANO-20 | Last mile partiel sans accord | `lastmile.partial_delivered` sans accord préalable | immédiat | critical | Alerte manager + escalade |
| ANO-21 | Silence OMS >24h | Aucun event Shipment depuis 24h sur commande en transit | horaire | warning | Alerte ops + vérification transporteur |
| ANO-22 | Last mile échoué | `lastmile.failed` | immédiat | critical | Alerte client + replanification + alerte coordinateur installation |

---

## 5. Architecture technique

### 5.1 Stack recommandée

**Backend**
- Runtime : Node.js 20+ / TypeScript strict
- Framework : Fastify (performances, schema validation native avec JSON Schema)
- ORM : Prisma (typage fort, migrations)
- Base de données : PostgreSQL 15+ (champ JSONB pour metadata/payload)
- Queue : BullMQ + Redis (ingestion asynchrone des événements, évite les pertes)
- Cron : node-cron (évaluation périodique des règles d'anomalie)

**Frontend**
- React 18 + TypeScript
- UI : shadcn/ui + Tailwind CSS
- Timeline : composant custom (liste verticale d'événements par step)
- State : React Query (polling temps réel ou WebSocket)

**Infrastructure**
- Conteneurisation : Docker Compose (dev), déployable sur toute infra cloud
- Auth : JWT ou intégration SSO entreprise (à définir)

### 5.2 Modèle d'intégration — Endpoint d'ingestion normalisé

Tous les systèmes sources envoient leurs événements vers :

```
POST /api/events/ingest
Authorization: Bearer <api_key_par_source>
```

Payload normalisé :
```json
{
  "source": "tms",
  "source_ref": "DELIVERY-12345",
  "event_type": "delivery.partial",
  "project_ref": "CMD-2025-98765",
  "occurred_at": "2025-06-15T14:32:00Z",
  "payload": {
    // données brutes spécifiques à la source
  }
}
```

Le PLO :
1. Identifie le projet via `project_ref` (mapping cross-référence)
2. Normalise et persiste l'événement
3. Met à jour le statut de l'étape correspondante
4. Évalue les règles d'anomalie concernées
5. Déclenche les notifications si nécessaire

### 5.3 Adaptateurs par source

Chaque source a son adaptateur qui :
- Valide la signature/authentification (HMAC ou Bearer token)
- Mappe les types d'événements source → types PLO normalisés
- Enrichit le payload si nécessaire

**Adaptateurs à implémenter en priorité (v1) :**
1. ERP (commandes + stock)
2. OMS (Shipment events + Consolidation events)
3. TMS last mile (last mile delivery events)
4. WFM (pose / installation)
5. Manual (API de saisie manuelle pour le front PLO)

**Adaptateurs v2 :**
5. CRM
6. E-commerce
7. Outils inspiration

### 5.4 Moteur d'anomalie (Anomaly Engine)

Le moteur s'exécute :
- **En temps réel** sur chaque ingestion d'événement (évaluation des règles `severity: critical`)
- **Périodiquement** toutes les heures via cron (évaluation des règles `severity: warning` basées sur des délais)

Logique d'évaluation (pseudo-code) :
```typescript
async function evaluateRules(event: Event, project: Project): Promise<void> {
  const rules = await getActiveRulesForStep(event.step_type);
  for (const rule of rules) {
    const triggered = await evaluateCondition(rule.condition, event, project);
    if (triggered) {
      await createNotifications(rule, event, project);
      await updateStepStatus(event.step_id, 'anomaly');
    }
  }
}
```

### 5.5 Statuts manuels

Pour les étapes sans intégration, le front PLO expose :
- Un bouton "Mettre à jour le statut" par étape
- Un formulaire de saisie d'événement manuel
- Un champ commentaire libre

Ces saisies passent par le même endpoint d'ingestion avec `source: "manual"`.

---

## 6. Interface utilisateur (vue opérateur)

### 6.1 Vues principales

**Vue Liste Clients**
- Liste des clients ayant un projet en cours, passé ou futur.
- A completer

**Vue Client**
- Projets en cours, passés, futurs
- Filtres : statut, type projet, magasin, date, sévérité anomalie
- Indicateur visuel par projet : vert (OK) / orange (warning) / rouge (critical)
- Prochaines action et action date
- Tri par ancienneté d'anomalie non traitée

**Vue Liste Projets**
- Filtres : statut, type projet, magasin, date, sévérité anomalie
- Indicateur visuel par projet : vert (OK) / orange (warning) / rouge (critical)
- Tri par ancienneté d'anomalie non traitée

**Vue Détail Projet**
- Timeline verticale des étapes avec statut par étape
- Pour chaque étape : liste des événements horodatés avec source et sévérité
- Bouton "Saisie manuelle" par étape
- Panneau latéral : informations client, liens vers outils sources

**Vue Anomalies**
- Liste de toutes les anomalies actives (non acquittées)
- Filtres par sévérité, type, responsable
- Action "Acquitter + commentaire" par anomalie

**Vue Règles d'anomalie** (Admin)
- CRUD sur les règles d'anomalie
- Historique des déclenchements

### 6.2 Notifications

**Canal 1 : Alerte interne (in-app)**
- Bandeau rouge dans le PLO pour les anomalies critiques
- Badge sur la vue liste projets

**Canal 2 : Email**
- Templates par type d'anomalie
- Destinataires configurables par règle

**Canal 3 : Ticket CRM** (v2)
- Création automatique d'un ticket dans le CRM
- Lien retour vers le PLO

---

## 7. Plan de développement itératif

### Sprint 0 — Mock Up visuel, slide deck pour décrire l'outil, convaincre de l'approche vibe Coding itérative, explication de la methodologie

### Sprint 1 — Fondations de données
- Schéma PostgreSQL complet (Project, Order, OrderLine, Shipment, Consolidation, LastMileDelivery, Installation, Step, Event, AnomalyRule, Notification)
- Table `ProjectExternalRef(project_id, source, ref)` pour le mapping cross-systèmes
- Contrainte CHECK sur Step : `project_id` XOR `order_id` non-NULL
- Migrations Prisma
- Types TypeScript
- Seed de données de démo (1 projet, 2 commandes avec adresses différentes, 5 lignes, cycle de vie complet)

### Sprint 2 — API d'ingestion
- Endpoint `POST /api/events/ingest`
- Adaptateur `manual` complet
- Adaptateur `erp` (événements commande + stock)
- Adaptateur `tms` (événements livraison)

### Sprint 3 — Moteur d'anomalie
- Implémentation des 22 règles ANO-01 à ANO-22 (dont ANO-16 à ANO-22 sur Consolidation/LastMile/Installation)
- Cron d'évaluation périodique
- Notifications email (templates pour ANO-01, ANO-02, ANO-06)

### Sprint 4 — Interface opérateur
- Vue Liste Projets avec indicateurs d'anomalie
- Vue Détail Projet (timeline)
- Saisie manuelle d'événement
- Vue Anomalies actives

### Sprint 5 — Adaptateurs complémentaires
- Adaptateur `wfm` (pose)
- Adaptateur `crm`
- Adaptateur `ecommerce`

### Sprint 6 — Notifications avancées & intégration CRM
- Création automatique de tickets CRM
- Escalade temporelle (règle non acquittée après N heures)
- Dashboard KPIs anomalies

---

## 8. Conventions de développement

### Nommage des événements
Format : `{entité}.{action}` en snake_case
Exemples : `delivery.completed`, `stock.shortage`, `installation.issue`

### Gestion des erreurs d'ingestion
- Si l'événement ne peut être rattaché à un projet → file morte (dead letter queue) + alerte ops
- Si la source est inconnue → rejet HTTP 401
- Si le payload est invalide → rejet HTTP 422 avec détail d'erreur

### Idempotence
- Chaque événement entrant est dédupliqué sur `source + source_ref`
- Un doublon est ignoré silencieusement (HTTP 200 + `{"duplicate": true}`)

### Extensibilité
- `metadata` et `payload` en JSONB : aucune migration nécessaire pour ajouter des données spécifiques à une source
- Les `step_type` et `event_type` sont des strings (non des enums SQL) pour permettre l'ajout sans migration

---

## 9. Décisions d'architecture (Questions ouvertes — tranchées le 26/02/2026)

1. **Identifiant projet unifié** ✅
   Mapping automatique sur `customer_id + période` : le PLO tente de rattacher automatiquement une commande ERP au projet en cours du même client sur la même période. La table `ProjectExternalRef(project_id, source, ref)` sert de registre de correspondance. Si aucun projet correspondant n'est trouvé → dead letter queue + alerte ops pour rattachement manuel.

2. **Rattachement Order → Project** ✅
   Double mode : création automatique sur `order.confirmed` avec `project_ref` connu **ET** pré-création manuelle possible depuis l'interface opérateur (cas de devis non encore passés en commande ou d'intégration ERP partielle).

3. **Création d'Order dans le PLO** ✅
   Voir Q2 — automatique sur `order.confirmed` est le chemin nominal, la pré-création manuelle est le chemin de secours.

4. **Stock check** ✅
   Au niveau `OrderLine` par SKU. Le payload `stock.shortage` doit identifier les SKUs en rupture. L'anomalie ANO-01 affiche les références produit concernées dans l'alerte coordinateur et acheteur.

5. **Périmètre auth** ✅ *(tranché en Sprint 9)*
   JWT httpOnly cookie, architecture SSO-ready. Auth email/mot de passe opérateur en v1, point de remplacement OIDC/SAML prêt dans `jwtAuthPlugin`.

6. **Hébergement** ✅
   Cloud public (AWS / Azure / GCP). PostgreSQL managé (RDS / Cloud SQL), Redis managé (ElastiCache / MemoryStore), conteneurs Docker (ECS / App Service / Cloud Run). Architecture stateless facilite le scale-out.

7. **Notifications client** ✅
   Via le CRM : le PLO crée un ticket CRM (déjà implémenté) et le CRM gère l'envoi email/SMS client avec ses propres templates et historique contacts. Le PLO ne gère pas le référentiel emails/téléphones clients.

8. **Seuils des règles d'anomalie** ✅
   Configurables par magasin ET par type de projet. Le champ JSONB `condition` de `AnomalyRule` stocke les seuils. Une table de surcharges `RuleOverride(rule_id, store_id?, project_type?, condition_overrides JSONB)` permet la customisation par contexte — le moteur applique la surcharge la plus spécifique disponible.

9. **Vue client** ✅ *(tranché en Sprint 7)*
   Portail de suivi public `/suivi/:token` — milestone stepper, aucune donnée interne exposée.

10. **Clôture projet** ✅
    Mixte : automatique si les conditions sont remplies (sans installation : `lastmile.delivered` ; avec installation : `lastmile.delivered` + `installation.closed`), mais l'opérateur peut toujours forcer la clôture manuelle depuis la fiche projet.

11. **Accord livraison partielle** ✅
    Double canal : saisie manuelle dans le PLO (bouton "Valider livraison partielle" — customer care confirme l'accord client ET installateur, audit log automatique) **ET** acceptation de l'événement externe `consolidation.partial_approved` poussé par l'OMS/CRM. Les deux chemins mènent au même état `Consolidation.partial_delivery_approved = true`.

12. **Communication proactive client** ✅
    Proposition soumise au customer care : le PLO détecte le glissement d'ETA et crée une alerte interne + ticket CRM "à valider". Le customer care valide le message avant envoi client. Évite les communications automatiques sur fausse alerte OMS.

13. **Référentiel delivery stations** ✅
    Créées dynamiquement depuis les payloads OMS. Le PLO enregistre automatiquement chaque `station_id` / `station_name` reçu — pas de table de référence à pré-alimenter.

---

## 10. État du projet — Sprint 19 (26/02/2026)

### 10.1 Ce qui est livré

| Sprint | Thème | Statut |
|---|---|---|
| 0 | Mock-up visuel, pitch vibe coding | ✅ Hors-scope technique |
| 1 | Fondations : schéma Prisma, types TS, seed Famille Dubois | ✅ |
| 2 | API d'ingestion `POST /api/events/ingest` + adaptateurs ERP/OMS/TMS/Manual | ✅ |
| 3 | Moteur d'anomalie : 22 règles ANO-01→22, cron horaire/quotidien, emails | ✅ |
| 4 | Interface opérateur v1 : liste projets, détail, anomalies, règles | ✅ |
| 5 | Adaptateurs WFM, CRM, E-commerce (optionnels, clés env) | ✅ |
| 6 | Notifications avancées : escalade 4h, tickets CRM simulés, dashboard KPI | ✅ |
| 7 | Portail client tracking (`/suivi/:token`) — mobile-first | ✅ |
| 8 | Gantt CSS pur + Agent IA d'analyse de risque (Claude Haiku, fallback heuristique) | ✅ |
| 9 | Authentification JWT httpOnly cookie, SSO-ready, LoginPage, RequireAuth | ✅ |
| 10 | Gestion utilisateurs opérateurs CRUD (admin uniquement) | ✅ |
| 11 | Filtres serveur projets + notifications temps réel SSE + cloche | ✅ |
| 12 | Vue Clients + acquittement anomalies en masse (bulk acknowledge) | ✅ |
| 13 | Export CSV (projets + anomalies) + filtres avancés anomalies | ✅ |
| 14 | CRUD complet règles d'anomalie (admin) + création de projets | ✅ |
| 15 | Notes opérateur par projet + mise à jour statut inline | ✅ |
| 16 | Journal d'activité (audit log) — 10 actions tracées | ✅ |
| 17 | Recherche globale Spotlight (Cmd+K) — projets, clients, règles | ✅ |
| 18 | Attribution projet à opérateur + filtre "Mes projets" | ✅ |
| 19 | Pagination serveur (projets + anomalies) — composant réutilisable | ✅ |

### 10.2 Périmètre fonctionnel couvert

**Moteur d'anomalie**
- 22 règles implémentées (ANO-01 à ANO-22), temps réel + cron
- Déduplication 24h, escalade automatique après 4h sans acquittement
- Tickets CRM simulés sur anomalies critiques
- Notifications email (templates ANO-01, 02, 06 + fallback console SMTP)

**API d'ingestion**
- 7 sources : ERP, OMS, TMS last mile, WFM, CRM, E-commerce, Manual
- Auth Bearer par source, déduplication `source+source_ref`, dead letter queue
- Déclenchement règles temps réel sur chaque événement ingéré

**Interface opérateur**
- Authentification JWT (cookie httpOnly, refresh sur la session active)
- 8 vues : Dashboard KPI / Clients / Projets / Détail projet / Anomalies / Règles / Utilisateurs / Activité
- Recherche globale Spotlight (Cmd+K), notifications SSE en temps réel
- Pagination sur les listes (20 items/page par défaut)
- Exports CSV (projets + anomalies avec reprise des filtres)
- Gantt CSS du cycle de vie + analyse de risque IA

**Portail client**
- URL publique `/suivi/:token` — milestone stepper, aucune donnée interne exposée
- Mobile-first, hors authentification opérateur

**Administration**
- CRUD opérateurs (admin uniquement), reset password
- CRUD règles d'anomalie avec guard 409 si notifications existantes
- Journal d'activité complet (10 types d'actions tracées)

### 10.3 Ce qui reste à produire

**Fonctionnel manquant (identifié dans la SPEC)**
- Communication proactive client : email/SMS direct depuis le PLO (question ouverte n°7 et 12)
- Référentiel delivery stations (actuellement string libre dans les payloads)
- Clôture projet automatique quand `lastmile.delivered` + `installation.closed` (question ouverte n°10)
- Accord livraison partielle côté PLO : formulaire de capture du consentement client+installateur (question ouverte n°11)
- Portail client plus riche : détail commande, ETA consolidation, lien POD

**Technique / Qualité**
- Tests automatisés : unitaires (moteur d'anomalie), intégration (routes API), E2E (scénario Dubois complet)
- Configuration SMTP réelle (actuellement fallback console)
- Rate limiting sur l'API d'ingestion
- Authentification SSO réelle (OIDC/SAML) — architecture prête, bouchon JWT à remplacer
- Multi-tenancy / isolation par magasin ou région si déploiement multi-entités
- Variables d'environnement en secret management (Vault, AWS Secrets Manager...)
- Monitoring / observabilité (logs structurés, métriques BullMQ, alertes infra)
- Documentation API OpenAPI/Swagger auto-générée

**Sprints à planifier issus des décisions d'architecture (section 9)**
- Mapping auto `customer_id + période` pour rattachement Order → Project (Q1/Q2/Q3)
- Payload `stock.shortage` enrichi avec SKUs manquants (Q4)
- Table `RuleOverride` + UI admin surcharges par magasin/type projet (Q8)
- Clôture projet automatique sur conditions métier (Q10)
- Bouton "Valider livraison partielle" dans fiche projet (Q11)
- Infra cloud (AWS/Azure/GCP) — pipeline CI/CD Docker (Q6)
- Intégration CRM réelle pour notifications client (Q7/Q12)

---

*Document vivant — à mettre à jour à chaque sprint et à partager avec Claude Code en début de session.*
