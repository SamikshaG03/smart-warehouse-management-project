// Warehouse Management App Frontend Logic

let allProducts = [];
let allCategories = [];
let allLocations = [];
let allSuppliers = [];
let activeView = 'inventory';

// Indian Rupee currency formatter with en-IN locale
function formatRupees(amount) {
  const num = parseFloat(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.toggle('active');
  if (backdrop) backdrop.classList.toggle('active');
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  try {
    await Promise.allSettled([
      loadCategories(),
      loadLocations(),
      loadSuppliers()
    ]);
  } catch (e) {
    console.warn('Metadata load error:', e);
  }
  
  try {
    await loadStats();
  } catch (e) {
    console.error('Stats error:', e);
  }

  try {
    await loadInventory();
  } catch (e) {
    console.error('Inventory error:', e);
  }
}

// ----------------- Data Loading -----------------
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to load stats');
    const data = await res.json();
    
    document.getElementById('stat-total-skus').textContent = data.total_items.toLocaleString('en-IN');
    document.getElementById('stat-total-units').textContent = data.total_stock.toLocaleString('en-IN');
    document.getElementById('stat-total-value').textContent = formatRupees(data.total_value);
    document.getElementById('stat-low-stock').textContent = data.low_stock_count.toLocaleString('en-IN');
    
    // Expiry Alerts Card
    const totalExpiryIssues = (data.expired_count || 0) + (data.expiring_soon_count || 0);
    const expEl = document.getElementById('stat-expiry-alerts');
    if (expEl) expEl.textContent = totalExpiryIssues.toLocaleString();
    const expSub = document.getElementById('stat-expiry-sub');
    if (expSub) {
      expSub.innerHTML = `<span style="color: #f87171;">${data.expired_count || 0} expired</span>, <span style="color: #fbbf24;">${data.expiring_soon_count || 0} soon</span>`;
    }

    // Pending Restocks Card
    const restockEl = document.getElementById('stat-pending-restocks');
    if (restockEl) restockEl.textContent = (data.pending_restock_orders || 0).toLocaleString();

    // Sidebar Counters
    const navRestock = document.getElementById('nav-restock-count');
    if (navRestock) {
      if (data.pending_restock_orders > 0) {
        navRestock.textContent = data.pending_restock_orders;
        navRestock.style.display = 'inline-block';
      } else {
        navRestock.style.display = 'none';
      }
    }

    const navExpiry = document.getElementById('nav-expiry-count');
    if (navExpiry) {
      if (totalExpiryIssues > 0) {
        navExpiry.textContent = totalExpiryIssues;
        navExpiry.style.display = 'inline-block';
      } else {
        navExpiry.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Stats load error:', err);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    allCategories = cats;

    const filterSelect = document.getElementById('category-filter');
    const modalSelect = document.getElementById('input-category');

    if (filterSelect) {
      filterSelect.innerHTML = '<option value="All">All Categories</option>';
      cats.forEach(c => {
        filterSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
      });
    }

    if (modalSelect) {
      modalSelect.innerHTML = '<option value="" disabled selected>-- Select Category --</option>';
      cats.forEach(c => {
        modalSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
      });
    }
  } catch (err) {
    console.error('Categories error:', err);
  }
}

async function loadLocations() {
  try {
    const res = await fetch('/api/locations');
    const locs = await res.json();
    allLocations = locs;

    const modalSelect = document.getElementById('input-location');
    if (modalSelect) {
      modalSelect.innerHTML = '<option value="" disabled selected>-- Select Warehouse Location --</option>';
      locs.forEach(l => {
        modalSelect.innerHTML += `<option value="${l.code}">${l.code} (${l.zone})</option>`;
      });
    }
  } catch (err) {
    console.error('Locations error:', err);
  }
}

async function loadSuppliers() {
  try {
    const res = await fetch('/api/suppliers');
    const sups = await res.json();
    allSuppliers = sups;

    const modalSelect = document.getElementById('input-supplier');
    modalSelect.innerHTML = '<option value="">None</option>';
    sups.forEach(s => {
      modalSelect.innerHTML += `<option value="${s.name}">${s.name}</option>`;
    });
  } catch (err) {
    console.error('Suppliers error:', err);
  }
}

async function loadInventory() {
  const search = document.getElementById('inventory-search').value.trim();
  const category = document.getElementById('category-filter').value;
  const status = document.getElementById('stock-status-filter').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  if (status) params.append('status', status);

  try {
    const res = await fetch(`/api/products?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch products`);
    const products = await res.json();
    allProducts = products;
    renderInventoryTable(products);
    document.getElementById('product-count-badge').textContent = `${products.length} items`;
  } catch (err) {
    console.error('Inventory load error:', err);
    showToast('Failed to load inventory dataset. Click retry or check connection.', 'error');
    const tbody = document.getElementById('inventory-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 40px; color: #f87171;">
            ⚠️ Could not load inventory dataset from server (${escapeHtml(err.message)}).
            <div style="margin-top: 12px;">
              <button class="btn btn-primary btn-sm" onclick="loadInventory()">🔄 Retry Loading</button>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

function renderInventoryTable(products) {
  const tbody = document.getElementById('inventory-table-body');
  if (!products || products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 48px; color: var(--text-dim);">
          <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">No products found</div>
          <div>Try adjusting your search keywords or clearing active filters.</div>
          <button class="btn btn-secondary btn-sm" style="margin-top: 14px;" onclick="resetInventoryFilters()">Clear All Filters</button>
        </td>
      </tr>
    `;
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tbody.innerHTML = products.map(p => {
    let statusBadge = '<span class="badge badge-in-stock">● In Stock</span>';
    if (p.quantity === 0) {
      statusBadge = '<span class="badge badge-out-of-stock">● Out of Stock</span>';
    } else if (p.quantity <= p.min_stock_level) {
      statusBadge = `<span class="badge badge-low-stock">⚠️ Low (${p.quantity}/${p.min_stock_level})</span>`;
    }

    // Expiry date formatting & badge
    let expiryDisplay = '<span style="color: var(--text-dim);">N/A</span>';
    if (p.expiry_date) {
      const expDate = new Date(p.expiry_date + 'T00:00:00');
      const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        expiryDisplay = `<div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="color: #f87171; font-weight: 600;">${p.expiry_date}</span>
          <span class="badge badge-expired" style="font-size: 0.7rem;">🚨 Expired (${Math.abs(diffDays)}d ago)</span>
        </div>`;
      } else if (diffDays <= 30) {
        expiryDisplay = `<div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="color: #fbbf24; font-weight: 600;">${p.expiry_date}</span>
          <span class="badge badge-expiring-soon" style="font-size: 0.7rem;">⚠️ In ${diffDays} days</span>
        </div>`;
      } else {
        expiryDisplay = `<div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="color: var(--text-main);">${p.expiry_date}</span>
          <span style="color: var(--text-dim); font-size: 0.72rem;">(${diffDays} days left)</span>
        </div>`;
      }
    }

    const restockIndicator = p.auto_restock_enabled ? 
      `<span title="Auto Restock: +${p.auto_restock_qty || 20} on low stock" style="cursor: help; margin-left: 4px; font-size: 0.8rem;">🔄</span>` : '';

    return `
      <tr>
        <td>
          <span class="sku-text">${escapeHtml(p.sku)}</span>
          ${restockIndicator}
        </td>
        <td>
          <strong>${escapeHtml(p.name)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-dim); display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px;">
            <span>Supplier: ${escapeHtml(p.supplier || 'N/A')}</span>
            ${p.batch_lot ? `<span style="font-family: monospace; color: #93c5fd;">Lot: ${escapeHtml(p.batch_lot)}</span>` : ''}
            ${p.storage_temp && p.storage_temp !== 'Ambient' ? `<span style="color: #67e8f9;">[${escapeHtml(p.storage_temp)}]</span>` : ''}
          </div>
        </td>
        <td>
          <span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(p.category)}</span>
        </td>
        <td>
          <span class="location-tag">${escapeHtml(p.location_code)}</span>
        </td>
        <td>
          <span style="font-weight: 700; font-size: 1rem; color: ${p.quantity <= p.min_stock_level ? '#fbbf24' : '#fff'};">
            ${p.quantity}
          </span>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 2px;">${escapeHtml(p.unit)}</span>
        </td>
        <td>
          <span style="font-weight: 600; color: #38bdf8;">${formatRupees(p.unit_price)}</span>
          <div style="font-size: 0.72rem; color: var(--text-dim);">${formatRupees(p.quantity * p.unit_price)} total</div>
        </td>
        <td>
          <span style="color: var(--text-muted);">${p.min_stock_level} ${escapeHtml(p.unit)}</span>
        </td>
        <td>
          ${expiryDisplay}
        </td>
        <td>
          ${statusBadge}
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="openStockModal(${p.id})" title="Stock In/Out">
              ⚡ Adjust
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openBarcodeModal(${p.id})" title="Barcode">
              🏷️ Barcode
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditProductModal(${p.id})" title="Edit">
              ✏️
            </button>
            <button class="btn btn-secondary btn-sm" style="color: #ef4444;" onclick="deleteProduct(${p.id}, '${escapeHtml(p.sku)}')" title="Delete">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ----------------- Filter & Search Handlers -----------------
let searchTimeout = null;
function handleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadInventory();
  }, 250);
}

function handleFilter() {
  loadInventory();
}

function resetInventoryFilters() {
  const searchInput = document.getElementById('inventory-search');
  const catFilter = document.getElementById('category-filter');
  const statusFilter = document.getElementById('stock-status-filter');
  if (searchInput) searchInput.value = '';
  if (catFilter) catFilter.value = 'All';
  if (statusFilter) statusFilter.value = 'all';
  loadInventory();
}

// ----------------- Navigation / View Switching -----------------
function switchView(viewName) {
  activeView = viewName;

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeNavEl = document.getElementById(`nav-${viewName}`);
  if (activeNavEl) activeNavEl.classList.add('active');

  const invSec = document.getElementById('view-inventory-container');
  const restockSec = document.getElementById('view-restock-container');
  const expirySec = document.getElementById('view-expiry-container');
  const monthlySec = document.getElementById('view-monthly-container');
  const analyticsSec = document.getElementById('view-analytics-container');
  const movSec = document.getElementById('view-movements-container');
  const locSec = document.getElementById('view-locations-container');
  const supSec = document.getElementById('view-suppliers-container');

  if (invSec) invSec.style.display = 'none';
  if (restockSec) restockSec.style.display = 'none';
  if (expirySec) expirySec.style.display = 'none';
  if (monthlySec) monthlySec.style.display = 'none';
  if (analyticsSec) analyticsSec.style.display = 'none';
  if (movSec) movSec.style.display = 'none';
  if (locSec) locSec.style.display = 'none';
  if (supSec) supSec.style.display = 'none';

  const titleEl = document.getElementById('view-title');
  const subtitleEl = document.getElementById('view-subtitle');

  if (viewName === 'inventory') {
    if (invSec) invSec.style.display = 'block';
    titleEl.textContent = 'Inventory & Stock Tracking';
    subtitleEl.textContent = 'Real-time SKU quantities, minimum stock alerts, and bin tracking';
    loadInventory();
  } else if (viewName === 'restock') {
    if (restockSec) restockSec.style.display = 'block';
    titleEl.textContent = 'Auto Restock & Purchase Orders';
    subtitleEl.textContent = 'Automated restocking pipeline triggered by low stock thresholds';
    loadRestockOrders();
  } else if (viewName === 'expiry') {
    if (expirySec) expirySec.style.display = 'block';
    titleEl.textContent = 'Product Expiration & Shelf-Life Alerts';
    subtitleEl.textContent = 'FIFO alerts for expiring batches, spoiled stock, and lot tracking';
    loadExpiryAlerts();
  } else if (viewName === 'monthly') {
    if (monthlySec) monthlySec.style.display = 'block';
    titleEl.textContent = 'Monthly Stock Consumption & Remaining Balance';
    subtitleEl.textContent = 'Track monthly starting stock, inbound arrivals, finished goods, and closing balance';
    loadMonthlyReport();
  } else if (viewName === 'analytics') {
    if (analyticsSec) analyticsSec.style.display = 'block';
    titleEl.textContent = 'Smart AI Analytics & ABC Demand Forecast';
    subtitleEl.textContent = 'Pareto valuation classification, daily burn rate, stockout predictions, and dead inventory detection';
    loadSmartAnalytics();
  } else if (viewName === 'movements') {
    if (movSec) movSec.style.display = 'block';
    titleEl.textContent = 'Stock Movements & Activity Log';
    subtitleEl.textContent = 'Complete audit log of all inbound shipments, outbound dispatches, and manual adjustments';
    loadMovements();
  } else if (viewName === 'locations') {
    if (locSec) locSec.style.display = 'block';
    titleEl.textContent = 'Warehouse Locations & Zones';
    subtitleEl.textContent = 'Manage storage bins, racks, aisles, and cold storage facilities';
    loadLocationsTable();
  } else if (viewName === 'suppliers') {
    if (supSec) supSec.style.display = 'block';
    titleEl.textContent = 'Suppliers & Vendors Directory';
    subtitleEl.textContent = 'Direct vendor contacts, accounts, and fulfillment contacts';
    loadSuppliersTable();
  }

  // Auto-close sidebar on mobile after clicking
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar && sidebar.classList.contains('active')) {
    sidebar.classList.remove('active');
  }
  if (backdrop && backdrop.classList.contains('active')) {
    backdrop.classList.remove('active');
  }
}

// ----------------- Movements Log -----------------
async function loadMovements() {
  try {
    const res = await fetch('/api/logs?limit=100');
    const logs = await res.json();
    const tbody = document.getElementById('movements-table-body');

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-dim);">No transactions logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let badge = '<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">ADJUSTMENT</span>';
      let changeColor = '#fff';
      let changeSign = l.quantity_change > 0 ? `+${l.quantity_change}` : `${l.quantity_change}`;

      if (l.type === 'INBOUND') {
        badge = '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">📥 INBOUND</span>';
        changeColor = '#34d399';
      } else if (l.type === 'OUTBOUND') {
        badge = '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">📤 OUTBOUND</span>';
        changeColor = '#f87171';
        changeSign = `-${Math.abs(l.quantity_change)}`;
      }

      return `
        <tr>
          <td style="font-size: 0.82rem; color: var(--text-dim);">${l.created_at}</td>
          <td><span class="sku-text">${escapeHtml(l.sku)}</span></td>
          <td>${escapeHtml(l.product_name)}</td>
          <td>${badge}</td>
          <td style="font-weight: 700; color: ${changeColor};">${changeSign}</td>
          <td style="font-size: 0.85rem;">${l.previous_quantity} &rarr; <strong>${l.new_quantity}</strong></td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${escapeHtml(l.reference_note || '-')}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast('Failed to load activity logs', 'error');
  }
}

// ----------------- Locations Table -----------------
async function loadLocationsTable() {
  await loadLocations();
  const tbody = document.getElementById('locations-table-body');
  if (allLocations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 24px;">No locations found.</td></tr>';
    return;
  }
  tbody.innerHTML = allLocations.map(l => `
    <tr>
      <td><span class="location-tag" style="font-size: 0.95rem;">${escapeHtml(l.code)}</span></td>
      <td><strong>${escapeHtml(l.zone)}</strong></td>
      <td style="color: var(--text-muted);">${escapeHtml(l.description || '-')}</td>
    </tr>
  `).join('');
}

// ----------------- Suppliers Table -----------------
async function loadSuppliersTable() {
  await loadSuppliers();
  const tbody = document.getElementById('suppliers-table-body');
  if (allSuppliers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px;">No suppliers found.</td></tr>';
    return;
  }
  tbody.innerHTML = allSuppliers.map(s => `
    <tr>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.contact_person || '-')}</td>
      <td><a href="mailto:${escapeHtml(s.email)}" style="color: #60a5fa; text-decoration: none;">${escapeHtml(s.email || '-')}</a></td>
      <td>${escapeHtml(s.phone || '-')}</td>
      <td style="color: var(--text-muted);">${escapeHtml(s.address || '-')}</td>
    </tr>
  `).join('');
}

// ----------------- Food Shelf-Life & Product Modal Helpers -----------------
function applyFoodPreset() {
  const preset = document.getElementById('preset-shelf-life').value;
  if (preset) {
    document.getElementById('input-shelf-life').value = preset;
    calculateAutoExpiry();
  }
}

function calculateAutoExpiry() {
  const mfg = document.getElementById('input-mfg-date').value;
  const days = parseInt(document.getElementById('input-shelf-life').value);
  if (mfg && !isNaN(days) && days > 0) {
    const d = new Date(mfg + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    document.getElementById('input-expiry').value = `${yyyy}-${mm}-${dd}`;
  }
}

// ----------------- Product Modal & CRUD -----------------
function openAddProductModal() {
  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-modal-title').textContent = 'Add New Product';
  document.getElementById('group-initial-qty').style.display = 'flex';
  document.getElementById('input-auto-restock').checked = true;
  document.getElementById('input-restock-qty').value = 20;
  document.getElementById('input-batch').value = '';
  document.getElementById('input-mfg-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('input-shelf-life').value = '';
  document.getElementById('input-storage-temp').value = 'Ambient';
  document.getElementById('input-expiry').value = '';

  // Ensure dropdowns are populated
  const catSelect = document.getElementById('input-category');
  if (catSelect && catSelect.children.length <= 1) {
    loadCategories();
  }
  const locSelect = document.getElementById('input-location');
  if (locSelect && locSelect.children.length <= 1) {
    loadLocations();
  }

  document.getElementById('product-modal').classList.add('active');
}

function openEditProductModal(id) {
  const prod = allProducts.find(p => p.id === id);
  if (!prod) return;

  document.getElementById('product-id').value = prod.id;
  document.getElementById('input-sku').value = prod.sku;
  document.getElementById('input-barcode').value = prod.barcode || '';
  document.getElementById('input-name').value = prod.name;
  document.getElementById('input-category').value = prod.category;
  document.getElementById('input-location').value = prod.location_code;
  document.getElementById('input-min-stock').value = prod.min_stock_level;
  document.getElementById('input-price').value = prod.unit_price;
  document.getElementById('input-unit').value = prod.unit;
  document.getElementById('input-supplier').value = prod.supplier || '';
  document.getElementById('input-batch').value = prod.batch_lot || '';
  document.getElementById('input-mfg-date').value = prod.mfg_date || '';
  document.getElementById('input-shelf-life').value = prod.shelf_life_days || '';
  document.getElementById('input-storage-temp').value = prod.storage_temp || 'Ambient';
  document.getElementById('input-expiry').value = prod.expiry_date || '';
  document.getElementById('input-auto-restock').checked = Boolean(prod.auto_restock_enabled);
  document.getElementById('input-restock-qty').value = prod.auto_restock_qty || 20;

  // Hide initial qty on edit because stock adjustment modal is used to alter quantities with logging
  document.getElementById('group-initial-qty').style.display = 'none';
  document.getElementById('product-modal-title').textContent = `Edit Product: ${prod.sku}`;
  document.getElementById('product-modal').classList.add('active');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const isEdit = Boolean(id);

  const payload = {
    sku: document.getElementById('input-sku').value.trim().toUpperCase(),
    barcode: document.getElementById('input-barcode').value.trim() || document.getElementById('input-sku').value.trim().toUpperCase(),
    name: document.getElementById('input-name').value.trim(),
    category: document.getElementById('input-category').value,
    location_code: document.getElementById('input-location').value,
    min_stock_level: parseInt(document.getElementById('input-min-stock').value) || 0,
    unit_price: parseFloat(document.getElementById('input-price').value) || 0,
    unit: document.getElementById('input-unit').value.trim() || 'pcs',
    supplier: document.getElementById('input-supplier').value,
    batch_lot: document.getElementById('input-batch').value.trim() || null,
    mfg_date: document.getElementById('input-mfg-date').value || null,
    shelf_life_days: parseInt(document.getElementById('input-shelf-life').value) || null,
    storage_temp: document.getElementById('input-storage-temp').value || 'Ambient',
    expiry_date: document.getElementById('input-expiry').value || null,
    auto_restock_enabled: document.getElementById('input-auto-restock').checked ? 1 : 0,
    auto_restock_qty: parseInt(document.getElementById('input-restock-qty').value) || 20
  };

  if (!isEdit) {
    payload.quantity = parseInt(document.getElementById('input-quantity').value) || 0;
  }

  try {
    const url = isEdit ? `/api/products/${id}` : '/api/products';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save product');

    let msg = `Product ${payload.sku} successfully saved!`;
    if (data.restock_triggered && data.restock_triggered.status === 'TRIGGERED') {
      msg += ` 🔄 Auto-restock order ${data.restock_triggered.order_number} triggered!`;
    }

    showToast(msg, 'success');
    closeProductModal();
    await loadStats();
    await loadInventory();
    if (activeView === 'restock') loadRestockOrders();
    if (activeView === 'expiry') loadExpiryAlerts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProduct(id, sku) {
  if (!confirm(`Are you sure you want to delete product "${sku}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Delete failed');
    }
    showToast(`Product ${sku} deleted.`, 'info');
    await loadStats();
    await loadInventory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- Stock Inbound / Outbound Modal -----------------
