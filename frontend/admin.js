// ===== CONFIG =====
const API = 'http://localhost:3000/api';

// ===== ADMIN AUTH GUARD =====
const adminToken = localStorage.getItem('cm_admin_token');
if (!adminToken) { window.location.href = 'admin-login.html'; }

function adminHeaders() {
  return { 'Authorization': `Bearer ${adminToken}` };
}
function adminJsonHeaders() {
  return { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
}

function adminLogout() {
  localStorage.removeItem('cm_admin_token');
  window.location.href = 'admin-login.html';
}

// ===== STATE =====
let products = [];
let editTarget = null;

// ===== INIT =====
async function init() {
  await renderOverview();
}

// ===== NAV =====
function showSection(name) {
  ['overview','add','manage','orders'].forEach(s => {
    document.getElementById('section-' + s).style.display = 'none';
    const nav = document.getElementById('nav-' + s);
    if (nav) nav.classList.remove('active');
  });
  document.getElementById('section-' + name).style.display = 'block';
  const nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');
  if (name === 'overview') renderOverview();
  if (name === 'manage')   renderManageTable();
  if (name === 'orders')   renderOrders();
}

// ===== STATS / OVERVIEW =====
async function renderOverview() {
  try {
    const [statsRes, ordersRes] = await Promise.all([
      fetch(`${API}/stats`,  { headers: adminHeaders() }),
      fetch(`${API}/orders`, { headers: adminHeaders() })
    ]);
    if (statsRes.status === 401 || statsRes.status === 403) { adminLogout(); return; }
    const { stats }  = await statsRes.json();
    const { orders } = await ordersRes.json();

    document.getElementById('statsRow').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${stats.totalProducts}</div>
        <div class="stat-label">Total Products</div>
      </div>
      <div class="stat-card green">
        <div class="stat-value">${stats.totalOrders}</div>
        <div class="stat-label">Orders</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-value">₹${stats.totalRevenue.toLocaleString('en-IN')}</div>
        <div class="stat-label">Revenue</div>
      </div>
      <div class="stat-card red">
        <div class="stat-value">${stats.chickenCount} / ${stats.muttonCount}</div>
        <div class="stat-label">Chicken / Mutton</div>
      </div>`;

    const recent = orders.slice(0, 5);
    document.getElementById('recentOrdersList').innerHTML = recent.length === 0
      ? '<p style="color:#878787;text-align:center;padding:20px">No orders yet.</p>'
      : `<table class="product-table"><thead><tr>
          <th>Order ID</th><th>Customer</th><th>Total</th><th>Payment</th><th>Date</th>
         </tr></thead><tbody>${recent.map(o => `
          <tr>
            <td><strong>${o.orderId}</strong></td>
            <td>${o.name}</td>
            <td><strong>₹${o.total}</strong></td>
            <td>${o.payment === 'cod' ? '💵 COD' : o.payment === 'upi' ? '📱 UPI' : '💳 Card'}</td>
            <td style="color:#878787;font-size:12px">${o.date}</td>
          </tr>`).join('')}
         </tbody></table>`;
  } catch {
    document.getElementById('statsRow').innerHTML =
      '<p style="color:#e74c3c;padding:20px">⚠️ Cannot connect to server. Is it running?</p>';
  }
}

// ===== ADD PRODUCT =====
async function addProduct(e) {
  e.preventDefault();
  const imageFile = document.getElementById('pImage').files[0];
  if (!imageFile) { showToast('Please upload a product image', 'error'); return; }

  const formData = new FormData();
  formData.append('name',          document.getElementById('pName').value.trim());
  formData.append('category',      document.getElementById('pCategory').value);
  formData.append('price',         document.getElementById('pPrice').value);
  formData.append('originalPrice', document.getElementById('pOriginalPrice').value);
  formData.append('weight',        document.getElementById('pWeight').value.trim());
  formData.append('badge',         document.getElementById('pBadge').value);
  formData.append('image',         imageFile);

  try {
    const res  = await fetch(`${API}/products`, { method: 'POST', headers: adminHeaders(), body: formData });
    if (res.status === 401 || res.status === 403) { adminLogout(); return; }
    const data = await res.json();
    if (!data.success) { showToast(data.message, 'error'); return; }
    showToast(`✅ "${data.product.name}" added!`, 'success');
    resetAddForm();
  } catch { showToast('Server error', 'error'); }
}

function previewImage(input) {
  if (!input.files?.[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const p = document.getElementById('imgPreview');
    p.src = e.target.result; p.style.display = 'block';
  };
  reader.readAsDataURL(input.files[0]);
}

function resetAddForm() {
  ['pName','pPrice','pOriginalPrice','pWeight'].forEach(id => document.getElementById(id).value = '');
  ['pCategory','pBadge'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pImage').value = '';
  document.getElementById('imgPreview').style.display = 'none';
}

// ===== MANAGE PRODUCTS =====
async function renderManageTable() {
  try {
    const cat = document.getElementById('filterCat').value;
    const url = cat === 'all' ? `${API}/products` : `${API}/products?category=${cat}`;
    const res = await fetch(url);
    const { products: list } = await res.json();
    products = list;
    const tbody = document.getElementById('productsTableBody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#878787;padding:30px">No products.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(p => {
      const disc = Math.round((1 - p.price / p.originalPrice) * 100);
      return `<tr>
        <td><img src="${p.image}" alt="${p.name}" class="table-img" onerror="this.src='images/chicken_hero.png'"/></td>
        <td><strong>${p.name}</strong><br/>
          <span style="font-size:12px;color:#878787">${p.badge === 'fresh' ? '✅ Fresh' : p.badge === 'popular' ? '🔥 Popular' : ''}</span></td>
        <td><span class="cat-badge ${p.category}">${p.category}</span></td>
        <td>${p.weight}</td>
        <td><strong>₹${p.price}</strong><br/>
          <span style="font-size:11px;color:#878787;text-decoration:line-through">₹${p.originalPrice}</span>
          <span style="font-size:11px;color:#27ae60"> ${disc}% off</span></td>
        <td><div class="table-actions">
          <button class="btn-secondary" onclick="openEdit(${p.id})">✏ Edit</button>
          <button class="btn-danger"    onclick="deleteProduct(${p.id})">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
  } catch { showToast('Cannot load products', 'error'); }
}

async function deleteProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p || !confirm(`Delete "${p.name}"?`)) return;
  try {
    await fetch(`${API}/products/${id}`, { method: 'DELETE', headers: adminHeaders() });
    showToast(`"${p.name}" deleted`, 'error');
    renderManageTable();
  } catch { showToast('Delete failed', 'error'); }
}

