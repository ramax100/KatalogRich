const state = {
  store: null,
  products: [],
  categories: [],
  query: '',
  categoryId: 'all',
  popularOnly: false,
  sort: 'default'
};

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
  detailOrder: document.getElementById('detailOrder')
};

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
  const name = state.store?.name || 'Katalog Store';
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
}

function productCard(product) {
  const image = product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
    : `<div class="image-fallback">${escapeHtml(productInitial(product.name))}</div>`;
  const popular = product.isPopular ? '<span class="product-badge">Populer</span>' : '';
  const order = product.orderUrl
    ? `<a class="card-order" href="${escapeHtml(product.orderUrl)}" target="_blank" rel="noreferrer" title="Pesan via WhatsApp">🛒 Pesan</a>`
    : '<span class="card-order disabled" title="Nomor WhatsApp belum tersedia">🛒 Pesan</span>';
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
    els.detailOrder.classList.remove('hidden');
    els.detailOrder.href = product.orderUrl;
  } else {
    els.detailOrder.classList.add('hidden');
    els.detailOrder.removeAttribute('href');
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
    renderAll();
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

loadStore();