function openStockModal(productId) {
  const prod = allProducts.find(p => p.id === productId);
  if (!prod) return;

  document.getElementById('stock-prod-id').value = prod.id;
  document.getElementById('stock-prod-name').textContent = prod.name;
  document.getElementById('stock-prod-sku').textContent = `SKU: ${prod.sku} | Location: ${prod.location_code}`;
  document.getElementById('stock-prod-current').textContent = `${prod.quantity} ${prod.unit}`;
  
  document.getElementById('stock-action-type').value = 'INBOUND';
  document.getElementById('stock-change-qty').value = '10';
  document.getElementById('stock-note').value = '';
  onStockActionChange();

  document.getElementById('stock-modal').classList.add('active');
}

function closeStockModal() {
  document.getElementById('stock-modal').classList.remove('active');
}

function onStockActionChange() {
  const actionType = document.getElementById('stock-action-type').value;
  const label = document.getElementById('label-stock-qty');
  const input = document.getElementById('stock-change-qty');
  const btn = document.getElementById('btn-confirm-stock');

  if (actionType === 'INBOUND') {
    label.textContent = 'Quantity to Receive (Add)';
    btn.className = 'btn btn-success';
    btn.textContent = '📥 Confirm Stock Receipt';
    input.min = '1';
  } else if (actionType === 'OUTBOUND') {
    label.textContent = 'Quantity to Dispatch (Deduct)';
    btn.className = 'btn btn-danger';
    btn.textContent = '📤 Confirm Stock Dispatch';
    input.min = '1';
  } else {
    label.textContent = 'Exact New Stock Count';
    btn.className = 'btn btn-primary';
    btn.textContent = '⚙️ Confirm Count Adjustment';
    input.min = '0';
  }
}

