// ===== CONFIG =====
const API = 'https://chick-app.onrender.com/api';

// ===== AUTH GUARD =====
const token = localStorage.getItem('cm_customer_token');
const adminToken = localStorage.getItem('cm_admin_token');
const custName = localStorage.getItem('cm_customer_name') || (adminToken ? 'Admin' : 'Customer');

if (!token && !adminToken) { window.location.href = 'login.html'; }

function authHeaders() {
  return { 'Authorization': `Bearer ${token || adminToken}`, 'Content-Type': 'application/json' };
}

// ===== STATE =====
let products = [];
let cart = [];
let activeCategory = 'all';
let searchQuery = '';
let appConfig = { upiId: '', bankAcc: '', ifsc: '' };

// ===== INIT =====
async function init() {
  // Greet user
  document.getElementById('greetUser').textContent = `👋 Hi, ${custName}`;

  const storedCart = localStorage.getItem('cm_cart');
  cart = storedCart ? JSON.parse(storedCart) : [];

  try {
    await fetch(`${API}/config`);
  } catch (e) { }

  await loadProducts();
  updateCartBadge();

  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchProducts();
  });
}

function saveCart() { localStorage.setItem('cm_cart', JSON.stringify(cart)); }

function logout() {
  localStorage.removeItem('cm_customer_token');
  localStorage.removeItem('cm_customer_name');
  localStorage.removeItem('cm_cart');
  window.location.href = 'login.html';
}

// ===== LOAD PRODUCTS FROM API =====
async function loadProducts(category = 'all', search = '') {
  try {
    let url = `${API}/products`;
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (search) params.set('search', search);
    if ([...params].length) url += '?' + params.toString();

    const res = await fetch(url);
    const data = await res.json();
    if (data.success) { products = data.products; renderProducts(); }
  } catch {
    showToast('Could not connect to server', 'error');
    renderEmpty('⚠️ Cannot connect to server. Make sure it is running.');
  }
}

