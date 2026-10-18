# StockVault - Small Business Warehouse Management System

A modern, fast, and lightweight Warehouse & Inventory Management application designed for small businesses.

---

## 🚀 Quick Start

The app runs on Python 3 with built-in SQLite and HTTP server (no external dependencies needed).

### Start the Server:
```bash
python3 server.py
```

Then open your browser at:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## ✨ Key Features

1. **Inventory & Stock Tracking**:
   - Manage SKUs, product names, categories, bin/rack locations, unit prices, and quantities.
   - **Low Stock Threshold Alerts**: Automatically highlights items at or below minimum threshold (`⚠️ Low Stock`).
   - Out-of-stock badges (`🛑 Out of Stock`).

2. **Auto Restock Intelligence**:
   - Automated purchase order triggers when inventory dips below minimum threshold.
   - Configurable restock quantity and toggle per product.
   - One-click batch scanner (`Run Restock Scan Now`).
   - Inbound receipt fulfillment (`📥 Receive`) directly restores warehouse stock and logs audit trail.

3. **Food Lot & Expiry Intelligence (FIFO)**:
   - **Auto Shelf-Life Calculator**: Enter Production/Mfg Date + Shelf Life (in days or pick presets like Bakery 5d, Dairy 14d, Snacks 90d, Frozen 180d, Canned 1yr) to automatically compute expiration dates.
   - **Batch / Lot Number Tracking**: Trace production lots (e.g. `LOT-MLK-2610A`).
   - **Storage Conditions**: Monitor temperature zones (`Ambient`, `❄️ Chilled 0-4°C`, `🧊 Frozen -18°C`) matched to warehouse bins.
   - **One-Click Discard / Waste Disposal**: Dedicated `🗑️ Discard` action writes off spoiled or expired food safely and records waste disposal audit logs.
   - **FIFO Urgency Statuses**: `🚨 EXPIRED`, `🔥 Critical (<=15d)`, `⚠️ Urgent (<=30d)`, and `Good Shelf-Life`.

4. **Quick Stock Adjustments & Audit Trail**:
   - **📥 Inbound**: Receive new stock batches with reference notes (PO / invoice).
   - **📤 Outbound**: Dispatch/ship customer orders with immediate inventory deduction & balance checks (triggers auto-restock if stock drops low).
   - **⚙️ Physical Stock Audit**: Set exact stock counts.
   - Full audit trail under **Stock Movements** showing every transaction timestamp, difference, and reason.

5. **Barcode Generation & Printing**:
   - Generate standard Code-128 barcodes for each SKU / item.
   - One-click print modal for labeling boxes, bins, and products.

6. **Warehouse Zones & Bins**:
   - Track aisles, shelves, racks, and pallet positions (e.g., `A1-S01`, `C1-R01 Cold Storage`, `C2-F01 Deep Freezer`).

7. **Supplier & Vendor Management**:
   - Keep track of suppliers, primary contact persons, phone numbers, and addresses.

8. **Monthly Stock Report & Consumption Analysis**:
   - **Monthly Stock Balance**: View starting balance, inbound stock received, finished/dispatched units, and current remaining inventory for any selected month.
   - **Finished vs Spoiled Breakdown**: Distinguish units finished via customer sales/orders from spoiled/discarded waste.
   - **Month Selector & Export**: Historical month-by-month picker (`YYYY-MM`) with one-click **Export Monthly Report to CSV**.

9. **Smart AI Inventory Analytics & Demand Forecasting (NEW)**:
   - **Pareto / ABC Classification**: Automatically categorizes warehouse SKUs into:
     - **Class A** (Top ~70% inventory valuation — high priority capital).
     - **Class B** (Next ~20% valuation — moderate control).
     - **Class C** (Bottom ~10% valuation — low holding cost).
   - **30-Day Burn Velocity & Runway**: Calculates daily consumption rate and exact days of stock remaining (`Runway`) per item.
   - **Stockout Urgency Warnings**: Flags items with `🚨 Critical (<=7d)` or `⚠️ Moderate (<=21d)` runway to prevent stockouts before they happen.
   - **Dead Stock & Tied Capital Detection**: Identifies idle SKUs with zero consumption in the last 30 days and shows exact tied-up dollar capital.
   - **Actionable AI Strategy Advisor**: Dynamic smart suggestions advising when to order or discount slow movers.
   - **CSV Export**: Dedicated export for procurement & executive reviews.

10. **Export & Reporting**:
    - Full warehouse inventory audit, smart analytics, and monthly balance exports to CSV with valuation spreadsheets.

---

## 🗄️ Database Architecture (SQLite)

- `products`: Product catalog, SKU, current quantity, minimum reorder quantity, location, barcode, `batch_lot`, `mfg_date`, `shelf_life_days`, `storage_temp`, `expiry_date`, `auto_restock_enabled`, `auto_restock_qty`.
- `restock_orders`: Automated and manual purchase orders (`order_number`, `status`, `trigger_reason`, `order_quantity`, `total_estimated_cost`, `received_at`).
- `stock_logs`: History log of inbound, outbound, manual adjustments, waste discards, and restock receipts.
- `locations`: Zones, racks, bins, descriptions (including cold rooms & freezers).
- `categories`: Product categories (including Dairy, Bakery, Packaged Foods, Beverages).
- `suppliers`: Supplier directory and contact details.

Database file is automatically generated and stored locally in [warehouse.db](file:///Users/samikshaganeshnalawade/major%20project/warehouse.db).