async function handleStockSubmit(e) {
  e.preventDefault();
  const prodId = parseInt(document.getElementById('stock-prod-id').value);
  const actionType = document.getElementById('stock-action-type').value;
  const qty = parseInt(document.getElementById('stock-change-qty').value);
  const note = document.getElementById('stock-note').value.trim();

  const payload = {
    product_id: prodId,
    type: actionType,
    note
  };

  if (actionType === 'ADJUSTMENT') {
    payload.target_quantity = qty;
  } else {
    payload.quantity_change = qty;
  }

  try {
    const res = await fetch('/api/stock/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transaction failed');

    let successMsg = `Stock updated: ${actionType} recorded successfully`;
    if (data.auto_restock && data.auto_restock.status === 'TRIGGERED') {
      successMsg += ` 🔄 Auto-restocked! PO ${data.auto_restock.order_number} created (+${data.auto_restock.quantity} units requested)`;
    }

    showToast(successMsg, 'success');
    closeStockModal();
    await loadStats();
    await loadInventory();
    if (activeView === 'movements') {
      loadMovements();
    }
    if (activeView === 'restock') {
      loadRestockOrders();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- Barcode Generation Modal -----------------
function openBarcodeModal(productId) {
  const prod = allProducts.find(p => p.id === productId);
  if (!prod) return;

  const barcodeValue = prod.barcode || prod.sku;
  document.getElementById('barcode-item-title').textContent = prod.name;
  document.getElementById('barcode-code-text').textContent = barcodeValue;
  document.getElementById('barcode-loc-text').textContent = `Bin: ${prod.location_code} | SKU: ${prod.sku}`;

  try {
    if (window.JsBarcode) {
      JsBarcode("#barcode-svg", barcodeValue, {
        format: "CODE128",
        lineColor: "#000",
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 10
      });
    }
  } catch (err) {
    console.error('Barcode render error:', err);
  }

  document.getElementById('barcode-modal').classList.add('active');
}

function closeBarcodeModal() {
  document.getElementById('barcode-modal').classList.remove('active');
}

function printBarcode() {
  const content = document.getElementById('printable-barcode').innerHTML;
  const win = window.open('', '', 'height=500, width=600');
  win.document.write('<html><head><title>Print Barcode Label</title>');
  win.document.write('<style>body { display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; text-align: center; } svg { max-width: 100%; }</style>');
  win.document.write('</head><body><div>');
  win.document.write(content);
  win.document.write('</div></body></html>');
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 300);
}

// ----------------- Location Modal -----------------
function openAddLocationModal() {
  document.getElementById('location-form').reset();
  document.getElementById('location-modal').classList.add('active');
}

function closeLocationModal() {
  document.getElementById('location-modal').classList.remove('active');
}

async function handleLocationSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('loc-code').value.trim().toUpperCase();
  const zone = document.getElementById('loc-zone').value.trim();
  const description = document.getElementById('loc-desc').value.trim();

  try {
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, zone, description })
    });
    if (!res.ok) throw new Error('Failed to create location');

    showToast(`Location ${code} added!`, 'success');
    closeLocationModal();
    await loadLocations();
    if (activeView === 'locations') loadLocationsTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- Supplier Modal -----------------
