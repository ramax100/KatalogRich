const state = {
  store: null,
  products: [],
  categories: [],
  query: '',
  categoryId: 'all',
  popularOnly: false,
  sort: 'default',
  cart: []
};

const CART_STORAGE_KEY = 'katalog-web-cart-v1';

const els = {
  storeName: document.getElementById('storeName'),
  botUsername: document.getElementById('botUsername'),
  storeLogo: document.getElementById('storeLogo'),
  storeLogoFallback: document.getElementById('storeLogoFallback'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  openPopular: document.getElementById('openPopular'),
  heroShopButton: document.getElementById('heroShopButton'),
  heroCategoryButton: document.getElementById('heroCategoryButton'),
  totalProducts: document.getElementById('totalProducts'),
  totalCategories: document.getElementById('totalCategories'),
  totalPopular: document.getElementById('totalPopular'),
  categoryChips: document.getElementById('categoryChips'),
  categorySection: document.getElementById('categorySection'),
  resetFilter: document.getElementById('resetFilter'),
  sortSelect: document.getElementById('sortSelect'),
  categorySelect: document.getElementById('categorySelect'),
  popularOnly: document.getElementById('popularOnly'),
  activeFilterLabel: document.getElementById('activeFilterLabel'),
  productsTitle: document.getElementById('productsTitle'),
  resultCount: document.getElementById('resultCount'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  productGrid: document.getElementById('productGrid'),
  detailModal: document.getElementById('detailModal'),
  detailImageWrap: document.getElementById('detailImageWrap'),
  detailImage: document.getElementById('detailImage'),
  detailBadge: document.getElementById('detailBadge'),
  detailTitle: document.getElementById('detailTitle'),
  detailPrice: document.getElementById('detailPrice'),
  detailDescription: document.getElementById('detailDescription'),
  detailDirectOrder: document.getElementById('detailDirectOrder'),
  detailOrder: document.getElementById('detailOrder'),
  cartWidget: document.getElementById('cartWidget'),
  cartFloat: document.getElementById('cartFloat'),
  cartPanel: document.getElementById('cartPanel'),
  cartClose: document.getElementById('cartClose'),
  cartItems: document.getElementById('cartItems'),
  cartEmpty: document.getElementById('cartEmpty'),
  cartCount: document.getElementById('cartCount'),
  cartMiniTotal: document.getElementById('cartMiniTotal'),
  cartTotal: document.getElementById('cartTotal'),
  cartPanelSubtitle: document.getElementById('cartPanelSubtitle'),
  cartClear: document.getElementById('cartClear'),
  cartCheckout: document.getElementById('cartCheckout')
};


function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map((item) => ({
        id: String(item.id),
        name: String(item.name || 'Produk'),
        price: Number(item.price || 0),
        priceFormatted: item.priceFormatted || formatPrice(item.price || 0),
        imageUrl: item.imageUrl || '',
        qty: Math.max(1, Math.min(99, Number(item.qty) || 1))
      })).filter((item) => item.id)
      : [];
  } catch {
    return [];
  }
}

function saveCart() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart)); } catch { /* ignore private mode errors */ }
}

function cartTotals() {
  return state.cart.reduce((total, item) => {
    total.qty += Number(item.qty || 0);
    total.amount += Number(item.price || 0) * Number(item.qty || 0);
    return total;
  }, { qty: 0, amount: 0 });
}

function snapshotProduct(product) {
  return {
    id: String(product.id),
    name: product.name,
    price: Number(product.price || 0),
    priceFormatted: product.priceFormatted || formatPrice(product.price),
    imageUrl: product.imageUrl || '',
    qty: 1
  };
}

function syncCartWithProducts() {
  if (!state.products.length || !state.cart.length) return;
  const byId = new Map(state.products.map((product) => [String(product.id), product]));
  state.cart = state.cart.map((item) => {
    const product = byId.get(String(item.id));
    return product ? { ...snapshotProduct(product), qty: item.qty } : null;
  }).filter(Boolean);
  saveCart();
}

