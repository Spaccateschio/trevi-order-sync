# Colori fornitore
- Supplier colors are presentation only: key supplier_records.id, saved display_color (palette codes) else stable hash via src/lib/supplier-color.ts; pages read colors with useSupplierColors (shared page-level queries, never per card) and SupplierTintFrame; state colors stay on borders/badges.