function openAddSupplierModal() {
  document.getElementById('supplier-form').reset();
  document.getElementById('supplier-modal').classList.add('active');
}

function closeSupplierModal() {
  document.getElementById('supplier-modal').classList.remove('active');
}

async function handleSupplierSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('sup-name').value.trim();
  const contact_person = document.getElementById('sup-contact').value.trim();
  const phone = document.getElementById('sup-phone').value.trim();
  const email = document.getElementById('sup-email').value.trim();
  const address = document.getElementById('sup-address').value.trim();

  try {
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact_person, phone, email, address })
    });
    if (!res.ok) throw new Error('Failed to create supplier');

    showToast(`Supplier ${name} added!`, 'success');
    closeSupplierModal();
    await loadSuppliers();
    if (activeView === 'suppliers') loadSuppliersTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- Export CSV -----------------
function exportInventoryCSV() {
  if (!allProducts || allProducts.length === 0) {
    showToast('No inventory data to export', 'info');
    return;
  }

  const headers = ['SKU', 'Name', 'Category', 'Batch/Lot #', 'Storage Temp', 'Location', 'Quantity', 'Min Stock Level', 'Unit Price (₹)', 'Total Value (₹)', 'Unit', 'Mfg Date', 'Expiry Date', 'Auto Restock', 'Restock Qty', 'Supplier', 'Barcode'];
  const rows = allProducts.map(p => [
    `"${p.sku}"`,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.category}"`,
    `"${p.batch_lot || 'N/A'}"`,
    `"${p.storage_temp || 'Ambient'}"`,
    `"${p.location_code}"`,
    p.quantity,
    p.min_stock_level,
    p.unit_price,
    (p.quantity * p.unit_price).toFixed(2),
    `"${p.unit}"`,
    `"${p.mfg_date || 'N/A'}"`,
    `"${p.expiry_date || 'N/A'}"`,
    p.auto_restock_enabled ? 'Enabled' : 'Disabled',
    p.auto_restock_qty || 20,
    `"${(p.supplier || '').replace(/"/g, '""')}"`,
    `"${p.barcode || ''}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `warehouse_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Inventory exported to CSV', 'success');
}

// ----------------- Auto-Restock Orders Logic -----------------
let allRestockOrders = [];

async function loadRestockOrders() {
  try {
    const res = await fetch('/api/restock/orders');
    if (!res.ok) throw new Error('Failed to fetch restock orders');
    const orders = await res.json();
    allRestockOrders = orders;

    const badge = document.getElementById('restock-count-badge');
    const activeCount = orders.filter(o => o.status === 'TRIGGERED').length;
    if (badge) badge.textContent = `${activeCount} pending orders`;

    const tbody = document.getElementById('restock-table-body');
    if (!orders || orders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-dim);">
            No restock purchase orders yet. Restock orders are automatically generated when stock drops below threshold!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      let statusBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">TRIGGERED</span>';
      let actionButtons = `
        <button class="btn btn-success btn-sm" onclick="receiveRestockOrder(${o.id})" title="Receive shipment">
          📥 Receive
        </button>
        <button class="btn btn-secondary btn-sm" style="color: #ef4444;" onclick="cancelRestockOrder(${o.id})" title="Cancel PO">
          ✕ Cancel
        </button>
      `;

      if (o.status === 'RECEIVED') {
        statusBadge = '<span class="badge badge-in-stock">✅ RECEIVED</span>';
        actionButtons = `<span style="font-size: 0.78rem; color: var(--text-muted);">${o.received_at ? o.received_at.split(' ')[0] : 'Completed'}</span>`;
      } else if (o.status === 'CANCELLED') {
        statusBadge = '<span class="badge badge-out-of-stock">🚫 CANCELLED</span>';
        actionButtons = `<span style="font-size: 0.78rem; color: var(--text-dim);">Void</span>`;
      }

      return `
        <tr>
          <td><span class="sku-text" style="color: #93c5fd;">${escapeHtml(o.order_number)}</span></td>
          <td>
            <strong>${escapeHtml(o.product_name)}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">SKU: ${escapeHtml(o.sku)}</div>
          </td>
          <td>${escapeHtml(o.supplier || 'N/A')}</td>
          <td><strong style="color: #34d399; font-size: 1rem;">+${o.order_quantity}</strong></td>
          <td><strong style="color: #38bdf8;">${formatRupees(o.total_estimated_cost || 0)}</strong></td>
          <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 200px;">${escapeHtml(o.trigger_reason || 'Low inventory alert')}</td>
          <td style="font-size: 0.8rem; color: var(--text-dim);">${o.created_at || '-'}</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerAutoRestockScan() {
  try {
    const res = await fetch('/api/restock/check-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Auto restock scan failed');

    if (data.triggered_count > 0) {
      showToast(`⚡ Auto restock triggered ${data.triggered_count} new purchase orders!`, 'success');
    } else {
      showToast('All items are adequately stocked or have existing open orders.', 'info');
    }
    await loadStats();
    await loadRestockOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function receiveRestockOrder(orderId) {
  try {
    const res = await fetch('/api/restock/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to receive order');

    showToast(data.message, 'success');
    await loadStats();
    await loadInventory();
    await loadRestockOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelRestockOrder(orderId) {
  if (!confirm('Are you sure you want to cancel this restock order?')) return;
  try {
    const res = await fetch('/api/restock/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel order');

    showToast('Restock purchase order cancelled', 'info');
    await loadStats();
    await loadRestockOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- Expiry Alerts Logic -----------------
let allExpiryAlerts = [];

async function loadExpiryAlerts() {
  try {
    const res = await fetch('/api/expiry/alerts');
    if (!res.ok) throw new Error('Failed to fetch expiry alerts');
    const items = await res.json();
    allExpiryAlerts = items;

    const countBadge = document.getElementById('expiry-count-badge');
    if (countBadge) countBadge.textContent = `${items.length} monitored items`;

    filterExpiryAlerts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function filterExpiryAlerts() {
  const filter = document.getElementById('expiry-timeframe-filter') ? document.getElementById('expiry-timeframe-filter').value : 'all';
  let filtered = allExpiryAlerts;

  if (filter === 'expired') {
    filtered = allExpiryAlerts.filter(i => i.days_remaining < 0);
  } else if (filter === '30') {
    filtered = allExpiryAlerts.filter(i => i.days_remaining >= 0 && i.days_remaining <= 30);
  } else if (filter === '60') {
    filtered = allExpiryAlerts.filter(i => i.days_remaining <= 60);
  }

  const tbody = document.getElementById('expiry-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-dim);">
          No product lots matching this expiration timeframe.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let daysBadge = '';
    let urgencyStatus = '';

    if (item.days_remaining < 0) {
      daysBadge = `<strong style="color: #f87171;">Expired ${Math.abs(item.days_remaining)}d ago</strong>`;
      urgencyStatus = '<span class="badge badge-expired">🚨 EXPIRED</span>';
    } else if (item.days_remaining <= 15) {
      daysBadge = `<strong style="color: #ef4444;">${item.days_remaining} days left</strong>`;
      urgencyStatus = '<span class="badge badge-expired">🔥 Critical (&le;15d)</span>';
    } else if (item.days_remaining <= 30) {
      daysBadge = `<strong style="color: #fbbf24;">${item.days_remaining} days left</strong>`;
      urgencyStatus = '<span class="badge badge-expiring-soon">⚠️ Urgent (&le;30d)</span>';
    } else {
      daysBadge = `<span style="color: #34d399;">${item.days_remaining} days left</span>`;
      urgencyStatus = '<span class="badge badge-fresh">Good Shelf-Life</span>';
    }

    let tempBadge = `<span style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(item.storage_temp || 'Ambient')}</span>`;
    if (item.storage_temp && item.storage_temp.includes('Chilled')) {
      tempBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 0.75rem;">❄️ Chilled</span>`;
    } else if (item.storage_temp && item.storage_temp.includes('Frozen')) {
      tempBadge = `<span class="badge" style="background: rgba(6, 182, 212, 0.15); color: #67e8f9; font-size: 0.75rem;">🧊 Frozen</span>`;
    }

    return `
      <tr>
        <td><span class="sku-text">${escapeHtml(item.sku)}</span></td>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Supplier: ${escapeHtml(item.supplier || 'N/A')}</div>
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.8rem; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">
            ${escapeHtml(item.batch_lot || 'LOT-GENERAL')}
          </span>
        </td>
        <td><span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(item.category)}</span></td>
        <td>${tempBadge}</td>
        <td><span class="location-tag">${escapeHtml(item.location_code)}</span></td>
        <td><strong>${item.quantity}</strong> ${escapeHtml(item.unit)}</td>
        <td style="font-family: monospace; font-weight: 600;">${item.expiry_date}</td>
        <td>${daysBadge}</td>
        <td>${urgencyStatus}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="openStockModal(${item.id})" title="Dispatch FIFO">
              📤 Ship
            </button>
            <button class="btn btn-sm btn-danger" onclick="discardSpoiledStock(${item.id}, '${escapeHtml(item.name)}', ${item.quantity})" title="Dispose of spoiled/expired stock" ${item.quantity === 0 ? 'disabled style="opacity:0.4;"' : ''}>
              🗑️ Discard
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditProductModal(${item.id})" title="Edit Lot">
              ✏️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function discardSpoiledStock(productId, productName, currentQty) {
  if (currentQty <= 0) {
    showToast('Stock is already 0', 'info');
    return;
  }
  const confirmMsg = `Dispose and write-off ${currentQty} units of expired/spoiled "${productName}"?\n\nThis will safely zero out expired stock and record an audit entry.`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/stock/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        reason: 'Expired food stock quarantined and discarded'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Discard action failed');

    let toastMsg = data.message;
    if (data.auto_restock && data.auto_restock.status === 'TRIGGERED') {
      toastMsg += ` 🔄 Auto-restock triggered PO ${data.auto_restock.order_number}!`;
    }

    showToast(toastMsg, 'success');
    await loadStats();
    await loadInventory();
    await loadExpiryAlerts();
    if (activeView === 'restock') loadRestockOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- Monthly Stock Balance & Consumption Logic -----------------
let currentMonthlyReportData = null;

async function loadMonthlyReport() {
  const picker = document.getElementById('monthly-picker');
  if (!picker.value) {
    picker.value = new Date().toISOString().slice(0, 7); // Default YYYY-MM
  }
  const selectedMonth = picker.value;

  try {
    const res = await fetch(`/api/reports/monthly?month=${selectedMonth}`);
    if (!res.ok) throw new Error('Failed to load monthly report data');
    const data = await res.json();
    currentMonthlyReportData = data;

    // Update Header Badges & Stat Cards
    const badgeLabel = document.getElementById('monthly-badge-label');
    if (badgeLabel) badgeLabel.textContent = data.month_label;

    document.getElementById('month-stat-starting').textContent = data.summary.month_starting_stock.toLocaleString();
    document.getElementById('month-stat-received').textContent = `+${data.summary.total_units_received.toLocaleString()}`;
    document.getElementById('month-stat-finished').textContent = `-${data.summary.total_units_finished.toLocaleString()}`;
    document.getElementById('month-stat-remaining').textContent = data.summary.current_stock_remaining.toLocaleString();
    
    const wasteSub = document.getElementById('month-stat-waste-sub');
    if (wasteSub) {
      wasteSub.innerHTML = `<span>Sales & Orders</span> · <span style="color: #ef4444;">${data.summary.total_units_wasted} spoiled</span>`;
    }

    const valSub = document.getElementById('month-stat-valuation');
    if (valSub) {
      valSub.textContent = `Valuation: ${formatRupees(data.summary.remaining_valuation)}`;
    }

    // Render Table
    const tbody = document.getElementById('monthly-table-body');
    if (!data.products || data.products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-dim);">
            No products found for this month.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.products.map(p => {
      const finishedHighlight = p.month_finished_qty > 0 ? 
        `<strong style="color: #fbbf24;">-${p.month_finished_qty}</strong>` : `<span style="color: var(--text-dim);">0</span>`;
      const inboundHighlight = p.month_inbound_qty > 0 ? 
        `<strong style="color: #34d399;">+${p.month_inbound_qty}</strong>` : `<span style="color: var(--text-dim);">0</span>`;
      const wasteHighlight = p.month_wasted_qty > 0 ? 
        `<span style="color: #f87171; font-weight: 600;">${p.month_wasted_qty}</span>` : `<span style="color: var(--text-dim);">-</span>`;

      return `
        <tr>
          <td><span class="sku-text">${escapeHtml(p.sku)}</span></td>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td><span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(p.category)}</span></td>
          <td><span class="location-tag">${escapeHtml(p.location_code)}</span></td>
          <td>${inboundHighlight} <span style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(p.unit)}</span></td>
          <td>${finishedHighlight} <span style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(p.unit)}</span></td>
          <td>${wasteHighlight}</td>
          <td><strong style="color: #fff; font-size: 0.95rem;">${p.current_remaining}</strong> <span style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(p.unit)}</span></td>
          <td><strong style="color: #38bdf8;">${formatRupees(p.unit_price)}</strong></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function exportMonthlyCSV() {
  if (!currentMonthlyReportData || !currentMonthlyReportData.products || currentMonthlyReportData.products.length === 0) {
    showToast('No monthly report data to export', 'info');
    return;
  }

  const data = currentMonthlyReportData;
  const headers = ['Month', 'SKU', 'Product Name', 'Category', 'Location', 'Received Qty (+)', 'Finished/Dispatched Qty (-)', 'Spoiled/Discarded Qty', 'Current Remaining Qty', 'Unit Price (₹)', 'Current Valuation (₹)', 'Unit'];
  const rows = data.products.map(p => [
    `"${data.month_label}"`,
    `"${p.sku}"`,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.category}"`,
    `"${p.location_code}"`,
    p.month_inbound_qty,
    p.month_finished_qty,
    p.month_wasted_qty,
    p.current_remaining,
    p.unit_price,
    (p.current_remaining * p.unit_price).toFixed(2),
    `"${p.unit}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `monthly_stock_report_${data.month}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Monthly report for ${data.month_label} exported!`, 'success');
}

// ----------------- Smart AI Analytics & ABC Forecasting -----------------
let currentAnalyticsData = null;

async function loadSmartAnalytics() {
  const tbody = document.getElementById('analytics-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-dim);">
          <div class="spinner" style="display: inline-block; margin-right: 8px;"></div> Computing ABC classification & burn rates...
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch('/api/analytics/smart');
    if (!res.ok) throw new Error('Failed to fetch smart analytics');
    const data = await res.json();
    currentAnalyticsData = data;

    // Update KPI Cards
    const classACountEl = document.getElementById('analytics-class-a-count');
    const classAValEl = document.getElementById('analytics-class-a-val');
    if (classACountEl) classACountEl.textContent = `${data.abc_summary.A.count} items`;
    if (classAValEl) classAValEl.textContent = `${formatRupees(data.abc_summary.A.value)} valuation`;

    const classBCountEl = document.getElementById('analytics-class-b-count');
    const classBValEl = document.getElementById('analytics-class-b-val');
    if (classBCountEl) classBCountEl.textContent = `${data.abc_summary.B.count} items`;
    if (classBValEl) classBValEl.textContent = `${formatRupees(data.abc_summary.B.value)} valuation`;

    const riskCount = data.high_risk_stockouts.length;
    const stockoutCountEl = document.getElementById('analytics-stockout-risk-count');
    if (stockoutCountEl) stockoutCountEl.textContent = `${riskCount} SKUs`;

    // Sidebar badge
    const navStockoutBadge = document.getElementById('nav-stockout-risk-count');
    if (navStockoutBadge) {
      if (riskCount > 0) {
        navStockoutBadge.textContent = riskCount;
        navStockoutBadge.style.display = 'inline-block';
      } else {
        navStockoutBadge.style.display = 'none';
      }
    }

    const deadCountEl = document.getElementById('analytics-dead-stock-count');
    const deadValEl = document.getElementById('analytics-dead-stock-val');
    if (deadCountEl) deadCountEl.textContent = `${data.dead_stock_count} SKUs`;
    if (deadValEl) deadValEl.textContent = `Tied up capital: ${formatRupees(data.dead_stock_value)}`;

    // Strategy Advisor Narrative
    const stratEl = document.getElementById('analytics-strategy-text');
    if (stratEl) {
      let advice = [];
      if (riskCount > 0) {
        const topRisk = data.high_risk_stockouts[0];
        advice.push(`⚠️ <strong>Stockout Urgency</strong>: ${topRisk.name} (${topRisk.sku}) has only ${topRisk.days_stock_remaining} days of stock left based on recent 30-day burn velocity. Immediate replenishment is advised.`);
      }
      if (data.dead_stock_count > 0) {
        advice.push(`📦 <strong>Capital Optimization</strong>: ${data.dead_stock_count} products (${formatRupees(data.dead_stock_value)}) have 0 consumption in the last 30 days. Consider bundle promotions or reducing reorder thresholds.`);
      }
      if (advice.length === 0) {
        advice.push(`✅ Inventory levels are well-balanced across all categories with healthy runway.`);
      }
      stratEl.innerHTML = advice.join('<br>');
    }

    // Render Table
    if (tbody) {
      if (!data.items || data.items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 32px; color: var(--text-dim);">No items found.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.items.map(p => {
        // ABC badge
        let abcBadge = '';
        if (p.abc_class === 'A') {
          abcBadge = '<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4);">Class A (Top Value)</span>';
        } else if (p.abc_class === 'B') {
          abcBadge = '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">Class B (Moderate)</span>';
        } else {
          abcBadge = '<span class="badge" style="background: rgba(107, 114, 128, 0.2); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.4);">Class C (Low Value)</span>';
        }

        // Stockout risk badge
        let riskBadge = '';
        if (p.stockout_risk === 'CRITICAL') {
          riskBadge = '<span class="badge badge-expired">🚨 Critical (&le;7d)</span>';
        } else if (p.stockout_risk === 'MODERATE') {
          riskBadge = '<span class="badge badge-expiring-soon">⚠️ Moderate (&le;21d)</span>';
        } else if (p.stockout_risk === 'HEALTHY') {
          riskBadge = '<span class="badge badge-fresh">✅ Healthy</span>';
        } else {
          riskBadge = '<span style="color: var(--text-dim); font-size: 0.8rem;">Idle (0 Demand)</span>';
        }

        // Runway display
        const runwayDisplay = p.days_stock_remaining !== null 
          ? `<strong>${p.days_stock_remaining}</strong> <span style="font-size: 0.75rem; color: var(--text-dim);">days</span>`
          : '<span style="color: var(--text-dim);">&infin; / No Burn</span>';

        // Dead stock highlight
        const deadHighlight = p.is_dead_stock ? '<span style="color: #c084fc; font-size: 0.75rem; margin-left: 4px;">💤 Dead Stock</span>' : '';

        return `
          <tr>
            <td>
              <span class="sku-text">${escapeHtml(p.sku)}</span>
              <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(p.name)}</div>
            </td>
            <td><span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(p.category)}</span></td>
            <td>${abcBadge}</td>
            <td>
              <strong style="color: ${p.quantity <= p.min_stock_level ? '#fbbf24' : '#fff'};">${p.quantity}</strong> ${escapeHtml(p.unit)}
              ${deadHighlight}
            </td>
            <td>
              <span style="color: #93c5fd;">${p.daily_burn_rate}</span> <span style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(p.unit)}/day</span>
              <div style="font-size: 0.72rem; color: var(--text-dim);">(${p.consumed_30d} past 30d)</div>
            </td>
            <td>${runwayDisplay}</td>
            <td>${riskBadge}</td>
            <td>
              <strong style="color: #38bdf8;">${formatRupees(p.total_valuation)}</strong>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openAdjustmentModal(${p.id}, '${escapeHtml(p.sku)}', '${escapeHtml(p.name)}', ${p.quantity})">
                Adjust
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Smart analytics error:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 32px; color: #f87171;">
            ⚠️ Could not load smart analytics (${escapeHtml(err.message)}).
            <div style="margin-top: 10px;">
              <button class="btn btn-primary btn-sm" onclick="loadSmartAnalytics()">🔄 Retry</button>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