// ===== EDIT =====
function openEdit(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  editTarget = p;
  document.getElementById('editId').value            = id;
  document.getElementById('editName').value          = p.name;
  document.getElementById('editCategory').value      = p.category;
  document.getElementById('editPrice').value         = p.price;
  document.getElementById('editOriginalPrice').value = p.originalPrice;
  document.getElementById('editWeight').value        = p.weight;
  document.getElementById('editBadge').value         = p.badge || '';
  document.getElementById('editImgPreview').src      = p.image;
  document.getElementById('editOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeEdit() {
  document.getElementById('editOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function previewEditImage(input) {
  if (!input.files?.[0]) return;
  const reader = new FileReader();
  reader.onload = e => { document.getElementById('editImgPreview').src = e.target.result; };
  reader.readAsDataURL(input.files[0]);
}

async function saveEdit(e) {
  e.preventDefault();
  const id    = document.getElementById('editId').value;
  const price = Number(document.getElementById('editPrice').value);
  const orig  = Number(document.getElementById('editOriginalPrice').value);
  if (price >= orig) { showToast('Original price must be higher', 'error'); return; }

  const formData = new FormData();
  formData.append('name',          document.getElementById('editName').value.trim());
  formData.append('category',      document.getElementById('editCategory').value);
  formData.append('price',         price);
  formData.append('originalPrice', orig);
  formData.append('weight',        document.getElementById('editWeight').value.trim());
  formData.append('badge',         document.getElementById('editBadge').value);
  const imgFile = document.getElementById('editImage').files[0];
  if (imgFile) formData.append('image', imgFile);

  try {
    const res  = await fetch(`${API}/products/${id}`, { method: 'PUT', headers: adminHeaders(), body: formData });
    if (res.status === 401 || res.status === 403) { adminLogout(); return; }
    const data = await res.json();
    if (!data.success) { showToast(data.message, 'error'); return; }
    showToast(`✅ "${data.product.name}" updated!`, 'success');
    closeEdit(); renderManageTable();
  } catch { showToast('Update failed', 'error'); }
}

// ===== ORDERS =====
async function renderOrders() {
  try {
    const res = await fetch(`${API}/orders`, { headers: adminHeaders() });
    if (res.status === 401) { adminLogout(); return; }
    const { orders } = await res.json();
    const section = document.getElementById('ordersSection');
    if (!orders.length) {
      section.innerHTML = '<p style="color:#878787;text-align:center;padding:30px">No orders yet.</p>';
      return;
    }
    section.innerHTML = `<table class="product-table">
      <thead><tr>
        <th>Order ID</th><th>Customer</th><th>Phone</th><th>Address</th>
        <th>Items</th><th>Total</th><th>Payment</th><th>Date</th>
      </tr></thead>
      <tbody>${orders.map(o => `
        <tr class="order-row">
          <td><strong>${o.orderId}</strong></td>
          <td>${o.name}</td><td>${o.phone}</td>
          <td style="font-size:12px;max-width:150px">${o.address}</td>
          <td style="font-size:12px">${o.items.map(i => `${i.name} ×${i.qty}`).join('<br/>')}</td>
          <td><strong>₹${o.total}</strong></td>
          <td>${o.payment === 'cod' ? '💵 COD' : o.payment === 'upi' ? '📱 UPI' : '💳 Card'}</td>
          <td style="color:#878787;font-size:11px">${o.date}</td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch { showToast('Cannot load orders', 'error'); }
}

async function clearOrders() {
  if (!confirm('Clear ALL orders?')) return;
  await fetch(`${API}/orders`, { method: 'DELETE', headers: adminHeaders() });
  showToast('All orders cleared', 'error');
  renderOrders(); renderOverview();
}

// ===== TOAST =====
function showToast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ===== START =====
init();