function setCartOpen(open) {
  els.cartPanel.classList.toggle('hidden', !open);
  els.cartFloat.setAttribute('aria-expanded', String(open));
  els.cartWidget.classList.toggle('is-open', open);
}

function renderCart() {
  const { qty, amount } = cartTotals();
  els.cartCount.textContent = String(qty);
  els.cartMiniTotal.textContent = formatPrice(amount);
  els.cartTotal.textContent = formatPrice(amount);
  els.cartPanelSubtitle.textContent = qty ? `${qty} item di keranjang` : 'Belanja beberapa produk sekaligus';
  els.cartEmpty.classList.toggle('hidden', state.cart.length > 0);
  els.cartItems.classList.toggle('hidden', state.cart.length === 0);
  els.cartClear.disabled = state.cart.length === 0;
  els.cartCheckout.disabled = state.cart.length === 0 || !/^\d{8,15}$/.test(String(state.store?.whatsappNumber || ''));
  els.cartCheckout.textContent = state.cart.length && !state.store?.whatsappNumber ? 'WhatsApp belum aktif' : 'Pesan sekarang';

  els.cartItems.innerHTML = state.cart.map((item) => `
    <article class="cart-item">
      <div class="cart-item-media">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />` : `<span>${escapeHtml(productInitial(item.name))}</span>`}</div>
      <div class="cart-item-body">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.priceFormatted || formatPrice(item.price))}</small>
        <div class="cart-qty" aria-label="Jumlah ${escapeHtml(item.name)}">
          <button type="button" data-cart-dec="${escapeHtml(item.id)}">−</button>
          <span>${Number(item.qty || 1)}</span>
          <button type="button" data-cart-inc="${escapeHtml(item.id)}">+</button>
        </div>
      </div>
      <div class="cart-item-side">
        <strong>${escapeHtml(formatPrice(Number(item.price || 0) * Number(item.qty || 1)))}</strong>
        <button type="button" data-cart-remove="${escapeHtml(item.id)}" aria-label="Hapus ${escapeHtml(item.name)}">Hapus</button>
      </div>
    </article>`).join('');
}

function addToCart(productId, { open = false } = {}) {
  const product = state.products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const existing = state.cart.find((item) => String(item.id) === String(product.id));
  if (existing) existing.qty = Math.min(99, Number(existing.qty || 1) + 1);
  else state.cart.push(snapshotProduct(product));
  saveCart();
  renderCart();
  els.cartPanelSubtitle.textContent = `${product.name} ditambahkan ke keranjang`;
  els.cartFloat.classList.remove('cart-pulse');
  void els.cartFloat.offsetWidth;
  els.cartFloat.classList.add('cart-pulse');
  if (open) setCartOpen(true);
}

function updateCartQuantity(productId, nextQty) {
  const item = state.cart.find((entry) => String(entry.id) === String(productId));
  if (!item) return;
  item.qty = Math.max(1, Math.min(99, Number(nextQty) || 1));
  saveCart();
  renderCart();
}

function removeCartItem(productId) {
  state.cart = state.cart.filter((entry) => String(entry.id) !== String(productId));
  saveCart();
  renderCart();
}

function checkoutCart() {
  if (!state.cart.length) return;
  const whatsappNumber = String(state.store?.whatsappNumber || '');
  if (!/^\d{8,15}$/.test(whatsappNumber)) return;
  const { amount } = cartTotals();
  const lines = [
    'Halo, saya ingin memesan produk berikut:',
    '',
    ...state.cart.flatMap((item, index) => [
      `${index + 1}. ${item.name}`,
      `   Harga: ${item.priceFormatted || formatPrice(item.price)}`,
      `   Jumlah: ${item.qty}`,
      `   Subtotal: ${formatPrice(Number(item.price || 0) * Number(item.qty || 1))}`
    ]),
    '',
    `Total: ${formatPrice(amount)}`,
    '',
    'Mohon informasi ketersediaan dan cara pemesanannya. Terima kasih.'
  ];
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
}

function formatPrice(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function productInitial(name) {
  const clean = String(name || 'P').trim();
  return clean ? clean[0].toUpperCase() : 'P';
}

function productCategory(product) {
  return state.categories.find((category) => Number(category.id) === Number(product.categoryId));
}

function filteredProducts() {
  const query = state.query.trim().toLowerCase();
  let items = [...state.products];
  if (state.categoryId !== 'all') {
    items = items.filter((product) => String(product.categoryId || '') === String(state.categoryId));
  }
  if (state.popularOnly) items = items.filter((product) => product.isPopular);
  if (query) {
    items = items.filter((product) => {
      const haystack = `${product.name} ${product.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if (state.sort === 'price-low') items.sort((a, b) => Number(a.price) - Number(b.price));
  if (state.sort === 'price-high') items.sort((a, b) => Number(b.price) - Number(a.price));
  if (state.sort === 'name') items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  return items;
}