function exportAnalyticsCSV() {
  if (!currentAnalyticsData || !currentAnalyticsData.items || currentAnalyticsData.items.length === 0) {
    showToast('No analytics data available to export.', 'info');
    return;
  }

  const headers = ['SKU', 'Product Name', 'Category', 'ABC Class', 'Current Quantity', 'Unit', 'Unit Price (₹)', 'Total Value (₹)', '30-Day Consumption', 'Daily Burn Rate', 'Days Stock Remaining', 'Stockout Risk'];
  const rows = currentAnalyticsData.items.map(p => [
    `"${p.sku}"`,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.category}"`,
    p.abc_class,
    p.quantity,
    `"${p.unit}"`,
    p.unit_price,
    p.total_valuation.toFixed(2),
    p.consumed_30d,
    p.daily_burn_rate,
    p.days_stock_remaining !== null ? p.days_stock_remaining : 'N/A',
    p.stockout_risk
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `smart_inventory_analytics_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Smart Inventory Analytics exported to CSV!', 'success');
}

// ----------------- Utilities -----------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ----------------- Bulk Upload Feature -----------------
let bulkParsedItems = [];

function openBulkUploadModal() {
  bulkParsedItems = [];
  const fileInput = document.getElementById('bulk-file-input');
  if (fileInput) fileInput.value = '';
  const titleEl = document.getElementById('bulk-file-title');
  if (titleEl) titleEl.textContent = 'Click to choose a CSV or JSON file';
  const previewWrapper = document.getElementById('bulk-preview-wrapper');
  if (previewWrapper) previewWrapper.style.display = 'none';
  const submitBtn = document.getElementById('btn-submit-bulk');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Upload & Process';
  }
  document.getElementById('bulk-upload-modal').classList.add('active');
}

function closeBulkUploadModal() {
  document.getElementById('bulk-upload-modal').classList.remove('active');
}

function handleBulkFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name;
  const ext = fileName.split('.').pop().toLowerCase();

  const titleEl = document.getElementById('bulk-file-title');
  if (titleEl) titleEl.textContent = `Selected: ${fileName} (${(file.size / 1024).toFixed(1)} KB)`;

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    try {
      if (ext === 'json') {
        parseBulkJSON(content);
      } else if (ext === 'csv') {
        parseBulkCSV(content);
      } else {
        showToast('Please upload a valid .csv or .json file', 'error');
      }
    } catch (err) {
      showToast('Error parsing file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function parseBulkJSON(jsonString) {
  const data = JSON.parse(jsonString);
  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data.items && Array.isArray(data.items)) {
    list = data.items;
  } else if (data.products && Array.isArray(data.products)) {
    list = data.products;
  } else {
    throw new Error('JSON must be an array of objects or contain an "items" array.');
  }

  bulkParsedItems = list.map(item => ({
    sku: String(item.sku || item.SKU || '').trim(),
    name: String(item.name || item.Name || item.product_name || '').trim(),
    category: item.category || item.Category || 'General',
    location_code: item.location_code || item.Location || item.location || 'A1-S01',
    quantity: Number(item.quantity || item.Quantity || item.qty || 0),
    min_stock_level: Number(item.min_stock_level || item.min_stock || 10),
    unit_price: Number(item.unit_price || item.price || 0),
    unit: item.unit || item.Unit || 'pcs',
    supplier: item.supplier || item.Supplier || '',
    barcode: item.barcode || item.Barcode || '',
    batch_lot: item.batch_lot || item.batch || '',
    storage_temp: item.storage_temp || 'Ambient',
    mfg_date: item.mfg_date || '',
    expiry_date: item.expiry_date || '',
    auto_restock_enabled: item.auto_restock_enabled !== undefined ? item.auto_restock_enabled : true,
    auto_restock_qty: item.auto_restock_qty || 20
  })).filter(p => p.sku && p.name);

  updateBulkPreview();
}

function parseBulkCSV(csvString) {
  const lines = csvString.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must contain a header line and at least one item line.');
  }

  // Parse CSV line taking quotes into account
  const parseLine = (text) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i+1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const items = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length <= 1 && !values[0]) continue;
    const item = {};
    headers.forEach((header, idx) => {
      item[header] = values[idx] !== undefined ? values[idx] : '';
    });

    const sku = item.sku || item.skunumber || item.itemcode || '';
    const name = item.name || item.productname || item.itemname || item.title || '';
    if (!sku || !name) continue;

    items.push({
      sku: sku.trim(),
      name: name.trim(),
      category: item.category || 'General',
      location_code: item.location || item.locationcode || 'A1-S01',
      quantity: Number(item.quantity || item.qty || 0),
      min_stock_level: Number(item.minstocklevel || item.minstock || 10),
      unit_price: Number(item.unitprice || item.price || item.unitpriceinr || 0),
      unit: item.unit || 'pcs',
      supplier: item.supplier || '',
      barcode: item.barcode || sku.trim(),
      batch_lot: item.batchlot || item.batch || '',
      storage_temp: item.storagetemp || 'Ambient',
      mfg_date: item.mfgdate || '',
      expiry_date: item.expirydate || '',
      auto_restock_enabled: (item.autorestock || '').toLowerCase() !== 'disabled',
      auto_restock_qty: Number(item.restockqty || item.autorestockqty || 20)
    });
  }

  bulkParsedItems = items;
  updateBulkPreview();
}

function updateBulkPreview() {
  const previewWrapper = document.getElementById('bulk-preview-wrapper');
  const countEl = document.getElementById('bulk-preview-count');
  const tbody = document.getElementById('bulk-preview-tbody');
  const submitBtn = document.getElementById('btn-submit-bulk');

  if (bulkParsedItems.length === 0) {
    previewWrapper.style.display = 'none';
    submitBtn.disabled = true;
    showToast('No valid product rows found in file. Check SKU & Name headers.', 'error');
    return;
  }

  countEl.textContent = `✅ ${bulkParsedItems.length} product(s) found in file`;
  tbody.innerHTML = '';
  bulkParsedItems.slice(0, 5).forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 6px 10px; font-weight: 600;">${escapeHtml(item.sku)}</td>
      <td style="padding: 6px 10px;">${escapeHtml(item.name)}</td>
      <td style="padding: 6px 10px;"><span class="badge" style="font-size: 0.72rem;">${escapeHtml(item.category)}</span></td>
      <td style="padding: 6px 10px;">${item.quantity}</td>
      <td style="padding: 6px 10px;">₹${item.unit_price}</td>
      <td style="padding: 6px 10px;"><code>${escapeHtml(item.location_code)}</code></td>
    `;
    tbody.appendChild(tr);
  });

  previewWrapper.style.display = 'block';
  submitBtn.disabled = false;
  submitBtn.textContent = `Upload ${bulkParsedItems.length} Products`;
}

