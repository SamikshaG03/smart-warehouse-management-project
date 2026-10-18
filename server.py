import http.server
import json
import os
import sqlite3
import sys
import urllib.parse
from datetime import datetime

PORT = int(os.environ.get('PORT', 8000))
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'warehouse.db')
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Categories
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT
        )
    ''')

    # Warehouse Locations (Aisle/Shelf/Bin)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            zone TEXT NOT NULL,
            description TEXT
        )
    ''')

    # Products / Inventory items
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            location_code TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            min_stock_level INTEGER NOT NULL DEFAULT 10,
            unit_price REAL NOT NULL DEFAULT 0.0,
            unit TEXT NOT NULL DEFAULT 'pcs',
            supplier TEXT,
            barcode TEXT,
            batch_lot TEXT,
            mfg_date DATE,
            shelf_life_days INTEGER,
            storage_temp TEXT DEFAULT 'Ambient', -- 'Ambient', 'Chilled (0-4°C)', 'Frozen (-18°C)'
            expiry_date DATE,
            auto_restock_enabled INTEGER NOT NULL DEFAULT 1,
            auto_restock_qty INTEGER NOT NULL DEFAULT 20,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Migration: Add columns if table already existed without them
    cursor.execute("PRAGMA table_info(products)")
    existing_cols = [c[1] for c in cursor.fetchall()]
    if 'expiry_date' not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN expiry_date DATE")
    if 'auto_restock_enabled' not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN auto_restock_enabled INTEGER NOT NULL DEFAULT 1")
    if 'auto_restock_qty' not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN auto_restock_qty INTEGER NOT NULL DEFAULT 20")
    if 'batch_lot' not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN batch_lot TEXT")
    if 'mfg_date' not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN mfg_date DATE")
    if 'shelf_life_days' not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN shelf_life_days INTEGER")
    if 'storage_temp' not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN storage_temp TEXT DEFAULT 'Ambient'")

    # Restock Purchase Orders & History
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS restock_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE NOT NULL,
            product_id INTEGER NOT NULL,
            sku TEXT NOT NULL,
            product_name TEXT NOT NULL,
            supplier TEXT,
            order_quantity INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'TRIGGERED', -- 'TRIGGERED', 'RECEIVED', 'CANCELLED'
            trigger_reason TEXT,
            total_estimated_cost REAL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            received_at DATETIME,
            FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
        )
    ''')

    # Stock Transactions / Movement Log
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stock_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            sku TEXT NOT NULL,
            product_name TEXT NOT NULL,
            type TEXT NOT NULL, -- 'INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'AUTO_RESTOCK'
            quantity_change INTEGER NOT NULL,
            previous_quantity INTEGER NOT NULL,
            new_quantity INTEGER NOT NULL,
            reference_note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
        )
    ''')

    # Suppliers
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            contact_person TEXT,
            email TEXT,
            phone TEXT,
            address TEXT
        )
    ''')

    # Ensure existing sample items have realistic lot and expiry dates
    cursor.execute("SELECT COUNT(*) FROM products WHERE expiry_date IS NOT NULL")
    if cursor.fetchone()[0] == 0:
        cursor.execute("UPDATE products SET expiry_date = '2026-10-05', batch_lot = 'LOT-PL80-26A', storage_temp = 'Ambient', auto_restock_enabled = 1, auto_restock_qty = 30 WHERE sku = 'SKU-5001'")
        cursor.execute("UPDATE products SET expiry_date = '2026-10-25', batch_lot = 'LOT-TH46-09B', storage_temp = 'Ambient', auto_restock_enabled = 1, auto_restock_qty = 40 WHERE sku = 'SKU-3002'")
        cursor.execute("UPDATE products SET expiry_date = '2026-11-15', batch_lot = 'LOT-TP06-11C', storage_temp = 'Ambient', auto_restock_enabled = 1, auto_restock_qty = 50 WHERE sku = 'SKU-1002'")
        cursor.execute("UPDATE products SET expiry_date = '2027-06-30', batch_lot = 'LOT-BX10-01X', storage_temp = 'Ambient', auto_restock_enabled = 1, auto_restock_qty = 100 WHERE sku = 'SKU-1001'")

    # Seed popular food products if not already present
    cursor.execute("SELECT COUNT(*) FROM products WHERE sku = 'FOOD-101'")
    if cursor.fetchone()[0] == 0:
        food_demo = [
            ("FOOD-101", "Whole Organic Milk 1L (Pasteurized)", "Dairy & Eggs", "C1-R01", 12, 20, 3.49, "bottles", "FreshFarm Dairy Co.", "BAR-FD101", "LOT-MLK-2610A", "2026-10-01", 14, "Chilled (0-4°C)", "2026-10-15", 1, 30),
            ("FOOD-102", "Artisan Sourdough Loaf (Fresh Baked)", "Bakery & Bread", "A1-S01", 6, 15, 4.99, "loaves", "Golden Grain Bakery", "BAR-FD102", "LOT-BKR-2610C", "2026-10-08", 5, "Ambient", "2026-10-13", 1, 25),
            ("FOOD-103", "Aged Cheddar Cheese Block 500g", "Dairy & Eggs", "C1-R01", 45, 10, 7.80, "blocks", "FreshFarm Dairy Co.", "BAR-FD103", "LOT-CHS-2609X", "2026-09-10", 90, "Chilled (0-4°C)", "2026-12-09", 1, 20),
            ("FOOD-104", "Natural Greek Yogurt 500g Cup", "Dairy & Eggs", "C1-R01", 8, 25, 4.20, "cups", "FreshFarm Dairy Co.", "BAR-FD104", "LOT-YGT-2609B", "2026-09-20", 21, "Chilled (0-4°C)", "2026-10-11", 1, 40),
            ("FOOD-105", "Frozen Blueberries 1kg Pack", "Packaged Foods", "C2-F01", 30, 10, 6.50, "bags", "FreshFarm Dairy Co.", "BAR-FD105", "LOT-BER-2608F", "2026-08-01", 180, "Frozen (-18°C)", "2027-01-28", 1, 25)
        ]
        for f in food_demo:
            cursor.execute('''
                INSERT OR IGNORE INTO products (sku, name, category, location_code, quantity, min_stock_level, unit_price, unit, supplier, barcode, batch_lot, mfg_date, shelf_life_days, storage_temp, expiry_date, auto_restock_enabled, auto_restock_qty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', f)
            p_id = cursor.lastrowid
            if p_id:
                cursor.execute('''
                    INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                    VALUES (?, ?, ?, 'INBOUND', ?, 0, ?, 'Initial food stock delivery setup')
                ''', (p_id, f[0], f[1], f[4], f[4]))

    conn.commit()

    # Seed Categories if empty
    cursor.execute('SELECT COUNT(*) FROM categories')
    if cursor.fetchone()[0] == 0:
        categories = [
            ("Dairy & Eggs", "Milk, yogurt, cheese, butter"),
            ("Bakery & Bread", "Breads, buns, artisanal bakery goods"),
            ("Packaged Foods", "Canned goods, grains, pasta, snacks"),
            ("Beverages", "Juices, soft drinks, sparkling waters"),
            ("Raw Materials", "Base materials for manufacturing"),
            ("Finished Goods", "Packaged goods ready for customer delivery"),
            ("Packaging", "Boxes, bubble wraps, tapes"),
            ("Spare Parts", "Equipment & machine parts")
        ]
        cursor.executemany("INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)", categories)

    # Seed Locations if empty
    cursor.execute('SELECT COUNT(*) FROM locations')
    if cursor.fetchone()[0] == 0:
        locations = [
            ("A1-S01", "Zone A - Fast Moving", "Aisle 1, Shelf 1"),
            ("A1-S02", "Zone A - Fast Moving", "Aisle 1, Shelf 2"),
            ("B2-S03", "Zone B - Bulky Goods", "Aisle 2, Shelf 3"),
            ("B3-S01", "Zone B - Bulky Goods", "Aisle 3, Shelf 1"),
            ("C1-R01", "Zone C - Cold Storage (0-4°C)", "Rack 1, Section A - Dairy & Perishables"),
            ("C2-F01", "Zone C - Deep Freezer (-18°C)", "Freezer Vault 1"),
            ("D1-P05", "Zone D - Packaging Bay", "Pallet Rack 5")
        ]
        cursor.executemany("INSERT OR IGNORE INTO locations (code, zone, description) VALUES (?, ?, ?)", locations)

    # Seed Suppliers if empty
    cursor.execute('SELECT COUNT(*) FROM suppliers')
    if cursor.fetchone()[0] == 0:
        suppliers = [
            ("FreshFarm Dairy Co.", "Anna Green", "orders@freshfarmdairy.com", "+1-800-555-0188", "12 Valley Farm Way, CA"),
            ("Golden Grain Bakery", "Marco Rossi", "marco@goldengrain.com", "+1-800-555-0177", "89 Baker St, OR"),
            ("Apex Logistics & Goods", "Michael Scott", "michael@apexlogistics.com", "+1-800-555-0199", "100 Industrial Parkway, PA"),
            ("Global Pack Corp", "Sarah Jenkins", "sarah@globalpack.io", "+1-800-555-0244", "45 Warehouse Row, NJ"),
            ("Prime Hardware Ltd", "David Vance", "vance@primehardware.com", "+1-800-555-0377", "88 Steel Blvd, OH")
        ]
        cursor.executemany("INSERT OR IGNORE INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)", suppliers)

    # Seed sample products if empty
    cursor.execute('SELECT COUNT(*) FROM products WHERE sku NOT LIKE "FOOD-%"')
    if cursor.fetchone()[0] == 0:
        sample_products = [
            ("SKU-1001", "Corrugated Shipping Box (Large)", "Packaging", "D1-P05", 250, 50, 2.75, "pcs", "Global Pack Corp", "BAR-1001", "2027-12-31", 1, 100),
            ("SKU-1002", "Heavy Duty Packing Tape (6-Pack)", "Packaging", "D1-P05", 85, 30, 14.50, "pack", "Global Pack Corp", "BAR-1002", "2027-06-30", 1, 50),
            ("SKU-2001", "Ergonomic Office Chair - Model X", "Finished Goods", "B2-S03", 8, 15, 189.00, "units", "Prime Hardware Ltd", "BAR-2001", None, 1, 20),
            ("SKU-2002", "Wireless Barcode Scanner Handheld", "Spare Parts", "A1-S01", 14, 5, 65.00, "units", "Apex Logistics & Goods", "BAR-2002", None, 1, 15),
            ("SKU-3001", "Aluminum Extrusion Bar (2m)", "Raw Materials", "B3-S01", 120, 40, 22.00, "pcs", "Prime Hardware Ltd", "BAR-3001", None, 1, 60),
            ("SKU-3002", "Thermal Label Roll 4x6 (500/roll)", "Packaging", "A1-S02", 4, 20, 11.20, "rolls", "Global Pack Corp", "BAR-3002", "2026-10-25", 1, 40),
            ("SKU-4001", "Stainless Steel Screws M4 (Box 500)", "Spare Parts", "A1-S02", 45, 10, 8.90, "box", "Prime Hardware Ltd", "BAR-4001", None, 1, 30),
            ("SKU-5001", "Industrial Pallet Wrap Film 80 Gauge", "Packaging", "D1-P05", 6, 25, 29.99, "roll", "Global Pack Corp", "BAR-5001", "2026-10-05", 1, 50)
        ]

        for p in sample_products:
            cursor.execute('''
                INSERT OR IGNORE INTO products (sku, name, category, location_code, quantity, min_stock_level, unit_price, unit, supplier, barcode, expiry_date, auto_restock_enabled, auto_restock_qty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', p)
            prod_id = cursor.lastrowid
            if prod_id:
                cursor.execute('''
                    INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                    VALUES (?, ?, ?, 'INBOUND', ?, 0, ?, 'Initial inventory batch setup')
                ''', (prod_id, p[0], p[1], p[4], p[4]))

    conn.commit()
    conn.close()

def check_and_trigger_auto_restock(cursor, product_id, reason="Stock level dipped below threshold"):
    """Evaluates if a product needs auto-restocking and creates a restock order if eligible."""
    cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
    prod = cursor.fetchone()
    if not prod:
        return None

    qty = prod['quantity']
    min_stock = prod['min_stock_level']
    enabled = prod['auto_restock_enabled']
    order_qty = prod['auto_restock_qty'] or (min_stock * 2)

    if enabled and qty <= min_stock:
        # Check if an active open order already exists to prevent duplicate open orders
        cursor.execute("SELECT id, order_number FROM restock_orders WHERE product_id = ? AND status = 'TRIGGERED'", (product_id,))
        existing = cursor.fetchone()
        if existing:
            return {'status': 'ALREADY_TRIGGERED', 'order_number': existing['order_number']}

        order_num = f"PO-AUT-{datetime.now().strftime('%y%m%d%H%M%S')}-{prod['id']}"
        est_cost = round(order_qty * (prod['unit_price'] or 0.0), 2)

        cursor.execute('''
            INSERT INTO restock_orders (order_number, product_id, sku, product_name, supplier, order_quantity, status, trigger_reason, total_estimated_cost)
            VALUES (?, ?, ?, ?, ?, ?, 'TRIGGERED', ?, ?)
        ''', (order_num, product_id, prod['sku'], prod['name'], prod['supplier'], order_qty, f"{reason} (Qty: {qty} <= Min: {min_stock})", est_cost))
        
        return {
            'status': 'TRIGGERED',
            'order_number': order_num,
            'quantity': order_qty,
            'product_name': prod['name'],
            'sku': prod['sku']
        }
    return None

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

class WarehouseAPIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith('/api/'):
            conn = get_db()
            cursor = conn.cursor()

            try:
                if path == '/api/stats':
                    cursor.execute('SELECT COUNT(*) FROM products')
                    total_items = cursor.fetchone()[0]

                    cursor.execute('SELECT SUM(quantity) FROM products')
                    total_stock = cursor.fetchone()[0] or 0

                    cursor.execute('SELECT SUM(quantity * unit_price) FROM products')
                    total_value = cursor.fetchone()[0] or 0.0

                    cursor.execute('SELECT COUNT(*) FROM products WHERE quantity <= min_stock_level')
                    low_stock_count = cursor.fetchone()[0]

                    cursor.execute('SELECT COUNT(*) FROM products WHERE quantity = 0')
                    out_of_stock_count = cursor.fetchone()[0]

                    cursor.execute('SELECT COUNT(DISTINCT category) FROM products')
                    categories_count = cursor.fetchone()[0]

                    # Expiry counts (expired vs expiring within 30 days)
                    today_str = datetime.now().strftime('%Y-%m-%d')
                    cursor.execute("SELECT COUNT(*) FROM products WHERE expiry_date IS NOT NULL AND expiry_date != '' AND expiry_date < ?", (today_str,))
                    expired_count = cursor.fetchone()[0]

                    cursor.execute("""
                        SELECT COUNT(*) FROM products 
                        WHERE expiry_date IS NOT NULL AND expiry_date != '' 
                        AND expiry_date >= ? AND expiry_date <= date(?, '+30 days')
                    """, (today_str, today_str))
                    expiring_soon_count = cursor.fetchone()[0]

                    # Auto restock pending count
                    cursor.execute("SELECT COUNT(*) FROM restock_orders WHERE status = 'TRIGGERED'")
                    pending_restock_orders = cursor.fetchone()[0]

                    self._send_json(200, {
                        'total_items': total_items,
                        'total_stock': total_stock,
                        'total_value': round(total_value, 2),
                        'low_stock_count': low_stock_count,
                        'out_of_stock_count': out_of_stock_count,
                        'categories_count': categories_count,
                        'expired_count': expired_count,
                        'expiring_soon_count': expiring_soon_count,
                        'pending_restock_orders': pending_restock_orders
                    })

                elif path == '/api/products':
                    search = query.get('search', [''])[0].strip().lower()
                    category = query.get('category', [''])[0].strip()
                    status = query.get('status', [''])[0].strip() # 'low', 'out', 'expired', 'expiring_soon', 'all'
                    today_str = datetime.now().strftime('%Y-%m-%d')

                    sql = 'SELECT * FROM products WHERE 1=1'
                    params = []

                    if search:
                        sql += ' AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(barcode) LIKE ? OR LOWER(location_code) LIKE ?)'
                        pattern = f'%{search}%'
                        params.extend([pattern, pattern, pattern, pattern])

                    if category and category != 'All':
                        sql += ' AND category = ?'
                        params.append(category)

                    if status == 'low':
                        sql += ' AND quantity <= min_stock_level AND quantity > 0'
                    elif status == 'out':
                        sql += ' AND quantity = 0'
                    elif status == 'expired':
                        sql += " AND expiry_date IS NOT NULL AND expiry_date != '' AND expiry_date < ?"
                        params.append(today_str)
                    elif status == 'expiring_soon':
                        sql += " AND expiry_date IS NOT NULL AND expiry_date != '' AND expiry_date >= ? AND expiry_date <= date(?, '+30 days')"
                        params.extend([today_str, today_str])

                    sql += ' ORDER BY updated_at DESC, id DESC'
                    cursor.execute(sql, params)
                    rows = [dict(r) for r in cursor.fetchall()]
                    self._send_json(200, rows)

                elif path.startswith('/api/products/'):
                    prod_id = int(path.split('/')[-1])
                    cursor.execute('SELECT * FROM products WHERE id = ?', (prod_id,))
                    row = cursor.fetchone()
                    if row:
                        self._send_json(200, dict(row))
                    else:
                        self._send_json(404, {'error': 'Product not found'})

                elif path == '/api/expiry/alerts':
                    today_str = datetime.now().strftime('%Y-%m-%d')
                    # Return items expired or expiring within 60 days, ordered by expiry date
                    cursor.execute("""
                        SELECT id, sku, name, category, location_code, quantity, unit, unit_price, supplier, 
                               batch_lot, mfg_date, storage_temp, shelf_life_days, expiry_date,
                               CAST(julianday(expiry_date) - julianday(?) AS INTEGER) as days_remaining
                        FROM products 
                        WHERE expiry_date IS NOT NULL AND expiry_date != ''
                        ORDER BY expiry_date ASC
                    """, (today_str,))
                    rows = [dict(r) for r in cursor.fetchall()]
                    self._send_json(200, rows)

                elif path == '/api/restock/orders':
                    status_filter = query.get('status', [''])[0].strip()
                    sql = 'SELECT * FROM restock_orders WHERE 1=1'
                    params = []
                    if status_filter:
                        sql += ' AND status = ?'
                        params.append(status_filter)
                    sql += ' ORDER BY id DESC'
                    cursor.execute(sql, params)
                    rows = [dict(r) for r in cursor.fetchall()]
                    self._send_json(200, rows)

                elif path == '/api/reports/monthly':
                    # Month format: YYYY-MM (default to current month)
                    month = query.get('month', [datetime.now().strftime('%Y-%m')])[0].strip()
                    try:
                        month_dt = datetime.strptime(month, '%Y-%m')
                    except Exception:
                        month = datetime.now().strftime('%Y-%m')
                        month_dt = datetime.strptime(month, '%Y-%m')

                    # Compute month start and next month start (exclusive bound)
                    month_start = f"{month}-01 00:00:00"
                    if month_dt.month == 12:
                        next_month_start = f"{month_dt.year + 1}-01-01 00:00:00"
                    else:
                        next_month_start = f"{month_dt.year}-{month_dt.month + 1:02d}-01 00:00:00"

                    # 1. Total finished/outbound items in this month
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as outbound_tx_count,
                            COALESCE(SUM(ABS(quantity_change)), 0) as total_units_finished,
                            COALESCE(SUM(CASE WHEN reference_note LIKE '%WASTE DISPOSAL%' THEN ABS(quantity_change) ELSE 0 END), 0) as total_units_wasted
                        FROM stock_logs 
                        WHERE type = 'OUTBOUND' 
                          AND created_at >= ? AND created_at < ?
                    """, (month_start, next_month_start))
                    outbound_summary = dict(cursor.fetchone())

                    # 2. Total inbound items received in this month
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as inbound_tx_count,
                            COALESCE(SUM(quantity_change), 0) as total_units_received
                        FROM stock_logs 
                        WHERE type = 'INBOUND' 
                          AND created_at >= ? AND created_at < ?
                    """, (month_start, next_month_start))
                    inbound_summary = dict(cursor.fetchone())

                    # 3. Current remaining stock across all products
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as total_active_skus,
                            COALESCE(SUM(quantity), 0) as current_stock_remaining,
                            COALESCE(SUM(quantity * unit_price), 0.0) as remaining_valuation
                        FROM products
                    """)
                    current_totals = dict(cursor.fetchone())

                    # 4. Itemized monthly breakdown per product
                    cursor.execute("""
                        SELECT 
                            p.id, p.sku, p.name, p.category, p.unit, p.unit_price, p.location_code, p.quantity as current_remaining,
                            COALESCE(inbound.qty_in, 0) as month_inbound_qty,
                            COALESCE(outbound.qty_out, 0) as month_finished_qty,
                            COALESCE(waste.qty_waste, 0) as month_wasted_qty
                        FROM products p
                        LEFT JOIN (
                            SELECT product_id, SUM(quantity_change) as qty_in
                            FROM stock_logs
                            WHERE type = 'INBOUND' AND created_at >= ? AND created_at < ?
                            GROUP BY product_id
                        ) inbound ON p.id = inbound.product_id
                        LEFT JOIN (
                            SELECT product_id, SUM(ABS(quantity_change)) as qty_out
                            FROM stock_logs
                            WHERE type = 'OUTBOUND' AND created_at >= ? AND created_at < ?
                            GROUP BY product_id
                        ) outbound ON p.id = outbound.product_id
                        LEFT JOIN (
                            SELECT product_id, SUM(ABS(quantity_change)) as qty_waste
                            FROM stock_logs
                            WHERE type = 'OUTBOUND' AND reference_note LIKE '%WASTE DISPOSAL%' AND created_at >= ? AND created_at < ?
                            GROUP BY product_id
                        ) waste ON p.id = waste.product_id
                        ORDER BY month_finished_qty DESC, p.name ASC
                    """, (month_start, next_month_start, month_start, next_month_start, month_start, next_month_start))
                    
                    product_breakdowns = [dict(r) for r in cursor.fetchall()]

                    # Calculate opening/estimated stock before the month began:
                    # Current = Opening + Inbound - Finished - Waste (rough reconstruction)
                    total_finished = outbound_summary['total_units_finished']
                    total_received = inbound_summary['total_units_received']
                    current_remaining = current_totals['current_stock_remaining']
                    estimated_month_starting = max(0, current_remaining - total_received + total_finished)

                    self._send_json(200, {
                        'month': month,
                        'month_label': month_dt.strftime('%B %Y'),
                        'summary': {
                            'month_starting_stock': estimated_month_starting,
                            'total_units_received': total_received,
                            'total_units_finished': total_finished,
                            'total_units_wasted': outbound_summary['total_units_wasted'],
                            'current_stock_remaining': current_remaining,
                            'remaining_valuation': round(current_totals['remaining_valuation'], 2),
                            'active_skus': current_totals['total_active_skus'],
                            'outbound_dispatches_count': outbound_summary['outbound_tx_count']
                        },
                        'products': product_breakdowns
                    })

                elif path == '/api/categories':
                    cursor.execute('SELECT * FROM categories ORDER BY name ASC')
                    rows = [dict(r) for r in cursor.fetchall()]
                    self._send_json(200, rows)

                elif path == '/api/locations':
                    cursor.execute('SELECT * FROM locations ORDER BY code ASC')
                    rows = [dict(r) for r in cursor.fetchall()]
                    self._send_json(200, rows)

                elif path == '/api/suppliers':
                    cursor.execute('SELECT * FROM suppliers ORDER BY name ASC')
                    rows = [dict(r) for r in cursor.fetchall()]
                    self._send_json(200, rows)

                elif path == '/api/logs':
                    limit = int(query.get('limit', ['50'])[0])
                    cursor.execute('SELECT * FROM stock_logs ORDER BY id DESC LIMIT ?', (limit,))
                    rows = [dict(r) for r in cursor.fetchall()]
                    self._send_json(200, rows)

                elif path == '/api/analytics/smart':
                    # 1. Fetch products & 30-day outbound consumption
                    cursor.execute("""
                        SELECT 
                            p.id, p.sku, p.name, p.category, p.quantity, p.min_stock_level, 
                            p.unit_price, p.unit, p.location_code, p.expiry_date,
                            (p.quantity * p.unit_price) as total_valuation,
                            COALESCE(outbound_30.consumed_qty, 0) as consumed_30d,
                            COALESCE(outbound_30.sales_value, 0.0) as sales_val_30d,
                            last_act.last_movement
                        FROM products p
                        LEFT JOIN (
                            SELECT 
                                product_id, 
                                SUM(ABS(quantity_change)) as consumed_qty,
                                SUM(ABS(quantity_change) * COALESCE((SELECT unit_price FROM products WHERE id = stock_logs.product_id), 0)) as sales_value
                            FROM stock_logs 
                            WHERE type = 'OUTBOUND' AND created_at >= datetime('now', '-30 days')
                            GROUP BY product_id
                        ) outbound_30 ON p.id = outbound_30.product_id
                        LEFT JOIN (
                            SELECT product_id, MAX(created_at) as last_movement
                            FROM stock_logs
                            GROUP BY product_id
                        ) last_act ON p.id = last_act.product_id
                        ORDER BY total_valuation DESC
                    """)
                    prods = [dict(r) for r in cursor.fetchall()]

                    # ABC Classification based on inventory valuation
                    total_wh_val = sum(p['total_valuation'] for p in prods) or 1.0
                    running_sum = 0.0
                    for p in prods:
                        running_sum += p['total_valuation']
                        pct = (running_sum / total_wh_val) * 100.0
                        if pct <= 70.0:
                            p['abc_class'] = 'A' # Top ~70% value (High value)
                        elif pct <= 90.0:
                            p['abc_class'] = 'B' # Next ~20% value
                        else:
                            p['abc_class'] = 'C' # Bottom ~10% value

                        # Consumption velocity & Days of inventory remaining
                        daily_burn = p['consumed_30d'] / 30.0
                        p['daily_burn_rate'] = round(daily_burn, 2)
                        if daily_burn > 0:
                            days_left = round(p['quantity'] / daily_burn, 1)
                            p['days_stock_remaining'] = days_left
                            if days_left <= 7:
                                p['stockout_risk'] = 'CRITICAL'
                            elif days_left <= 21:
                                p['stockout_risk'] = 'MODERATE'
                            else:
                                p['stockout_risk'] = 'HEALTHY'
                        else:
                            p['days_stock_remaining'] = None
                            p['stockout_risk'] = 'NO_RECENT_DEMAND'

                        # Dead Stock Indicator (No activity or 0 consumption with positive quantity)
                        p['is_dead_stock'] = (p['consumed_30d'] == 0 and p['quantity'] > 0)

                    # Group summaries
                    abc_summary = {
                        'A': {'count': sum(1 for p in prods if p['abc_class'] == 'A'), 'value': round(sum(p['total_valuation'] for p in prods if p['abc_class'] == 'A'), 2)},
                        'B': {'count': sum(1 for p in prods if p['abc_class'] == 'B'), 'value': round(sum(p['total_valuation'] for p in prods if p['abc_class'] == 'B'), 2)},
                        'C': {'count': sum(1 for p in prods if p['abc_class'] == 'C'), 'value': round(sum(p['total_valuation'] for p in prods if p['abc_class'] == 'C'), 2)}
                    }
                    high_risk_stockouts = [p for p in prods if p['stockout_risk'] in ('CRITICAL', 'MODERATE')]
                    dead_stocks = [p for p in prods if p['is_dead_stock']]

                    self._send_json(200, {
                        'total_inventory_value': round(total_wh_val, 2),
                        'abc_summary': abc_summary,
                        'high_risk_stockouts': high_risk_stockouts,
                        'dead_stock_count': len(dead_stocks),
                        'dead_stock_value': round(sum(p['total_valuation'] for p in dead_stocks), 2),
                        'items': prods
                    })

                else:
                    self._send_json(404, {'error': 'Not found'})

            except Exception as e:
                self._send_json(500, {'error': str(e)})
            finally:
                conn.close()
            return

        # Serve static file fallback
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        length = int(self.headers.get('content-length', 0))
        raw_body = self.rfile.read(length) if length > 0 else b'{}'
        try:
            body = json.loads(raw_body.decode('utf-8'))
        except Exception:
            self._send_json(400, {'error': 'Invalid JSON body'})
            return

        conn = get_db()
        cursor = conn.cursor()

        try:
            if path == '/api/products':
                # Add new product
                sku = body.get('sku', '').strip().upper()
                name = body.get('name', '').strip()
                category = body.get('category', 'General')
                location_code = body.get('location_code', 'A1-S01')
                quantity = int(body.get('quantity', 0))
                min_stock = int(body.get('min_stock_level', 10))
                unit_price = float(body.get('unit_price', 0.0))
                unit = body.get('unit', 'pcs')
                supplier = body.get('supplier', '')
                barcode = body.get('barcode', sku)
                batch_lot = body.get('batch_lot', '').strip()
                mfg_date = body.get('mfg_date') or None
                shelf_life_days = int(body.get('shelf_life_days')) if body.get('shelf_life_days') else None
                storage_temp = body.get('storage_temp', 'Ambient')
                expiry_date = body.get('expiry_date') or None
                auto_restock_enabled = 1 if body.get('auto_restock_enabled', True) else 0
                auto_restock_qty = int(body.get('auto_restock_qty', 20))

                if not sku or not name:
                    self._send_json(400, {'error': 'SKU and Product Name are required'})
                    return

                cursor.execute('''
                    INSERT INTO products (sku, name, category, location_code, quantity, min_stock_level, unit_price, unit, supplier, barcode, batch_lot, mfg_date, shelf_life_days, storage_temp, expiry_date, auto_restock_enabled, auto_restock_qty, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (sku, name, category, location_code, quantity, min_stock, unit_price, unit, supplier, barcode, batch_lot, mfg_date, shelf_life_days, storage_temp, expiry_date, auto_restock_enabled, auto_restock_qty))
                new_id = cursor.lastrowid

                # Record stock log
                if quantity > 0:
                    cursor.execute('''
                        INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                        VALUES (?, ?, ?, 'INBOUND', ?, 0, ?, 'Product initial inventory creation')
                    ''', (new_id, sku, name, quantity, quantity))

                # Check if initial quantity triggers auto-restock rule
                restock_alert = check_and_trigger_auto_restock(cursor, new_id, reason="Initial stock below threshold")

                conn.commit()
                cursor.execute('SELECT * FROM products WHERE id = ?', (new_id,))
                prod_data = dict(cursor.fetchone())
                prod_data['restock_triggered'] = restock_alert
                self._send_json(201, prod_data)

            elif path == '/api/products/bulk':
                # Bulk insert or update multiple products from dataset
                items = body.get('items', [])
                if not isinstance(items, list) or len(items) == 0:
                    self._send_json(400, {'error': 'No product items provided in payload'})
                    return

                inserted = 0
                updated = 0
                errors = []

                for idx, item in enumerate(items):
                    try:
                        sku = str(item.get('sku', '')).strip().upper()
                        name = str(item.get('name', '')).strip()
                        if not sku or not name:
                            errors.append(f"Row {idx+1}: Missing SKU or Name")
                            continue

                        category = str(item.get('category', 'General')).strip() or 'General'
                        location_code = str(item.get('location_code', 'A1-S01')).strip() or 'A1-S01'
                        quantity = int(float(item.get('quantity', 0)))
                        min_stock = int(float(item.get('min_stock_level', 10)))
                        unit_price = float(item.get('unit_price', 0.0))
                        unit = str(item.get('unit', 'pcs')).strip() or 'pcs'
                        supplier = str(item.get('supplier', '')).strip()
                        barcode = str(item.get('barcode', sku)).strip() or sku
                        batch_lot = str(item.get('batch_lot', '')).strip()
                        mfg_date = item.get('mfg_date') or None
                        shelf_life_days = int(float(item['shelf_life_days'])) if item.get('shelf_life_days') else None
                        storage_temp = str(item.get('storage_temp', 'Ambient')).strip() or 'Ambient'
                        expiry_date = item.get('expiry_date') or None
                        auto_restock_enabled = 1 if item.get('auto_restock_enabled', True) in (True, 'True', 'true', 1, '1', 'Enabled', 'enabled') else 0
                        auto_restock_qty = int(float(item.get('auto_restock_qty', 20)))

                        cursor.execute('SELECT id, quantity FROM products WHERE sku = ?', (sku,))
                        existing = cursor.fetchone()

                        if existing:
                            p_id = existing['id']
                            cursor.execute('''
                                UPDATE products SET
                                    name = ?, category = ?, location_code = ?, quantity = ?,
                                    min_stock_level = ?, unit_price = ?, unit = ?, supplier = ?,
                                    barcode = ?, batch_lot = ?, mfg_date = ?, shelf_life_days = ?,
                                    storage_temp = ?, expiry_date = ?, auto_restock_enabled = ?,
                                    auto_restock_qty = ?, updated_at = CURRENT_TIMESTAMP
                                WHERE id = ?
                            ''', (name, category, location_code, quantity, min_stock, unit_price, unit, supplier, barcode, batch_lot, mfg_date, shelf_life_days, storage_temp, expiry_date, auto_restock_enabled, auto_restock_qty, p_id))
                            
                            cursor.execute('''
                                INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                                VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?, ?, 'Bulk dataset sync/update')
                            ''', (p_id, sku, name, quantity - existing['quantity'], existing['quantity'], quantity))
                            updated += 1
                        else:
                            cursor.execute('''
                                INSERT INTO products (sku, name, category, location_code, quantity, min_stock_level, unit_price, unit, supplier, barcode, batch_lot, mfg_date, shelf_life_days, storage_temp, expiry_date, auto_restock_enabled, auto_restock_qty, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                            ''', (sku, name, category, location_code, quantity, min_stock, unit_price, unit, supplier, barcode, batch_lot, mfg_date, shelf_life_days, storage_temp, expiry_date, auto_restock_enabled, auto_restock_qty))
                            p_id = cursor.lastrowid
                            if quantity > 0:
                                cursor.execute('''
                                    INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                                    VALUES (?, ?, ?, 'INBOUND', ?, 0, ?, 'Bulk dataset creation')
                                ''', (p_id, sku, name, quantity, quantity))
                            inserted += 1

                        check_and_trigger_auto_restock(cursor, p_id, reason="Bulk dataset import")
                    except Exception as row_err:
                        errors.append(f"Row {idx+1}: {str(row_err)}")

                conn.commit()
                self._send_json(200, {
                    'message': f"Bulk upload completed: {inserted} added, {updated} updated.",
                    'inserted': inserted,
                    'updated': updated,
                    'errors': errors
                })

            elif path == '/api/stock/discard':
                # Dedicated endpoint to discard/write-off spoiled or expired food stock safely
                product_id = body.get('product_id')
                reason = body.get('reason', 'Expired / Spoiled food discard')
                discard_qty = body.get('quantity') # If None, discard all remaining stock

                cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
                prod = cursor.fetchone()
                if not prod:
                    self._send_json(404, {'error': 'Product not found'})
                    return

                curr_qty = prod['quantity']
                if curr_qty <= 0:
                    self._send_json(400, {'error': 'Product is already at 0 stock'})
                    return

                qty_to_remove = curr_qty if discard_qty is None else min(int(discard_qty), curr_qty)
                new_qty = curr_qty - qty_to_remove

                cursor.execute('UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (new_qty, product_id))
                cursor.execute('''
                    INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                    VALUES (?, ?, ?, 'OUTBOUND', ?, ?, ?, ?)
                ''', (product_id, prod['sku'], prod['name'], -qty_to_remove, curr_qty, new_qty, f"WASTE DISPOSAL: {reason} (Lot: {prod['batch_lot'] or 'N/A'})"))

                # Check if stock drop triggers auto restock order
                restock_alert = check_and_trigger_auto_restock(cursor, product_id, reason=f"Spoiled food discarded (-{qty_to_remove})")

                conn.commit()
                self._send_json(200, {
                    'message': f"Successfully discarded {qty_to_remove} {prod['unit']} of {prod['name']}. Logged as waste disposal.",
                    'remaining_quantity': new_qty,
                    'auto_restock': restock_alert
                })

            elif path == '/api/stock/adjust':
                # Adjust or Inbound/Outbound
                product_id = body.get('product_id')
                action_type = body.get('type', 'ADJUSTMENT') # 'INBOUND', 'OUTBOUND', 'ADJUSTMENT'
                change = int(body.get('quantity_change', 0))
                note = body.get('note', '')

                cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
                prod = cursor.fetchone()
                if not prod:
                    self._send_json(404, {'error': 'Product not found'})
                    return

                curr_qty = prod['quantity']
                new_qty = curr_qty

                if action_type == 'INBOUND':
                    if change <= 0:
                        self._send_json(400, {'error': 'Inbound quantity must be greater than zero'})
                        return
                    new_qty = curr_qty + change
                elif action_type == 'OUTBOUND':
                    if change <= 0:
                        self._send_json(400, {'error': 'Outbound quantity must be greater than zero'})
                        return
                    if curr_qty < change:
                        self._send_json(400, {'error': f'Insufficient stock! Available: {curr_qty}'})
                        return
                    new_qty = curr_qty - change
                elif action_type == 'ADJUSTMENT':
                    # Set exact quantity
                    target_qty = int(body.get('target_quantity', curr_qty))
                    if target_qty < 0:
                        self._send_json(400, {'error': 'Quantity cannot be negative'})
                        return
                    change = target_qty - curr_qty
                    new_qty = target_qty

                cursor.execute('''
                    UPDATE products 
                    SET quantity = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                ''', (new_qty, product_id))

                cursor.execute('''
                    INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (product_id, prod['sku'], prod['name'], action_type, change, curr_qty, new_qty, note or 'Manual transaction'))

                # Automatic restock evaluation on stock drops (OUTBOUND or downward ADJUSTMENT)
                restock_alert = check_and_trigger_auto_restock(cursor, product_id, reason=f"Outbound dispatch dropped stock ({curr_qty} -> {new_qty})")

                conn.commit()
                cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
                self._send_json(200, {
                    'message': 'Stock successfully updated',
                    'product': dict(cursor.fetchone()),
                    'auto_restock': restock_alert
                })

            elif path == '/api/restock/check-all':
                # Trigger batch auto restock checks for all products below min stock
                cursor.execute('SELECT id FROM products WHERE quantity <= min_stock_level AND auto_restock_enabled = 1')
                prods_to_restock = cursor.fetchall()
                triggered = []
                for p_row in prods_to_restock:
                    res = check_and_trigger_auto_restock(cursor, p_row['id'], reason="Batch auto-restock scan")
                    if res and res.get('status') == 'TRIGGERED':
                        triggered.append(res)
                conn.commit()
                self._send_json(200, {
                    'message': f'Auto restock scan completed. {len(triggered)} purchase orders created.',
                    'triggered_count': len(triggered),
                    'orders': triggered
                })

            elif path == '/api/restock/receive':
                # Receive an open restock order (inbound stock into warehouse)
                order_id = body.get('order_id')
                cursor.execute('SELECT * FROM restock_orders WHERE id = ?', (order_id,))
                order = cursor.fetchone()
                if not order:
                    self._send_json(404, {'error': 'Restock order not found'})
                    return
                if order['status'] != 'TRIGGERED':
                    self._send_json(400, {'error': f'Order is already in {order["status"]} status'})
                    return

                prod_id = order['product_id']
                cursor.execute('SELECT * FROM products WHERE id = ?', (prod_id,))
                prod = cursor.fetchone()
                if not prod:
                    self._send_json(404, {'error': 'Associated product not found'})
                    return

                prev_q = prod['quantity']
                add_q = order['order_quantity']
                new_q = prev_q + add_q

                # Update product stock
                cursor.execute('UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (new_q, prod_id))
                # Update restock order status
                cursor.execute("UPDATE restock_orders SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP WHERE id = ?", (order_id,))
                # Log stock receipt
                cursor.execute('''
                    INSERT INTO stock_logs (product_id, sku, product_name, type, quantity_change, previous_quantity, new_quantity, reference_note)
                    VALUES (?, ?, ?, 'INBOUND', ?, ?, ?, ?)
                ''', (prod_id, prod['sku'], prod['name'], add_q, prev_q, new_q, f"Auto Restock Received: {order['order_number']}"))

                conn.commit()
                self._send_json(200, {
                    'message': f"Order {order['order_number']} marked as RECEIVED. +{add_q} units added.",
                    'new_quantity': new_q
                })

            elif path == '/api/restock/cancel':
                order_id = body.get('order_id')
                cursor.execute("UPDATE restock_orders SET status = 'CANCELLED' WHERE id = ? AND status = 'TRIGGERED'", (order_id,))
                conn.commit()
                self._send_json(200, {'message': f'Order {order_id} cancelled'})

            elif path == '/api/categories':
                name = body.get('name', '').strip()
                desc = body.get('description', '').strip()
                if not name:
                    self._send_json(400, {'error': 'Category name required'})
                    return
                cursor.execute('INSERT INTO categories (name, description) VALUES (?, ?)', (name, desc))
                conn.commit()
                self._send_json(201, {'id': cursor.lastrowid, 'name': name, 'description': desc})

            elif path == '/api/locations':
                code = body.get('code', '').strip().upper()
                zone = body.get('zone', '').strip()
                desc = body.get('description', '').strip()
                if not code:
                    self._send_json(400, {'error': 'Location code required'})
                    return
                cursor.execute('INSERT INTO locations (code, zone, description) VALUES (?, ?, ?)', (code, zone, desc))
                conn.commit()
                self._send_json(201, {'id': cursor.lastrowid, 'code': code, 'zone': zone, 'description': desc})

            elif path == '/api/suppliers':
                name = body.get('name', '').strip()
                contact = body.get('contact_person', '').strip()
                email = body.get('email', '').strip()
                phone = body.get('phone', '').strip()
                address = body.get('address', '').strip()
                if not name:
                    self._send_json(400, {'error': 'Supplier name required'})
                    return
                cursor.execute('INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
                               (name, contact, email, phone, address))
                conn.commit()
                self._send_json(201, {'id': cursor.lastrowid, 'name': name, 'contact_person': contact, 'email': email, 'phone': phone, 'address': address})

            else:
                self._send_json(404, {'error': 'API endpoint not found'})

        except sqlite3.IntegrityError as ie:
            self._send_json(400, {'error': f'Database integrity error: {str(ie)}'})
        except Exception as e:
            self._send_json(500, {'error': str(e)})
        finally:
            conn.close()

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/products/'):
            prod_id = int(path.split('/')[-1])
            length = int(self.headers.get('content-length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8'))

            conn = get_db()
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT * FROM products WHERE id = ?', (prod_id,))
                prod = cursor.fetchone()
                if not prod:
                    self._send_json(404, {'error': 'Product not found'})
                    return

                sku = body.get('sku', prod['sku']).strip().upper()
                name = body.get('name', prod['name']).strip()
                category = body.get('category', prod['category'])
                location_code = body.get('location_code', prod['location_code'])
                min_stock = int(body.get('min_stock_level', prod['min_stock_level']))
                unit_price = float(body.get('unit_price', prod['unit_price']))
                unit = body.get('unit', prod['unit'])
                supplier = body.get('supplier', prod['supplier'])
                barcode = body.get('barcode', prod['barcode'])
                batch_lot = body.get('batch_lot', prod['batch_lot']) if 'batch_lot' in body else prod['batch_lot']
                mfg_date = body.get('mfg_date', prod['mfg_date']) if 'mfg_date' in body else prod['mfg_date']
                shelf_life_days = body.get('shelf_life_days', prod['shelf_life_days']) if 'shelf_life_days' in body else prod['shelf_life_days']
                storage_temp = body.get('storage_temp', prod['storage_temp']) if 'storage_temp' in body else prod['storage_temp']
                expiry_date = body.get('expiry_date') if 'expiry_date' in body else prod['expiry_date']
                auto_restock_enabled = (1 if body.get('auto_restock_enabled') else 0) if 'auto_restock_enabled' in body else prod['auto_restock_enabled']
                auto_restock_qty = int(body.get('auto_restock_qty', prod['auto_restock_qty']))

                cursor.execute('''
                    UPDATE products 
                    SET sku = ?, name = ?, category = ?, location_code = ?, min_stock_level = ?, unit_price = ?, unit = ?, supplier = ?, barcode = ?, batch_lot = ?, mfg_date = ?, shelf_life_days = ?, storage_temp = ?, expiry_date = ?, auto_restock_enabled = ?, auto_restock_qty = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (sku, name, category, location_code, min_stock, unit_price, unit, supplier, barcode, batch_lot, mfg_date, shelf_life_days, storage_temp, expiry_date, auto_restock_enabled, auto_restock_qty, prod_id))
                
                # Check auto restock
                restock_alert = check_and_trigger_auto_restock(cursor, prod_id, reason="Product settings or min stock updated")

                conn.commit()

                cursor.execute('SELECT * FROM products WHERE id = ?', (prod_id,))
                res_prod = dict(cursor.fetchone())
                res_prod['restock_triggered'] = restock_alert
                self._send_json(200, res_prod)
            except Exception as e:
                self._send_json(500, {'error': str(e)})
            finally:
                conn.close()
        else:
            self._send_json(404, {'error': 'Endpoint not found'})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/products/'):
            prod_id = int(path.split('/')[-1])
            conn = get_db()
            cursor = conn.cursor()
            try:
                cursor.execute('DELETE FROM products WHERE id = ?', (prod_id,))
                conn.commit()
                self._send_json(200, {'message': f'Product {prod_id} deleted successfully'})
            except Exception as e:
                self._send_json(500, {'error': str(e)})
            finally:
                conn.close()
        else:
            self._send_json(404, {'error': 'Endpoint not found'})

class ReusableThreadingServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    init_db()
    os.makedirs(STATIC_DIR, exist_ok=True)
    server = ReusableThreadingServer(('0.0.0.0', PORT), WarehouseAPIHandler)
    print(f"Warehouse Backend & Web App running on http://0.0.0.0:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()