function setLoading(isLoading) {
  els.loadingState.classList.toggle('hidden', !isLoading);
  els.productGrid.classList.toggle('hidden', isLoading);
}

function renderStoreInfo() {
  const name = state.store?.name || 'Rich Store';
  document.title = `${name} — Katalog Web`;
  els.storeName.textContent = name;
  els.botUsername.textContent = state.store?.username ? `@${state.store.username}` : '';
  if (state.store?.logoUrl) {
    els.storeLogo.src = state.store.logoUrl;
    els.storeLogo.classList.remove('hidden');
    els.storeLogoFallback.classList.add('hidden');
  } else {
    els.storeLogo.removeAttribute('src');
    els.storeLogo.classList.add('hidden');
    els.storeLogoFallback.classList.remove('hidden');
  }
  els.totalProducts.textContent = state.products.length.toLocaleString('id-ID');
  els.totalCategories.textContent = state.categories.length.toLocaleString('id-ID');
  els.totalPopular.textContent = state.products.filter((product) => product.isPopular).length.toLocaleString('id-ID');
}

function renderCategories() {
  const allTotal = state.products.length;
  const chips = [
    `<button class="category-chip ${state.categoryId === 'all' && !state.popularOnly ? 'active' : ''}" type="button" data-category="all"><strong>Semua Produk</strong><span>${allTotal} item</span></button>`,
    `<button class="category-chip ${state.popularOnly ? 'active' : ''}" type="button" data-popular="1"><strong>Produk Populer</strong><span>${state.products.filter((p) => p.isPopular).length} item</span></button>`
  ];
  state.categories.forEach((category) => {
    chips.push(`<button class="category-chip ${String(state.categoryId) === String(category.id) && !state.popularOnly ? 'active' : ''}" type="button" data-category="${category.id}"><strong>${escapeHtml(category.name)}</strong><span>${category.total || 0} item</span></button>`);
  });
  els.categoryChips.innerHTML = chips.join('');
  els.categoryChips.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.categoryId = button.dataset.category;
      state.popularOnly = false;
      els.popularOnly.checked = false;
      els.categorySelect.value = state.categoryId;
      renderAll();
      scrollToProducts();
    });
  });
  const popularButton = els.categoryChips.querySelector('[data-popular]');
  if (popularButton) popularButton.addEventListener('click', () => {
    state.popularOnly = true;
    els.popularOnly.checked = true;
    renderAll();
    scrollToProducts();
  });

  els.categorySelect.innerHTML = '<option value="all">Semua kategori</option>' + state.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
  els.categorySelect.value = state.categoryId;
}

