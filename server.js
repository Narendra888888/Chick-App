require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const axios    = require('axios');

const app  = express();
const PORT = 3000;

const JWT_SECRET       = process.env.JWT_SECRET   || 'chickenmart_secret';
const ADMIN_USERNAME   = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD   = process.env.ADMIN_PASSWORD || 'chiken@123';
const TG_TOKEN        = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT_ID      = process.env.TELEGRAM_CHAT_ID || '';
const ADMIN_UPI_ID     = process.env.ADMIN_UPI_ID || 'merchant@upi';
const ADMIN_BANK_ACC   = process.env.ADMIN_BANK_ACCOUNT || '';
const ADMIN_BANK_IFSC  = process.env.ADMIN_BANK_IFSC || '';

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── File paths ──────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE   = path.join(DATA_DIR, 'orders.json');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const UPLOADS_DIR   = path.join(__dirname, 'uploads');

[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── Default Products ─────────────────────────────────────────
const DEFAULT_PRODUCTS = [
  { id: 1, name: "Whole Chicken",     category: "chicken", weight: "1 kg",  price: 220, originalPrice: 280, image: "images/whole_chicken.png",    badge: "fresh",   rating: 4.5, reviews: 1280 },
  { id: 2, name: "Chicken Curry Cut", category: "chicken", weight: "500 g", price: 135, originalPrice: 160, image: "images/chicken_curry_cut.png", badge: "popular", rating: 4.7, reviews: 2340 },
  { id: 3, name: "Chicken Boneless",  category: "chicken", weight: "500 g", price: 180, originalPrice: 220, image: "images/chicken_hero.png",       badge: "fresh",   rating: 4.6, reviews: 980  },
  { id: 4, name: "Mutton Curry Cut",  category: "mutton",  weight: "500 g", price: 380, originalPrice: 440, image: "images/mutton_pieces.png",      badge: "fresh",   rating: 4.8, reviews: 1760 },
  { id: 5, name: "Mutton Keema",      category: "mutton",  weight: "500 g", price: 360, originalPrice: 420, image: "images/mutton_keema.png",       badge: "popular", rating: 4.7, reviews: 890  },
  { id: 6, name: "Mutton Boneless",   category: "mutton",  weight: "500 g", price: 450, originalPrice: 520, image: "images/mutton_hero.png",        badge: "fresh",   rating: 4.9, reviews: 540  }
];

// ─── Helpers ──────────────────────────────────────────────────
const readJSON  = (file, def = []) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : def;
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const readProducts = () => readJSON(PRODUCTS_FILE, DEFAULT_PRODUCTS);
const readOrders   = () => readJSON(ORDERS_FILE, []);
const readUsers    = () => readJSON(USERS_FILE, []);

// ─── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => cb(null, `product_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only'))
});

// ─── Auth Middleware ──────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Admin login required' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function requireCustomer(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Please login first' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// ─── Telegram Notification ────────────────────────────────────
async function sendTelegram(order) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    const itemsList = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
    const msg = `🐔 *New ChickenMart Order!*\n`
      + `Order ID: \`${order.orderId}\`\n`
      + `\n👤 Customer: ${order.name}`
      + `\n📞 Phone: ${order.phone}`
      + `\n📍 Address: ${order.address}, ${order.pincode}`
      + `\n🛒 Items: ${itemsList}`
      + `\n💰 Total: ₹${order.total}`
      + `\n💳 Payment: ${order.payment.toUpperCase()}`
      + `\n🕐 Time: ${order.date}`;

    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT_ID,
      text: msg,
      parse_mode: 'Markdown'
    });
    console.log('✅ Telegram notification sent');
  } catch (err) {
    console.error('❌ Telegram failed:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// Config Endpoint for Payment Details
app.get('/api/config', (req, res) => {
  res.json({ success: true, upiId: ADMIN_UPI_ID, bankAcc: ADMIN_BANK_ACC, ifsc: ADMIN_BANK_IFSC });
});

// Admin Login
app.post('/api/auth/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }
  const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token, username });
});

// Customer Register
app.post('/api/auth/register', async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ success: false, message: 'All fields required' });
  if (!/^[6-9]\d{9}$/.test(phone))  return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number' });
  if (password.length < 6)          return res.status(400).json({ success: false, message: 'Password min 6 characters' });

  const users = readUsers();
  if (users.find(u => u.phone === phone)) {
    return res.status(409).json({ success: false, message: 'Phone number already registered' });
  }
  const hashed = await bcrypt.hash(password, 10);
  const user   = { id: Date.now(), name, phone, password: hashed, role: 'customer', createdAt: new Date().toISOString() };
  users.push(user);
  writeJSON(USERS_FILE, users);

  const token = jwt.sign({ role: 'customer', id: user.id, name, phone }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, name, phone });
});

