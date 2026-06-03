# OPMS data model (Mongo)

Operational order + inventory for medical equipment distributors. Canonical Mongoose definitions live in [`src/data/mongoRegistry.js`](../src/data/mongoRegistry.js).

## Principles

- **Batch inventory** is separate from **Product** master (no embedded batch arrays on products).
- **Order line items** store **pricing and batch snapshots** (rates, GST, batch/expiry/serial text) for audit history.
- **Negotiated / last-used rates** use **`party_product_last_rates`** (`PartyProductLastRate`): one row per party + product, updated after each saved order that has a `party`.
- **Party** unifies customers and suppliers (`party_type`).
- **Indexes**: `Batch` by `product` + `expiry_date`; last-rate by `party` + `product` (unique); `Order` by `order_no`, and `party` + `order_date` (sparse when party absent).

## Collections (summary)

| Model | Role |
|-------|------|
| Category, Manufacturer, Brand | Catalog dimensions |
| Warehouse | Optional multi-location stock |
| Party | Customer / supplier / both |
| Product | Master: HSN, GST %, MRP, sale floors, `requires_batch|expiry|serial` |
| Batch | Stock by batch/serial, expiry, inward, supplier, recall status |
| PartyProductLastRate | Last rate, discount %, last batch, last order date |
| Order | Existing workflow order + `party`, `order_date`, `payment_status`, `notes`; lines reference `batch` + snapshots |

## Server behaviour

- **List orders**: optional query `party` (same as `customer` filter).
- **Create / PATCH order**: optional `party`; if set, must reference an active Party. After save, **`syncPartyProductLastRatesFromOrder`** updates last-rate rows.
- **Line discount**: `discount_percent` recomputes `discount_amount` from `quantity * unit_price` in `recalcCommercials`.
- **Batch suggestions**: `services/opms/batchAllocation.suggestBatchesForProduct` sorts by **nearest expiry**, then **FIFO** (`inward_date`).

## Legacy

- **Customer** remains required on orders for existing RBAC and UI; **Party** is additive for OPMS counterparty / hospital flows. Migrate or link Parties to Customers as needed.