function renderProducts() {
  const items = filteredProducts();
  els.resultCount.textContent = `${items.length.toLocaleString('id-ID')} produk`;
  const activeCategory = state.categoryId === 'all' ? null : state.categories.find((category) => String(category.id) === String(state.categoryId));
  if (state.query) {
    els.activeFilterLabel.textContent = 'Hasil pencarian';
    els.productsTitle.textContent = `Pencarian: ${state.query}`;
  } else if (state.popularOnly) {
    els.activeFilterLabel.textContent = 'Produk populer';
    els.productsTitle.textContent = 'Produk yang paling sering dilihat';
  } else if (activeCategory) {
    els.activeFilterLabel.textContent = 'Kategori';
    els.productsTitle.textContent = activeCategory.name;
  } else {
    els.activeFilterLabel.textContent = 'Semua produk';
    els.productsTitle.textContent = 'Produk terbaru untuk kamu';
  }

  els.emptyState.classList.toggle('hidden', items.length > 0);
  els.productGrid.innerHTML = items.map((product) => productCard(product)).join('');
  els.productGrid.querySelectorAll('[data-detail]').forEach((button) => {
    button.addEventListener('click', () => openDetail(button.dataset.detail));
  });
  els.productGrid.querySelectorAll('[data-cart]').forEach((button) => {
    button.addEventListener('click', () => addToCart(button.dataset.cart));
  });
}

function productCard(product) {
  const image = product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
    : `<div class="image-fallback">${escapeHtml(productInitial(product.name))}</div>`;
  const popular = product.isPopular ? '<span class="product-badge">Populer</span>' : '';
  const order = state.store?.whatsappNumber
    ? `<button class="card-order" type="button" data-cart="${product.id}" title="Tambah ke keranjang"><svg class="eco-icon"><use href="#ico-cart"></use></svg> Pesan</button>`
    : '<span class="card-order disabled" title="Nomor WhatsApp belum tersedia"><svg class="eco-icon"><use href="#ico-cart"></use></svg> Pesan</span>';
  return `
    <article class="product-card">
      <div class="product-media">${image}${popular}</div>
      <div class="product-body">
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <strong class="product-price">${escapeHtml(product.priceFormatted || formatPrice(product.price))}</strong>
        <p class="product-desc">${escapeHtml(product.description || 'Detail produk tersedia di halaman detail.')}</p>
        <div class="product-actions">
          <button class="detail-button" type="button" data-detail="${product.id}">Lihat detail</button>
          ${order}
        </div>
      </div>
    </article>`;
}

