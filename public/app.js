(() => {
  const form = document.querySelector('#tokenForm');
  const input = document.querySelector('#botToken');
  const error = document.querySelector('#tokenError');
  const submit = document.querySelector('#submitButton');
  const toggle = document.querySelector('#toggleToken');
  const banner = document.querySelector('#connectionBanner');
  const botName = document.querySelector('#connectedBotName');
  const botMeta = document.querySelector('#connectedBotMeta');
  const disconnect = document.querySelector('#disconnectButton');
  const nextLock = document.querySelector('.locked');
  const nextSection = document.querySelector('.next-section');
  const ctaText = document.querySelector('.button-text');
  const runDiagnosticsButton = document.querySelector('#runDiagnosticsButton');
  const diagnosticState = document.querySelector('#diagnosticState');
  const diagnosticResults = document.querySelector('#diagnosticResults');
  const broadcastForm = document.querySelector('#broadcastForm');
  const broadcastText = document.querySelector('#broadcastText');
  const broadcastCharCount = document.querySelector('#broadcastCharCount');
  const broadcastAudienceBadge = document.querySelector('#broadcastAudienceBadge');
  const broadcastState = document.querySelector('#broadcastState');
  const broadcastError = document.querySelector('#broadcastError');
  const sendBroadcastButton = document.querySelector('#sendBroadcastButton');

  const welcomeForm = document.querySelector('#welcomeForm');
  const welcomeText = document.querySelector('#welcomeText');
  const welcomeError = document.querySelector('#welcomeError');
  const welcomeCharCount = document.querySelector('#welcomeCharCount');
  const saveWelcomeButton = document.querySelector('#saveWelcomeButton');
  const saveButtonText = document.querySelector('.save-button-text');
  const welcomeSaveState = document.querySelector('#welcomeSaveState');
  const welcomeConnectionState = document.querySelector('#welcomeConnectionState');
  const welcomePreviewText = document.querySelector('#welcomePreviewText');
  const previewBotName = document.querySelector('#previewBotName');
  const variableButtons = [...document.querySelectorAll('.variable-chip')];

  const productForm = document.querySelector('#productForm');
  const productFormTitle = document.querySelector('#productFormTitle');
  const productFormHint = document.querySelector('#productFormHint');
  const productFormIcon = document.querySelector('#productFormIcon');
  const cancelProductEdit = document.querySelector('#cancelProductEdit');
  const productName = document.querySelector('#productName');
  const productCategory = document.querySelector('#productCategory');
  const productPrice = document.querySelector('#productPrice');
  const productDescription = document.querySelector('#productDescription');
  const productImage = document.querySelector('#productImage');
  const productImagePicker = document.querySelector('#productImagePicker');
  const productImageLabel = document.querySelector('#productImageLabel');
  const productImagePreview = document.querySelector('#productImagePreview');
  const productImagePreviewImg = document.querySelector('#productImagePreviewImg');
  const clearProductImageButton = document.querySelector('#clearProductImage');
  const productError = document.querySelector('#productError');
  const saveProductButton = document.querySelector('#saveProductButton');
  const productButtonText = document.querySelector('.product-button-text');
  const catalogConnectionState = document.querySelector('#catalogConnectionState');
  const productListCaption = document.querySelector('#productListCaption');
  const productCount = document.querySelector('#productCount');
  const productEmptyState = document.querySelector('#productEmptyState');
  const productList = document.querySelector('#productList');

  const categoryForm = document.querySelector('#categoryForm');
  const categoryName = document.querySelector('#categoryName');
  const saveCategoryButton = document.querySelector('#saveCategoryButton');
  const categoryButtonText = document.querySelector('.category-button-text');
  const categoryState = document.querySelector('#categoryState');
  const categoryList = document.querySelector('#categoryList');

  const whatsappForm = document.querySelector('#whatsappForm');
  const whatsappNumber = document.querySelector('#whatsappNumber');
  const saveWhatsappButton = document.querySelector('#saveWhatsappButton');
  const whatsappButtonText = document.querySelector('.whatsapp-button-text');
  const whatsappState = document.querySelector('#whatsappState');

  const panelControls = [...document.querySelectorAll('[data-panel-target]')];
  const breadcrumbCurrent = document.querySelector('#breadcrumbCurrent');
  const content = document.querySelector('.content');
  const menuSections = [...document.querySelectorAll('[data-menu-section]')];
  const formatPattern = /^\d{5,15}:[A-Za-z0-9_-]{20,}$/;
  let isWelcomeEnabled = false;
  let isCatalogEnabled = false;
  let isCategoryEnabled = false;
  let isWhatsAppEnabled = false;
  let productImageData = '';
  let categories = [];
  let editingProduct = null;
  let displayedProducts = [];
  let broadcastAudience = 0;

  function showError(message) {
    error.textContent = message;
    error.classList.remove('hidden');
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    error.textContent = '';
    error.classList.add('hidden');
    input.classList.remove('invalid');
    input.removeAttribute('aria-invalid');
  }

  function setLoading(loading) {
    submit.disabled = loading;
    submit.classList.toggle('loading', loading);
    ctaText.textContent = loading ? 'Memverifikasi token…' : (banner.classList.contains('hidden') ? 'Verifikasi & hubungkan' : 'Simpan / perbarui token');
  }

  function setDiagnosticEnabled(enabled) {
    runDiagnosticsButton.disabled = !enabled;
    if (!enabled) {
      diagnosticState.textContent = 'Hubungkan bot untuk menjalankan diagnostik.';
      diagnosticResults.replaceChildren();
      diagnosticResults.classList.add('hidden');
    } else {
      diagnosticState.textContent = 'Siap memeriksa dan memperbaiki koneksi bot.';
    }
  }

  function setDiagnosticLoading(loading) {
    runDiagnosticsButton.disabled = loading;
    runDiagnosticsButton.classList.toggle('loading', loading);
  }

  function renderDiagnosticResults(checks) {
    diagnosticResults.replaceChildren();
    checks.forEach((check) => {
      const row = document.createElement('div');
      row.className = 'diagnostic-result';
      const status = document.createElement('span');
      status.className = `diagnostic-status ${check.status}`;
      status.textContent = check.status === 'healthy' ? '✓' : check.status === 'repaired' ? '↻' : check.status === 'warning' ? '!' : '×';
      const details = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = check.label;
      const detail = document.createElement('p');
      detail.textContent = check.detail;
      details.append(label, detail);
      row.append(status, details);
      diagnosticResults.append(row);
    });
    diagnosticResults.classList.toggle('hidden', !checks.length);
  }

  function setBroadcastEnabled(enabled, audience = 0, reason = '') {
    broadcastAudience = enabled ? audience : 0;
    broadcastText.disabled = !enabled;
    sendBroadcastButton.disabled = !enabled || !audience;
    broadcastAudienceBadge.classList.toggle('ready', enabled);
    broadcastAudienceBadge.innerHTML = `<span></span> ${enabled
      ? `Bot siap · ${audience} customer`
      : (reason === 'error' ? 'Daftar customer belum dapat dimuat' : 'Hubungkan bot untuk memuat customer')}`;
    if (!enabled) {
      broadcastText.value = '';
      broadcastCharCount.textContent = '0 / 4.096';
      broadcastState.textContent = reason === 'error'
        ? 'Daftar customer belum dapat dimuat. Muat ulang panel atau hubungkan ulang bot Anda.'
        : 'Hubungkan bot terlebih dahulu untuk mengirim pesan ke customer.';
      broadcastError.classList.add('hidden');
    } else if (!audience) {
      broadcastState.textContent = 'Belum ada customer tercatat. Customer otomatis masuk daftar setelah mengirim pesan apa pun ke bot Anda.';
    } else {
      broadcastState.textContent = `Pesan akan dikirim ke ${audience} customer.`;
    }
  }

  function setBroadcastLoading(loading) {
    sendBroadcastButton.disabled = loading || !broadcastAudience;
    sendBroadcastButton.classList.toggle('loading', loading);
  }

  function showBroadcastError(message) {
    broadcastError.textContent = message;
    broadcastError.classList.remove('hidden');
  }

  async function loadBroadcastAudience() {
    try {
      const { response, data } = await request('/api/broadcast', { method: 'GET' });
      if (!response.ok || !data.ok) {
        const unauthenticated = response.status === 401 || response.status === 403;
        setBroadcastEnabled(false, 0, unauthenticated ? 'disconnected' : 'error');
        return;
      }
      setBroadcastEnabled(true, data.audience || 0);
    } catch {
      setBroadcastEnabled(false, 0, 'error');
    }
  }

  function updateWelcomePreview() {
    const sample = welcomeText.value
      .replaceAll('{first_name}', 'Nadia')
      .replaceAll('{last_name}', 'Putri')
      .replaceAll('{full_name}', 'Nadia Putri')
      .replaceAll('{username}', '@nadiaputri')
      .replaceAll('{chat_id}', '123456789');
    welcomePreviewText.textContent = sample || 'Tulis pesan welcome Anda di sini.';
    welcomeCharCount.textContent = `${welcomeText.value.length.toLocaleString('id-ID')} / 4.096`;
  }

  function setWelcomeState(enabled, message = '') {
    isWelcomeEnabled = enabled;
    welcomeText.disabled = !enabled;
    saveWelcomeButton.disabled = !enabled;
    variableButtons.forEach((button) => { button.disabled = !enabled; });
    welcomeConnectionState.classList.toggle('ready', enabled);
    welcomeConnectionState.innerHTML = `<span></span> ${enabled ? 'Webhook welcome aktif' : 'Hubungkan bot untuk mengaktifkan'}`;
    welcomeSaveState.textContent = message || (enabled ? 'Perubahan tersimpan langsung di server.' : 'Sambungkan bot untuk mengedit pesan.');
    welcomeSaveState.classList.remove('success');
    if (!enabled) {
      welcomeText.value = '';
      welcomePreviewText.textContent = 'Hubungkan bot Anda untuk melihat pratinjau pesan.';
      welcomeCharCount.textContent = '0 / 4.096';
    }
  }

  function showWelcomeError(message) {
    welcomeError.textContent = message;
    welcomeError.classList.remove('hidden');
  }

  function clearWelcomeError() {
    welcomeError.textContent = '';
    welcomeError.classList.add('hidden');
  }

  function setWelcomeSaving(saving) {
    saveWelcomeButton.disabled = saving || !isWelcomeEnabled;
    saveWelcomeButton.classList.toggle('loading', saving);
    saveButtonText.textContent = saving ? 'Menyimpan…' : 'Simpan perubahan';
  }

  function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(Number(value));
  }

  function clearProductError() {
    productError.textContent = '';
    productError.classList.add('hidden');
    productError.classList.remove('success');
  }

  function showProductError(message, success = false) {
    productError.textContent = message;
    productError.classList.remove('hidden');
    productError.classList.toggle('success', success);
  }

  function clearProductImage() {
    productImageData = '';
    productImage.value = '';
    if (editingProduct?.imageUrl) {
      productImagePreviewImg.src = editingProduct.imageUrl;
      productImagePreview.classList.remove('hidden');
      productImageLabel.textContent = 'Foto saat ini — pilih untuk mengganti';
      return;
    }
    productImagePreviewImg.removeAttribute('src');
    productImagePreview.classList.add('hidden');
    productImageLabel.textContent = 'Pilih foto produk';
  }

  function resetProductEditor() {
    editingProduct = null;
    productForm.reset();
    clearProductImage();
    productFormTitle.textContent = 'Tambah produk';
    productFormHint.textContent = 'Nama, harga, dan deskripsi akan tampil di bot.';
    productFormIcon.textContent = '+';
    cancelProductEdit.classList.add('hidden');
    productButtonText.textContent = 'Tambah ke katalog';
  }

  function startProductEdit(product) {
    editingProduct = product;
    productName.value = product.name;
    productCategory.value = product.categoryId ? String(product.categoryId) : '';
    productPrice.value = String(product.price);
    productDescription.value = product.description || '';
    clearProductImage();
    productFormTitle.textContent = 'Edit produk';
    productFormHint.textContent = 'Perbarui informasi produk, lalu simpan perubahan.';
    productFormIcon.textContent = '✎';
    productButtonText.textContent = 'Simpan perubahan';
    cancelProductEdit.classList.remove('hidden');
    clearProductError();
    productForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderCategoryOptions() {
    const selected = productCategory.value;
    productCategory.replaceChildren();
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Tanpa kategori';
    productCategory.append(blank);
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = String(category.id);
      option.textContent = category.name;
      productCategory.append(option);
    });
    productCategory.value = categories.some((category) => String(category.id) === selected) ? selected : '';
  }

  function renderCategories() {
    categoryList.replaceChildren();
    categories.forEach((category) => {
      const chip = document.createElement('span');
      chip.className = 'category-chip';
      chip.textContent = category.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.categoryId = String(category.id);
      remove.setAttribute('aria-label', `Hapus kategori ${category.name}`);
      remove.textContent = '×';
      chip.append(remove);
      categoryList.append(chip);
    });
    renderCategoryOptions();
  }

  function setCategoryState(enabled, message = '') {
    isCategoryEnabled = enabled;
    categoryName.disabled = !enabled;
    saveCategoryButton.disabled = !enabled;
    categoryState.textContent = message || (enabled ? 'Kategori membantu customer menyaring produk di Telegram.' : 'Hubungkan bot untuk mengelola kategori.');
    if (!enabled) {
      categories = [];
      categoryList.replaceChildren();
      renderCategoryOptions();
    }
  }

  function setCategorySaving(saving) {
    saveCategoryButton.disabled = saving || !isCategoryEnabled;
    saveCategoryButton.classList.toggle('loading', saving);
    categoryButtonText.textContent = saving ? 'Menyimpan…' : 'Tambah';
  }

  function setWhatsAppState(enabled, message = '', number = '') {
    isWhatsAppEnabled = enabled;
    whatsappNumber.disabled = !enabled;
    saveWhatsappButton.disabled = !enabled;
    whatsappNumber.value = number;
    whatsappState.textContent = message || (enabled
      ? (number ? 'Nomor WhatsApp aktif. Tombol Pesan sekarang akan membuka chat dengan detail pesanan.' : 'Masukkan nomor WhatsApp untuk mengaktifkan tombol Pesan sekarang.')
      : 'Hubungkan bot untuk mengatur nomor WhatsApp.');
    whatsappState.classList.remove('success');
  }

  function setWhatsAppSaving(saving) {
    saveWhatsappButton.disabled = saving || !isWhatsAppEnabled;
    saveWhatsappButton.classList.toggle('loading', saving);
    whatsappButtonText.textContent = saving ? 'Menyimpan…' : 'Simpan nomor';
  }

  function setCatalogState(enabled, message = '') {
    isCatalogEnabled = enabled;
    [productName, productCategory, productPrice, productDescription, productImage].forEach((field) => { field.disabled = !enabled; });
    productImagePicker.classList.toggle('disabled', !enabled);
    saveProductButton.disabled = !enabled;
    catalogConnectionState.classList.toggle('ready', enabled);
    catalogConnectionState.innerHTML = `<span></span> ${enabled ? 'Katalog siap ditampilkan' : 'Hubungkan bot untuk mengaktifkan'}`;

    if (!enabled) {
      setWhatsAppState(false);
      setCategoryState(false);
      resetProductEditor();
      productList.replaceChildren();
      productCount.textContent = '0';
      productListCaption.textContent = message || 'Hubungkan bot untuk melihat katalog.';
      productEmptyState.classList.remove('hidden');
      clearProductError();
    }
  }

  function setProductSaving(saving) {
    saveProductButton.disabled = saving || !isCatalogEnabled;
    saveProductButton.classList.toggle('loading', saving);
    productButtonText.textContent = saving ? 'Menyimpan…' : (editingProduct ? 'Simpan perubahan' : 'Tambah ke katalog');
  }

  function makeDeleteIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M4.5 6h11M8 3.8h4M7 8.2v5.1m3-5.1v5.1M5.8 6l.7 10h7l.7-10" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg;
  }

  function makeEditIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="m4 14.8 1.1-3.4L13.5 3a1.5 1.5 0 0 1 2.1 2.1l-8.4 8.4L4 14.8ZM11.9 4.6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg;
  }

  function makePopularIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="m10 2.8 2.1 4.3 4.8.7-3.5 3.4.8 4.8-4.2-2.2-4.2 2.2.8-4.8-3.5-3.4 4.8-.7L10 2.8Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/>';
    return svg;
  }

  function renderProducts(products) {
    displayedProducts = products;
    productList.replaceChildren();
    productCount.textContent = String(products.length);
    productListCaption.textContent = products.length
      ? `${products.length} produk akan tampil saat customer membuka katalog.`
      : 'Belum ada produk untuk ditampilkan di Telegram.';
    productEmptyState.classList.toggle('hidden', products.length > 0);

    products.forEach((product) => {
      const row = document.createElement('article');
      row.className = 'product-row';

      const icon = document.createElement('span');
      icon.className = product.imageUrl ? 'product-row-photo' : 'product-row-icon';
      if (product.imageUrl) {
        const image = document.createElement('img');
        image.src = product.imageUrl;
        image.alt = `Foto ${product.name}`;
        image.loading = 'lazy';
        icon.append(image);
      } else {
        icon.textContent = '🛍';
      }

      const body = document.createElement('div');
      body.className = 'product-row-body';
      const title = document.createElement('div');
      title.className = 'product-row-title';
      const order = document.createElement('span');
      order.className = 'product-order';
      order.textContent = `#${product.sortOrder}`;
      const name = document.createElement('strong');
      name.textContent = product.name;
      const price = document.createElement('span');
      price.textContent = formatRupiah(product.price);
      title.append(order, name, price);
      const description = document.createElement('p');
      description.textContent = product.description || 'Tanpa deskripsi produk.';
      body.append(title, description);
      const categoryAssign = document.createElement('select');
      categoryAssign.className = 'product-category-assign';
      categoryAssign.dataset.productId = String(product.id);
      categoryAssign.setAttribute('aria-label', `Kategori untuk ${product.name}`);
      const noCategory = document.createElement('option');
      noCategory.value = '';
      noCategory.textContent = 'Tanpa kategori';
      categoryAssign.append(noCategory);
      categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = String(category.id);
        option.textContent = category.name;
        categoryAssign.append(option);
      });
      categoryAssign.value = product.categoryId ? String(product.categoryId) : '';
      body.append(categoryAssign);

      const moveUp = document.createElement('button');
      moveUp.type = 'button';
      moveUp.className = 'product-move-up';
      moveUp.dataset.productId = String(product.id);
      moveUp.dataset.sortOrder = String(product.sortOrder);
      moveUp.setAttribute('aria-label', `Naikkan ${product.name} satu posisi`);
      moveUp.setAttribute('title', 'Naikkan satu posisi');
      moveUp.textContent = '↑';

      const popular = document.createElement('button');
      popular.type = 'button';
      popular.className = `product-popular${product.isPopular ? ' selected' : ''}`;
      popular.dataset.productId = String(product.id);
      popular.setAttribute('aria-pressed', String(Boolean(product.isPopular)));
      popular.setAttribute('aria-label', product.isPopular ? `Hapus ${product.name} dari produk populer` : `Jadikan ${product.name} produk populer`);
      popular.setAttribute('title', product.isPopular ? 'Produk populer aktif' : 'Jadikan produk populer');
      popular.append(makePopularIcon());

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'product-edit';
      edit.dataset.productId = String(product.id);
      edit.setAttribute('aria-label', `Edit ${product.name}`);
      edit.setAttribute('title', 'Edit produk');
      edit.append(makeEditIcon());

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'product-delete';
      remove.dataset.productId = String(product.id);
      remove.setAttribute('aria-label', `Hapus ${product.name}`);
      remove.setAttribute('title', 'Hapus produk');
      remove.append(makeDeleteIcon());

      const actions = document.createElement('div');
      actions.className = 'product-row-actions';
      actions.append(moveUp, popular, edit, remove);
      row.append(icon, body, actions);
      productList.append(row);
    });
  }

  function showConnected(bot) {
    const title = bot.username ? `@${bot.username} berhasil terhubung` : `${bot.firstName} berhasil terhubung`;
    const details = bot.username
      ? `${bot.firstName} · Webhook Telegram aktif dan siap menerima /start.`
      : 'Webhook Telegram aktif dan siap menerima /start.';

    botName.textContent = title;
    botMeta.textContent = details;
    previewBotName.textContent = bot.username ? `@${bot.username}` : bot.firstName;
    banner.classList.remove('hidden');
    ctaText.textContent = 'Simpan / perbarui token';
    nextLock.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg> Bot siap digunakan';
    nextLock.style.color = '#31926a';
    nextSection.style.borderStyle = 'solid';
    nextSection.style.borderColor = '#d8ebdf';
    setDiagnosticEnabled(true);
  }

  function showDisconnected() {
    banner.classList.add('hidden');
    ctaText.textContent = 'Verifikasi & hubungkan';
    nextLock.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 8.5V6.8a3 3 0 0 1 6 0v1.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Menunggu koneksi bot';
    nextLock.style.color = '';
    nextSection.style.borderStyle = '';
    nextSection.style.borderColor = '';
    setWelcomeState(false);
    setCatalogState(false);
    setBroadcastEnabled(false, 0, 'disconnected');
    setDiagnosticEnabled(true);
    diagnosticState.textContent = 'Diagnostik tetap dapat memeriksa bot terakhir meski sesi sudah berakhir.';
    clearWelcomeError();
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({ ok: false, message: 'Respons server tidak dapat dibaca.' }));
    return { response, data };
  }

  async function loadActiveBotData() {
    await loadWelcome();
    await loadCategories();
    await loadProducts();
    await loadWhatsApp();
    await loadBroadcastAudience();
  }

  async function loadWelcome() {
    clearWelcomeError();
    welcomeSaveState.textContent = 'Memuat konfigurasi welcome…';
    try {
      const { response, data } = await request('/api/welcome', { method: 'GET' });
      if (!response.ok || !data.ok) {
        setWelcomeState(false, data.message || 'Pesan welcome belum dapat dimuat.');
        showWelcomeError(data.message || 'Pesan welcome belum dapat dimuat.');
        return false;
      }

      const settings = data.settings;
      welcomeText.value = settings.welcomeText || '';
      previewBotName.textContent = settings.bot.username ? `@${settings.bot.username}` : settings.bot.firstName;
      updateWelcomePreview();
      setWelcomeState(true, 'Webhook aktif. Perubahan disimpan langsung di server.');
      return true;
    } catch {
      setWelcomeState(false, 'Tidak dapat menghubungi server.');
      showWelcomeError('Tidak dapat memuat konfigurasi welcome. Periksa koneksi lalu coba lagi.');
      return false;
    }
  }

  async function loadCategories() {
    try {
      const { response, data } = await request('/api/categories', { method: 'GET' });
      if (!response.ok || !data.ok) {
        setCategoryState(false, data.message || 'Kategori belum dapat dimuat.');
        return;
      }
      categories = data.categories || [];
      setCategoryState(true);
      renderCategories();
    } catch {
      setCategoryState(false, 'Kategori belum dapat dimuat.');
    }
  }

  async function loadProducts() {
    clearProductError();
    productListCaption.textContent = 'Memuat daftar produk…';
    try {
      const { response, data } = await request('/api/products', { method: 'GET' });
      if (!response.ok || !data.ok) {
        setCatalogState(false, data.message || 'Katalog belum dapat dimuat.');
        showProductError(data.message || 'Katalog belum dapat dimuat.');
        return;
      }
      setCatalogState(true);
      renderProducts(data.products || []);
    } catch {
      setCatalogState(false, 'Tidak dapat menghubungi server.');
      showProductError('Tidak dapat memuat daftar produk. Periksa koneksi lalu coba lagi.');
    }
  }

  async function loadWhatsApp() {
    try {
      const { response, data } = await request('/api/contact', { method: 'GET' });
      if (!response.ok || !data.ok) {
        setWhatsAppState(false, data.message || 'Nomor WhatsApp belum dapat dimuat.');
        return;
      }
      setWhatsAppState(true, '', data.whatsappNumber || '');
    } catch {
      setWhatsAppState(false, 'Nomor WhatsApp belum dapat dimuat.');
    }
  }

  const panelTitles = { connect: 'Hubungkan Bot', welcome: 'Pesan Welcome', broadcast: 'Kirim Pesan', catalog: 'Katalog Produk' };

  function switchPanel(panel, updateHash = true) {
    const target = Object.hasOwn(panelTitles, panel) ? panel : 'connect';
    content.dataset.activePanel = target;
    menuSections.forEach((section) => { section.hidden = section.dataset.menuSection !== target; });
    panelControls.forEach((control) => {
      const active = control.dataset.panelTarget === target;
      control.classList.toggle('active', active);
      if (control.matches('button')) control.setAttribute('aria-pressed', String(active));
    });
    breadcrumbCurrent.textContent = panelTitles[target];
    if (updateHash) window.history.replaceState(null, '', `#${target}`);
  }

  toggle.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggle.setAttribute('aria-label', isHidden ? 'Sembunyikan token' : 'Tampilkan token');
    toggle.setAttribute('title', isHidden ? 'Sembunyikan token' : 'Tampilkan token');
    input.focus();
  });

  input.addEventListener('input', clearError);
  runDiagnosticsButton.addEventListener('click', async () => {
    setDiagnosticLoading(true);
    diagnosticState.textContent = 'Memeriksa webhook dan data katalog…';
    try {
      const { response, data } = await request('/api/diagnostics', { method: 'POST', body: '{}' });
      if (!response.ok || !data.ok) {
        diagnosticState.textContent = data.message || 'Diagnostik belum dapat dijalankan.';
        return;
      }
      renderDiagnosticResults(data.checks || []);
      diagnosticState.textContent = data.repaired ? 'Perbaikan otomatis telah dijalankan.' : 'Tidak menemukan masalah yang perlu diperbaiki.';
    } catch {
      diagnosticState.textContent = 'Diagnostik belum dapat dijalankan. Coba lagi.';
    } finally {
      setDiagnosticLoading(false);
    }
  });
  broadcastText.addEventListener('input', () => {
    broadcastCharCount.textContent = `${broadcastText.value.length.toLocaleString('id-ID')} / 4.096`;
    broadcastError.classList.add('hidden');
  });
  broadcastForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = broadcastText.value.trim();
    if (!message) {
      showBroadcastError('Isi pesan terlebih dahulu.');
      broadcastText.focus();
      return;
    }
    if (!window.confirm('Kirim pesan ini ke semua customer yang terdaftar?')) return;

    let offset = 0;
    let totalDelivered = 0;
    let totalFailed = 0;
    let totalBlockedRemoved = 0;
    setBroadcastLoading(true);
    broadcastError.classList.add('hidden');
    try {
      while (offset !== null) {
        broadcastState.textContent = `Mengirim pesan... ${totalDelivered} customer berhasil dikirimi.`;
        const { response, data } = await request('/api/broadcast', {
          method: 'POST', body: JSON.stringify({ message, offset })
        });
        if (!response.ok || !data.ok) throw new Error(data.message || 'Pesan belum dapat dikirim.');
        totalDelivered += data.delivered || 0;
        totalFailed += data.failed || 0;
        totalBlockedRemoved += data.blockedRemoved || 0;
        offset = data.nextOffset;
      }
      const summary = `✓ Selesai. ${totalDelivered} pesan terkirim${totalFailed ? `, ${totalFailed} gagal` : ''}${totalBlockedRemoved ? ` · ${totalBlockedRemoved} customer tidak aktif dibersihkan dari daftar` : ''}.`;
      broadcastText.value = '';
      broadcastCharCount.textContent = '0 / 4.096';
      broadcastAudience = 1; // Jaga tombol aktif selama daftar dimuat ulang.
      await loadBroadcastAudience();
      // Tampilkan kembali ringkasan setelah daftar termuat ulang (daftar bisa
      // berkurang bila ada customer tidak aktif yang dibersihkan).
      broadcastState.textContent = broadcastAudience
        ? `${summary} Sisa customer aktif: ${broadcastAudience}.`
        : `${summary} Customer baru otomatis tercatat saat mengirim pesan ke bot.`;
    } catch (error) {
      showBroadcastError(error.message || 'Pesan belum dapat dikirim. Coba lagi.');
      broadcastState.textContent = 'Pengiriman dihentikan. Pesan yang sudah terkirim tidak akan dikirim ulang.';
    } finally {
      setBroadcastLoading(false);
    }
  });

  welcomeText.addEventListener('input', () => {
    clearWelcomeError();
    updateWelcomePreview();
    if (isWelcomeEnabled) {
      welcomeSaveState.textContent = 'Ada perubahan yang belum disimpan.';
      welcomeSaveState.classList.remove('success');
    }
  });
  [productName, productPrice, productDescription, productCategory].forEach((field) => field.addEventListener('input', clearProductError));
  productImage.addEventListener('change', () => {
    clearProductError();
    const file = productImage.files?.[0];
    if (!file) {
      clearProductImage();
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      clearProductImage();
      showProductError('Pilih foto berformat JPG, PNG, atau WEBP.');
      return;
    }
    if (file.size > 1_500_000) {
      clearProductImage();
      showProductError('Ukuran foto maksimal 1,5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      productImageData = typeof reader.result === 'string' ? reader.result : '';
      productImagePreviewImg.src = productImageData;
      productImagePreview.classList.remove('hidden');
      productImageLabel.textContent = file.name;
    });
    reader.addEventListener('error', () => {
      clearProductImage();
      showProductError('Foto belum dapat dibaca. Silakan pilih file lain.');
    });
    reader.readAsDataURL(file);
  });
  clearProductImageButton.addEventListener('click', () => {
    clearProductImage();
    clearProductError();
  });
  cancelProductEdit.addEventListener('click', () => {
    resetProductEditor();
    clearProductError();
  });
  whatsappNumber.addEventListener('input', () => {
    if (isWhatsAppEnabled) {
      whatsappState.textContent = 'Ada perubahan nomor yang belum disimpan.';
      whatsappState.classList.remove('success');
    }
  });

  variableButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const token = button.dataset.variable || '';
      welcomeText.setRangeText(token, welcomeText.selectionStart, welcomeText.selectionEnd, 'end');
      welcomeText.focus();
      welcomeText.dispatchEvent(new Event('input'));
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    const token = input.value.trim();
    if (!token) {
      showError('Masukkan token bot terlebih dahulu.');
      input.focus();
      return;
    }
    if (!formatPattern.test(token)) {
      showError('Format token belum sesuai. Pastikan Anda menyalin token lengkap dari @BotFather.');
      input.focus();
      return;
    }

    setLoading(true);
    try {
      const { response, data } = await request('/api/bot/connect', { method: 'POST', body: JSON.stringify({ token }) });
      if (!response.ok || !data.ok) {
        showError(data.message || 'Token belum dapat diverifikasi. Silakan coba lagi.');
        return;
      }
      input.value = '';
      input.type = 'password';
      toggle.setAttribute('aria-label', 'Tampilkan token');
      toggle.setAttribute('title', 'Tampilkan token');
      showConnected(data.bot);
      await loadActiveBotData();
    } catch {
      showError('Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba kembali.');
    } finally {
      setLoading(false);
    }
  });

  welcomeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearWelcomeError();
    const message = welcomeText.value.trim();
    if (!message) {
      showWelcomeError('Pesan welcome tidak boleh kosong.');
      welcomeText.focus();
      return;
    }

    setWelcomeSaving(true);
    try {
      const { response, data } = await request('/api/welcome', { method: 'POST', body: JSON.stringify({ welcomeText: message }) });
      if (!response.ok || !data.ok) {
        showWelcomeError(data.message || 'Pesan welcome belum dapat disimpan.');
        return;
      }
      welcomeText.value = data.settings.welcomeText;
      updateWelcomePreview();
      welcomeSaveState.textContent = '✓ Pesan welcome berhasil disimpan.';
      welcomeSaveState.classList.add('success');
    } catch {
      showWelcomeError('Tidak dapat menyimpan perubahan. Periksa koneksi lalu coba lagi.');
    } finally {
      setWelcomeSaving(false);
    }
  });

  categoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = categoryName.value.trim();
    if (name.length < 2) {
      categoryState.textContent = 'Masukkan nama kategori minimal 2 karakter.';
      categoryName.focus();
      return;
    }
    setCategorySaving(true);
    try {
      const { response, data } = await request('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
      if (!response.ok || !data.ok) {
        categoryState.textContent = data.message || 'Kategori belum dapat disimpan.';
        return;
      }
      categoryName.value = '';
      await loadCategories();
      await loadProducts();
      categoryState.textContent = '✓ Kategori berhasil ditambahkan.';
    } catch {
      categoryState.textContent = 'Kategori belum dapat disimpan. Coba lagi.';
    } finally {
      setCategorySaving(false);
    }
  });

  categoryList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-category-id]');
    if (!button || !isCategoryEnabled) return;
    const id = button.dataset.categoryId;
    if (!id || !window.confirm('Hapus kategori ini? Produk di dalamnya tidak akan dihapus.')) return;
    button.disabled = true;
    try {
      const { response, data } = await request(`/api/categories?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok || !data.ok) {
        categoryState.textContent = data.message || 'Kategori belum dapat dihapus.';
        button.disabled = false;
        return;
      }
      await loadCategories();
      await loadProducts();
      categoryState.textContent = 'Kategori berhasil dihapus.';
    } catch {
      categoryState.textContent = 'Kategori belum dapat dihapus. Coba lagi.';
      button.disabled = false;
    }
  });

  whatsappForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rawNumber = whatsappNumber.value.trim();
    if (!rawNumber) {
      whatsappState.textContent = 'Masukkan nomor WhatsApp terlebih dahulu.';
      whatsappNumber.focus();
      return;
    }
    setWhatsAppSaving(true);
    try {
      const { response, data } = await request('/api/contact', {
        method: 'POST', body: JSON.stringify({ whatsappNumber: rawNumber })
      });
      if (!response.ok || !data.ok) {
        whatsappState.textContent = data.message || 'Nomor WhatsApp belum dapat disimpan.';
        return;
      }
      whatsappNumber.value = data.whatsappNumber;
      whatsappState.textContent = '✓ Nomor WhatsApp tersimpan. Tombol Pesan sekarang sudah aktif.';
      whatsappState.classList.add('success');
    } catch {
      whatsappState.textContent = 'Nomor WhatsApp belum dapat disimpan. Coba lagi.';
    } finally {
      setWhatsAppSaving(false);
    }
  });

  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearProductError();
    const name = productName.value.trim();
    const categoryId = productCategory.value || null;
    const price = Number(productPrice.value);
    const description = productDescription.value.trim();
    if (name.length < 2) {
      showProductError('Masukkan nama produk minimal 2 karakter.');
      productName.focus();
      return;
    }
    if (!Number.isSafeInteger(price) || price < 0) {
      showProductError('Masukkan harga produk dalam angka Rupiah.');
      productPrice.focus();
      return;
    }

    const wasEditing = Boolean(editingProduct);
    setProductSaving(true);
    try {
      const payload = { name, categoryId, price, description, imageData: productImageData };
      if (wasEditing) payload.id = editingProduct.id;
      const { response, data } = await request('/api/products', {
        method: wasEditing ? 'PATCH' : 'POST', body: JSON.stringify(payload)
      });
      if (!response.ok || !data.ok) {
        showProductError(data.message || 'Produk belum dapat disimpan.');
        return;
      }
      resetProductEditor();
      await loadProducts();
      showProductError(wasEditing ? '✓ Produk berhasil diperbarui.' : '✓ Produk berhasil ditambahkan ke katalog.', true);
    } catch {
      showProductError('Tidak dapat menyimpan produk. Periksa koneksi lalu coba lagi.');
    } finally {
      setProductSaving(false);
    }
  });

  productList.addEventListener('click', async (event) => {
    const moveButton = event.target.closest('.product-move-up');
    if (moveButton && isCatalogEnabled) {
      const product = displayedProducts.find((item) => String(item.id) === moveButton.dataset.productId);
      if (!product || product.sortOrder === 1) return;
      moveButton.disabled = true;
      clearProductError();
      try {
        const { response, data } = await request('/api/products', {
          method: 'PATCH', body: JSON.stringify({ id: product.id, moveTo: product.sortOrder - 1 })
        });
        if (!response.ok || !data.ok) {
          showProductError(data.message || 'Urutan produk belum dapat diperbarui.');
          moveButton.disabled = false;
          return;
        }
        await loadProducts();
        showProductError('✓ Produk berhasil dinaikkan satu posisi.', true);
      } catch {
        showProductError('Urutan produk belum dapat diperbarui. Coba lagi.');
        moveButton.disabled = false;
      }
      return;
    }

    const popularButton = event.target.closest('.product-popular');
    if (popularButton && isCatalogEnabled) {
      const product = displayedProducts.find((item) => String(item.id) === popularButton.dataset.productId);
      if (!product) return;
      popularButton.disabled = true;
      clearProductError();
      try {
        const { response, data } = await request('/api/products', {
          method: 'PATCH', body: JSON.stringify({ id: product.id, isPopular: !product.isPopular })
        });
        if (!response.ok || !data.ok) {
          showProductError(data.message || 'Status produk populer belum dapat diperbarui.');
          popularButton.disabled = false;
          return;
        }
        await loadProducts();
        showProductError(product.isPopular ? 'Produk dihapus dari daftar populer.' : '✓ Produk ditambahkan ke daftar populer.', true);
      } catch {
        showProductError('Status produk populer belum dapat diperbarui. Coba lagi.');
        popularButton.disabled = false;
      }
      return;
    }

    const editButton = event.target.closest('.product-edit');
    if (editButton && isCatalogEnabled) {
      const product = displayedProducts.find((item) => String(item.id) === editButton.dataset.productId);
      if (product) startProductEdit(product);
      return;
    }

    const button = event.target.closest('.product-delete');
    if (!button || !isCatalogEnabled) return;
    const id = button.dataset.productId;
    if (!id || !window.confirm('Hapus produk ini dari katalog Telegram?')) return;
    clearProductError();
    button.disabled = true;
    try {
      const { response, data } = await request(`/api/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok || !data.ok) {
        showProductError(data.message || 'Produk belum dapat dihapus.');
        button.disabled = false;
        return;
      }
      await loadProducts();
    } catch {
      showProductError('Tidak dapat menghapus produk. Periksa koneksi lalu coba lagi.');
      button.disabled = false;
    }
  });

  productList.addEventListener('change', async (event) => {
    const select = event.target.closest('.product-category-assign');
    if (!select || !isCatalogEnabled) return;
    const id = select.dataset.productId;
    if (!id) return;
    select.disabled = true;
    clearProductError();
    try {
      const { response, data } = await request('/api/products', {
        method: 'PATCH',
        body: JSON.stringify({ id, categoryId: select.value || null })
      });
      if (!response.ok || !data.ok) {
        showProductError(data.message || 'Kategori produk belum dapat diperbarui.');
        select.disabled = false;
        return;
      }
      await loadProducts();
      showProductError('✓ Kategori produk berhasil diperbarui.', true);
    } catch {
      showProductError('Kategori produk belum dapat diperbarui. Coba lagi.');
      select.disabled = false;
    }
  });

  disconnect.addEventListener('click', async () => {
    disconnect.disabled = true;
    disconnect.textContent = 'Memutuskan…';
    try {
      await request('/api/bot/disconnect', { method: 'POST', body: '{}' });
      showDisconnected();
      clearError();
    } catch {
      showError('Sesi belum dapat diputus dari server. Coba lagi.');
    } finally {
      disconnect.disabled = false;
      disconnect.textContent = 'Putuskan';
    }
  });

  panelControls.forEach((control) => {
    control.addEventListener('click', (event) => {
      if (control.matches('a')) event.preventDefault();
      switchPanel(control.dataset.panelTarget);
    });
  });

  window.addEventListener('hashchange', () => switchPanel(window.location.hash.slice(1), false));
  switchPanel(window.location.hash.slice(1), false);

  (async () => {
    try {
      const { data } = await request('/api/session', { method: 'GET' });
      if (data.ok && data.connected && data.bot) {
        showConnected(data.bot);
        await loadActiveBotData();
      } else {
        setWelcomeState(false);
        setCatalogState(false);
        setBroadcastEnabled(false, 0, 'disconnected');
        setDiagnosticEnabled(true);
        diagnosticState.textContent = 'Diagnostik dapat memeriksa bot yang terakhir dikonfigurasi.';
      }
    } catch {
      setWelcomeState(false);
      setCatalogState(false);
      setBroadcastEnabled(false, 0, 'disconnected');
      setDiagnosticEnabled(true);
      diagnosticState.textContent = 'Diagnostik dapat memeriksa bot yang terakhir dikonfigurasi.';
    }
  })();
})();