// ===== RENDER PRODUCTS =====
function renderProducts() {
  const grid = document.getElementById('productsGrid');
  document.getElementById('productCount').textContent =
    `${products.length} product${products.length !== 1 ? 's' : ''} found`;

  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="icon">🔍</div><p>No products found.</p></div>`;
    return;
  }
  grid.innerHTML = products.map(p => {
    const discount = Math.round((1 - p.price / p.originalPrice) * 100);
    const inCart = cart.find(c => c.id === p.id);
    const badgeClass = p.badge === 'fresh' ? 'badge-fresh' : p.badge === 'popular' ? 'badge-popular' : '';
    const badgeLabel = p.badge === 'fresh' ? '✅ Fresh' : p.badge === 'popular' ? '🔥 Popular' : '';
    return `
    <div class="product-card">
      <div class="product-img-wrap">
        <img src="${p.image}" alt="${p.name}" class="product-img" onerror="this.src='images/chicken_hero.png'"/>
        ${badgeLabel ? `<span class="product-badge ${badgeClass}">${badgeLabel}</span>` : ''}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-weight">📦 ${p.weight}</div>
        <div class="rating-row">
          <span class="rating-pill">${p.rating} ★</span>
          <span class="rating-count">(${Number(p.reviews).toLocaleString()})</span>
        </div>
        <div class="product-pricing">
          <span class="price-current">₹${p.price}</span>
          <span class="price-original">₹${p.originalPrice}</span>
          <span class="price-discount">${discount}% off</span>
        </div>
        <button class="btn-add-cart ${inCart ? 'added' : ''}" id="btn-${p.id}" onclick="addToCart(${p.id})">
          ${inCart ? '✓ Added to Cart' : '🛒 Add to Cart'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderEmpty(msg) {
  document.getElementById('productsGrid').innerHTML =
    `<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>${msg}</p></div>`;
}

// ===== FILTER & SEARCH =====
function filterCategory(cat) {
  activeCategory = cat; searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.nav-chip').forEach(c => c.classList.remove('active'));
  const chip = document.getElementById('chip-' + cat);
  if (chip) chip.classList.add('active');
  const titles = { all: 'All Products', chicken: '🐔 Chicken', mutton: '🐑 Mutton', fresh: '✅ Fresh Today' };
  document.getElementById('sectionTitle').textContent = titles[cat] || 'Products';
  loadProducts(cat, '');
}

function searchProducts() {
  searchQuery = document.getElementById('searchInput').value.trim();
  activeCategory = 'all';
  document.querySelectorAll('.nav-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('chip-all').classList.add('active');
  document.getElementById('sectionTitle').textContent = searchQuery ? `Results for "${searchQuery}"` : 'All Products';
  loadProducts('all', searchQuery);
}

// ===== CART =====
function addToCart(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const existing = cart.find(c => c.id === id);
  if (existing) { existing.qty += 1; showToast(`${product.name} quantity updated ✓`, 'success'); }
  else { cart.push({ ...product, qty: 1 }); showToast(`${product.name} added to cart ✓`, 'success'); }
  saveCart(); updateCartBadge(); renderCart();
  const btn = document.getElementById('btn-' + id);
  if (btn) { btn.classList.add('added'); btn.textContent = '✓ Added to Cart'; }
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  saveCart(); renderCart(); updateCartBadge();
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  saveCart(); renderCart(); updateCartBadge();
}

function updateCartBadge() {
  const count = cart.reduce((a, c) => a + c.qty, 0);
  const badge = document.getElementById('cartBadge');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderCart() {
  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');
  if (cart.length === 0) {
    body.innerHTML = `<div class="cart-empty">
      <div class="icon">🛒</div>
      <p style="font-weight:600;font-size:16px;margin-bottom:6px">Your cart is empty</p>
      <p style="font-size:13px">Add some chicken or mutton!</p>
    </div>`;
    footer.style.display = 'none'; return;
  }
  const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0);
  body.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='images/chicken_hero.png'"/>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-weight">${item.weight}</div>
        <div class="cart-item-price">₹${item.price * item.qty}</div>
        <div class="qty-controls">
          <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
        </div>
      </div>
      <button class="remove-btn" onclick="removeFromCart(${item.id})" title="Remove">🗑</button>
    </div>`).join('');
  document.getElementById('cartSubtotal').textContent = `₹${subtotal}`;
  document.getElementById('cartTotal').textContent = `₹${subtotal}`;
  footer.style.display = 'block';
}

function openCart() {
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartSidebar').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartSidebar').classList.remove('open');
  document.body.style.overflow = '';
}

// ===== CHECKOUT =====
function openCheckout() {
  if (cart.length === 0) return;
  const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0);
  document.getElementById('orderSummaryBox').innerHTML =
    cart.map(i => `<div class="order-summary-item"><span>${i.name} × ${i.qty}</span><span>₹${i.price * i.qty}</span></div>`).join('') +
    `<div class="order-summary-total"><span>Total</span><span>₹${subtotal}</span></div>`;
  // Pre-fill name from login
  document.getElementById('custName').value = custName;
  closeCart();
  document.getElementById('checkoutOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCheckout() {
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function selectPayment(radio) {
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  radio.closest('.payment-option').classList.add('selected');
}

async function placeOrder() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const pincode = document.getElementById('custPincode').value.trim();
  const payment = document.querySelector('input[name=payment]:checked').value;

  if (!name) { showToast('Please enter your name', 'error'); return; }
  if (!/^[6-9]\d{9}$/.test(phone)) { showToast('Enter valid 10-digit Indian mobile number', 'error'); return; }
  if (!address) { showToast('Please enter delivery address', 'error'); return; }
  if (!/^\d{6}$/.test(pincode)) { showToast('Enter valid 6-digit pincode', 'error'); return; }

  const items = cart.map(({ id, name, price, qty, weight, image }) => ({ id, name, price, qty, weight, image }));

  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, phone, address, pincode, payment, items })
    });
    const data = await res.json();
    if (!data.success) {
      if (res.status === 401) { logout(); return; }
      showToast(data.message || 'Order failed', 'error'); return;
    }
    const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0);

    const payLabels = { cod: 'Cash on Delivery' };
    document.getElementById('orderId').textContent = `Order ID: ${data.order.orderId}`;
    document.getElementById('successMsg').textContent = `Amount: ₹${data.order.total} | Cash on Delivery`;
    cart = []; saveCart(); renderCart(); updateCartBadge();
    closeCheckout();
    document.getElementById('successOverlay').classList.add('open');


  } catch {
    showToast('Server error — check connection', 'error');
  }
}

function closeSuccess() {
  document.getElementById('successOverlay').classList.remove('open');
  document.body.style.overflow = '';
  ['custName', 'custPhone', 'custAddress', 'custPincode'].forEach(id => document.getElementById(id).value = '');
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

// ===== MODALS (Privacy / Contact) =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ===== START =====
init();