async function submitBulkUpload() {
  if (!bulkParsedItems || bulkParsedItems.length === 0) {
    showToast('No valid items to upload', 'error');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-bulk');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing upload...';

  try {
    const res = await fetch('/api/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: bulkParsedItems })
    });
    const result = await res.json();

    if (res.ok) {
      showToast(result.message || 'Dataset uploaded successfully!', 'success');
      closeBulkUploadModal();
      loadProducts();
      loadStockLogs();
      if (typeof loadSmartAnalytics === 'function') loadSmartAnalytics();
      if (typeof loadWarehouseMap === 'function') loadWarehouseMap();
      if (typeof loadRestockOrders === 'function') loadRestockOrders();
    } else {
      showToast(result.error || 'Failed to upload dataset', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = `Upload ${bulkParsedItems.length} Products`;
    }
  } catch (err) {
    showToast('Network error during bulk upload: ' + err.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = `Upload ${bulkParsedItems.length} Products`;
  }
}

function downloadSampleCSV() {
  const csv = `SKU,Name,Category,Batch/Lot #,Storage Temp,Location,Quantity,Min Stock Level,Unit Price (₹),Unit,Mfg Date,Expiry Date,Auto Restock,Restock Qty,Supplier,Barcode
SKU-SNK-001,Almond Crunchy Cookies,Snacks,LOT-COOKIE-2026,Ambient,A1-S01,150,25,85.0,pack,2026-09-01,2027-03-01,Enabled,50,SweetBites Ltd,890123456701
SKU-BEV-002,Organic Green Tea 250g,Beverages,LOT-TEA-2026,Dry & Cool,B2-S04,200,30,120.0,box,2026-08-15,2027-08-15,Enabled,40,TeaCraft India,890123456702
SKU-GRC-003,Premium Basmati Rice 5kg,Grains,LOT-RICE-2026,Dry & Cool,C1-S02,80,15,450.0,bag,2026-07-10,2028-01-10,Enabled,30,Himalayan Agro,890123456703`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'product_dataset_sample.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadSampleJSON() {
  const sample = [
    {
      "sku": "SKU-SNK-001",
      "name": "Almond Crunchy Cookies",
      "category": "Snacks",
      "batch_lot": "LOT-COOKIE-2026",
      "storage_temp": "Ambient",
      "location_code": "A1-S01",
      "quantity": 150,
      "min_stock_level": 25,
      "unit_price": 85.0,
      "unit": "pack",
      "mfg_date": "2026-09-01",
      "expiry_date": "2027-03-01",
      "auto_restock_enabled": true,
      "auto_restock_qty": 50,
      "supplier": "SweetBites Ltd",
      "barcode": "890123456701"
    },
    {
      "sku": "SKU-BEV-002",
      "name": "Organic Green Tea 250g",
      "category": "Beverages",
      "batch_lot": "LOT-TEA-2026",
      "storage_temp": "Dry & Cool",
      "location_code": "B2-S04",
      "quantity": 200,
      "min_stock_level": 30,
      "unit_price": 120.0,
      "unit": "box",
      "mfg_date": "2026-08-15",
      "expiry_date": "2027-08-15",
      "auto_restock_enabled": true,
      "auto_restock_qty": 40,
      "supplier": "TeaCraft India",
      "barcode": "890123456702"
    }
  ];
  const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'product_dataset_sample.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