// Customer Login
app.post('/api/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ success: false, message: 'Phone and password required' });
  const users = readUsers();
  const user  = users.find(u => u.phone === phone);
  if (!user) return res.status(401).json({ success: false, message: 'Phone number not found' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok)  return res.status(401).json({ success: false, message: 'Incorrect password' });

  const token = jwt.sign({ role: 'customer', id: user.id, name: user.name, phone }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, name: user.name, phone });
});

// Verify token (used by frontend on page load)
app.get('/api/auth/verify', requireCustomer, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ═══════════════════════════════════════════════════════════════
//  PRODUCTS API (read = public, write = admin only)
// ═══════════════════════════════════════════════════════════════

app.get('/api/products', (req, res) => {
  let products = readProducts();
  const { category, search } = req.query;
  if (category && category !== 'all') {
    products = category === 'fresh'
      ? products.filter(p => p.badge === 'fresh')
      : products.filter(p => p.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(q) || p.category.includes(q));
  }
  res.json({ success: true, products });
});

app.get('/api/products/:id', (req, res) => {
  const p = readProducts().find(x => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, product: p });
});

app.post('/api/products', requireAdmin, upload.single('image'), (req, res) => {
  const { name, category, price, originalPrice, weight, badge } = req.body;
  if (!name || !category || !price || !originalPrice || !weight)
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  if (Number(price) >= Number(originalPrice))
    return res.status(400).json({ success: false, message: 'Original price must be higher' });

  const products     = readProducts();
  const newProduct   = {
    id: Date.now(), name, category, weight,
    price: Number(price), originalPrice: Number(originalPrice),
    image: req.file ? `uploads/${req.file.filename}` : 'images/chicken_hero.png',
    badge: badge || '', rating: 4.5, reviews: 0
  };
  products.push(newProduct);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, product: newProduct });
});

app.put('/api/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const products = readProducts();
  const idx = products.findIndex(x => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });

  const { name, category, price, originalPrice, weight, badge } = req.body;
  if (Number(price) >= Number(originalPrice))
    return res.status(400).json({ success: false, message: 'Original price must be higher' });
  if (req.file && products[idx].image.startsWith('uploads/')) {
    const old = path.join(__dirname, products[idx].image);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  products[idx] = {
    ...products[idx],
    name: name || products[idx].name,
    category: category || products[idx].category,
    price: Number(price),
    originalPrice: Number(originalPrice),
    weight: weight || products[idx].weight,
    badge: badge !== undefined ? badge : products[idx].badge,
    image: req.file ? `uploads/${req.file.filename}` : products[idx].image
  };
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, product: products[idx] });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const products = readProducts();
  const idx = products.findIndex(x => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
  if (products[idx].image.startsWith('uploads/')) {
    const f = path.join(__dirname, products[idx].image);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  products.splice(idx, 1);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
//  ORDERS API
// ═══════════════════════════════════════════════════════════════

// Place order — customer must be logged in
app.post('/api/orders', requireCustomer, async (req, res) => {
  const { name, phone, address, pincode, payment, items } = req.body;
  if (!name || !phone || !address || !pincode || !payment || !items?.length)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number' });
  if (!/^\d{6}$/.test(pincode))  return res.status(400).json({ success: false, message: 'Invalid pincode' });

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const order = {
    orderId: 'CM' + Date.now().toString().slice(-8).toUpperCase(),
    customerId: req.user.id,
    name, phone, address, pincode, payment, items, total,
    status: 'Pending',
    date: new Date().toLocaleString('en-IN')
  };
  const orders = readOrders();
  orders.unshift(order);
  writeJSON(ORDERS_FILE, orders);

  // Send Telegram notification to admin (non-blocking)
  sendTelegram(order);

  res.json({ success: true, order });
});

// Get orders — admin sees all, customer sees own
app.get('/api/orders', requireCustomer, (req, res) => {
  let orders = readOrders();
  if (req.user.role !== 'admin') {
    orders = orders.filter(o => o.customerId === req.user.id);
  }
  res.json({ success: true, orders });
});

app.delete('/api/orders', requireAdmin, (req, res) => {
  writeJSON(ORDERS_FILE, []);
  res.json({ success: true });
});

// ─── Stats (admin only) ────────────────────────────────────────
app.get('/api/stats', requireAdmin, (req, res) => {
  const products = readProducts();
  const orders   = readOrders();
  res.json({
    success: true,
    stats: {
      totalProducts: products.length,
      totalOrders:   orders.length,
      totalRevenue:  orders.reduce((a, o) => a + o.total, 0),
      chickenCount:  products.filter(p => p.category === 'chicken').length,
      muttonCount:   products.filter(p => p.category === 'mutton').length
    }
  });
});

// ─── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🐔 ChickenMart Server → http://localhost:${PORT}`);
  console.log(`   Store  : http://localhost:${PORT}/index.html`);
  console.log(`   Admin  : http://localhost:${PORT}/admin-login.html`);
  console.log(`   API    : http://localhost:${PORT}/api/products\n`);
});