function openDetail(productId) {
  const product = state.products.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const category = productCategory(product);
  els.detailBadge.textContent = category?.name || (product.isPopular ? 'Produk populer' : 'Produk');
  els.detailTitle.textContent = product.name;
  els.detailPrice.textContent = product.priceFormatted || formatPrice(product.price);
  els.detailDescription.textContent = product.description || 'Belum ada deskripsi untuk produk ini.';
  if (product.imageUrl) {
    els.detailImageWrap.classList.remove('hidden');
    els.detailImage.src = product.imageUrl;
    els.detailImage.alt = product.name;
  } else {
    els.detailImageWrap.classList.add('hidden');
    els.detailImage.removeAttribute('src');
  }
  if (product.orderUrl) {
    els.detailDirectOrder.classList.remove('hidden');
    els.detailDirectOrder.href = product.orderUrl;
  } else {
    els.detailDirectOrder.classList.add('hidden');
    els.detailDirectOrder.removeAttribute('href');
  }
  if (state.store?.whatsappNumber) {
    els.detailOrder.classList.remove('hidden');
    els.detailOrder.disabled = false;
    els.detailOrder.dataset.cart = String(product.id);
  } else {
    els.detailOrder.classList.add('hidden');
    els.detailOrder.disabled = true;
    delete els.detailOrder.dataset.cart;
  }
  els.detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  els.detailModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderAll() {
  renderStoreInfo();
  renderCategories();
  renderProducts();
}

function scrollToProducts() {
  document.querySelector('.products-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadStore() {
  setLoading(true);
  try {
    const response = await fetch('/api/store', { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.message || 'Katalog belum dapat dimuat.');
    state.store = data.store;
    state.products = Array.isArray(data.products) ? data.products : [];
    state.categories = Array.isArray(data.categories) ? data.categories.filter((category) => Number(category.total || 0) > 0) : [];
    syncCartWithProducts();
    renderAll();
    renderCart();
  } catch (error) {
    els.productGrid.innerHTML = '';
    els.emptyState.classList.remove('hidden');
    els.emptyState.querySelector('strong').textContent = 'Katalog belum tersedia';
    els.emptyState.querySelector('p').textContent = error.message || 'Coba muat ulang halaman beberapa saat lagi.';
  } finally {
    setLoading(false);
  }
}

els.searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.query = els.searchInput.value.trim();
  renderAll();
  scrollToProducts();
});
els.searchInput.addEventListener('input', () => {
  state.query = els.searchInput.value.trim();
  renderAll();
});
els.sortSelect.addEventListener('change', () => {
  state.sort = els.sortSelect.value;
  renderProducts();
});
els.categorySelect.addEventListener('change', () => {
  state.categoryId = els.categorySelect.value;
  state.popularOnly = false;
  els.popularOnly.checked = false;
  renderAll();
});
els.popularOnly.addEventListener('change', () => {
  state.popularOnly = els.popularOnly.checked;
  renderAll();
});
els.resetFilter.addEventListener('click', () => {
  state.query = '';
  state.categoryId = 'all';
  state.popularOnly = false;
  state.sort = 'default';
  els.searchInput.value = '';
  els.sortSelect.value = 'default';
  els.popularOnly.checked = false;
  renderAll();
});
els.openPopular.addEventListener('click', () => {
  state.popularOnly = true;
  els.popularOnly.checked = true;
  renderAll();
  scrollToProducts();
});
els.heroShopButton.addEventListener('click', scrollToProducts);
els.heroCategoryButton.addEventListener('click', () => els.categorySection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
document.querySelectorAll('[data-close-detail]').forEach((el) => el.addEventListener('click', closeDetail));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetail(); });
els.storeLogo.addEventListener('error', () => {
  els.storeLogo.removeAttribute('src');
  els.storeLogo.classList.add('hidden');
  els.storeLogoFallback.classList.remove('hidden');
});

document.querySelectorAll('[data-mobile-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.mobileAction;
    if (action === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (action === 'category') els.categorySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (action === 'popular') {
      state.popularOnly = true;
      els.popularOnly.checked = true;
      renderAll();
      scrollToProducts();
    }
    if (action === 'search') els.searchInput.focus();
  });
});


els.cartFloat.addEventListener('click', () => setCartOpen(els.cartPanel.classList.contains('hidden')));
els.cartClose.addEventListener('click', () => setCartOpen(false));
els.cartClear.addEventListener('click', () => {
  if (!state.cart.length) return;
  if (!window.confirm('Kosongkan semua produk dari keranjang?')) return;
  state.cart = [];
  saveCart();
  renderCart();
});
els.cartCheckout.addEventListener('click', checkoutCart);
els.cartItems.addEventListener('click', (event) => {
  const inc = event.target.closest('[data-cart-inc]');
  const dec = event.target.closest('[data-cart-dec]');
  const remove = event.target.closest('[data-cart-remove]');
  if (inc) {
    const item = state.cart.find((entry) => String(entry.id) === String(inc.dataset.cartInc));
    if (item) updateCartQuantity(item.id, Number(item.qty || 1) + 1);
    return;
  }
  if (dec) {
    const item = state.cart.find((entry) => String(entry.id) === String(dec.dataset.cartDec));
    if (item) updateCartQuantity(item.id, Number(item.qty || 1) - 1);
    return;
  }
  if (remove) removeCartItem(remove.dataset.cartRemove);
});
els.detailOrder.addEventListener('click', () => {
  const productId = els.detailOrder.dataset.cart;
  if (!productId) return;
  addToCart(productId);
  closeDetail();
});

state.cart = loadCart();
renderCart();

loadStore();
