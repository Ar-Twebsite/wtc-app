/* ─────────────────────────────────────────────────────────────────
   WTC Foto — app.js
   All image processing runs client-side via the Canvas API.
   No server, no build step, no dependencies at runtime (JSZip is
   loaded via CDN and only used on desktop for batch download).
───────────────────────────────────────────────────────────────── */

// ── Overlay definitions ────────────────────────────────────────────
// anchorV: where the logo sits vertically ('top' or 'bottom')
// anchorH: where the logo sits horizontally ('left', 'center', or 'right')
// The compositing logic anchors the overlay to that corner/edge so the
// logo is always fully visible regardless of the photo's aspect ratio.
const OVERLAYS = [
  { key: 'linkedin',      label: 'LinkedIn',  src: 'assets/overlays/linkedin.png',      anchorV: 'bottom', anchorH: 'center', group: 'linkedin' },
  { key: 'ig-h-centro',   label: 'Centro',    src: 'assets/overlays/ig-h-centro.png',   anchorV: 'bottom', anchorH: 'center', group: 'ig-h' },
  { key: 'ig-h-destra',   label: 'Destra',    src: 'assets/overlays/ig-h-destra.png',   anchorV: 'bottom', anchorH: 'right',  group: 'ig-h' },
  { key: 'ig-h-sinistra', label: 'Sinistra',  src: 'assets/overlays/ig-h-sinistra.png', anchorV: 'bottom', anchorH: 'left',   group: 'ig-h' },
  { key: 'ig-h-alto',     label: 'Alto',      src: 'assets/overlays/ig-h-alto.png',     anchorV: 'top',    anchorH: 'center', group: 'ig-h' },
  { key: 'ig-v-centro',   label: 'Centro',    src: 'assets/overlays/ig-v-centro.png',   anchorV: 'bottom', anchorH: 'center', group: 'ig-v' },
  { key: 'ig-v-destra',   label: 'Destra',    src: 'assets/overlays/ig-v-destra.png',   anchorV: 'bottom', anchorH: 'right',  group: 'ig-v' },
  { key: 'ig-v-sinistra', label: 'Sinistra',  src: 'assets/overlays/ig-v-sinistra.png', anchorV: 'bottom', anchorH: 'left',   group: 'ig-v' },
  { key: 'ig-v-alto',     label: 'Alto',      src: 'assets/overlays/ig-v-alto.png',     anchorV: 'top',    anchorH: 'center', group: 'ig-v' },
];

// ── State ─────────────────────────────────────────────────────────
const state = {
  /** @type {HTMLImageElement|null} Pre-loaded overlay image */
  overlayImg: null,
  /** @type {string} Key of the currently selected overlay */
  overlayKey: localStorage.getItem('wtc-overlay') ?? 'linkedin',
  /** @type {Array<{originalName:string, blob:Blob, previewUrl:string}>} */
  results: [],
  /** @type {boolean} True on iOS — affects save labels and share flow */
  isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
  /** @type {boolean} True on any mobile — Web Share API used only on mobile */
  isMobile: /android|iphone|ipad|ipod/i.test(navigator.userAgent),
};

// Current lightbox index
let lightboxIndex = 0;

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  updateSaveLabels();
  // Validate saved key (in case it references an old/removed overlay)
  const cfg = OVERLAYS.find(o => o.key === state.overlayKey) ?? OVERLAYS[0];
  state.overlayKey = cfg.key;
  await preloadOverlay(cfg.src);
  renderOverlaySelector();
  updateHeroPreview(cfg);
  bindEvents();
  registerServiceWorker();
  checkInstallPrompt();
  checkUpdateBanner();
}

document.addEventListener('DOMContentLoaded', init);

// ── Overlay pre-load ──────────────────────────────────────────────
// Load the overlay PNG once so it's ready the moment the user taps
// "Save" (iOS requires share() to be in a direct gesture handler with
// no async gap after user action — having the image pre-loaded means
// compositeImage() completes synchronously enough to satisfy this).
function preloadOverlay(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => { state.overlayImg = img; resolve(); };
    img.onerror = () => reject(new Error('Could not load overlay: ' + src));
    img.src = src;
  });
}

// ── Overlay selection ─────────────────────────────────────────────
function getOverlayCfg() {
  return OVERLAYS.find(o => o.key === state.overlayKey) ?? OVERLAYS[0];
}

async function selectOverlay(key) {
  const cfg = OVERLAYS.find(o => o.key === key);
  if (!cfg || key === state.overlayKey) return;
  state.overlayKey = key;
  localStorage.setItem('wtc-overlay', key);
  await preloadOverlay(cfg.src);
  updateHeroPreview(cfg);
}

function updateHeroPreview(cfg) {
  const img = document.getElementById('preview-overlay');
  if (!img) return;
  img.src = cfg.src;
  // Match object-position to where the logo actually sits in the overlay
  img.style.objectPosition = cfg.anchorV === 'top' ? 'top center' : 'bottom center';
}

function renderOverlaySelector() {
  const cfg = getOverlayCfg();

  // Activate the correct group tab
  document.querySelectorAll('.overlay-tab').forEach(btn => {
    const active = btn.dataset.group === cfg.group;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  // Show/populate variant chips for Instagram groups
  const variantsEl = document.getElementById('overlay-variants');
  if (!variantsEl) return;

  if (cfg.group === 'linkedin') {
    variantsEl.hidden = true;
    variantsEl.innerHTML = '';
    return;
  }

  const variants = OVERLAYS.filter(o => o.group === cfg.group);
  variantsEl.hidden = false;
  variantsEl.innerHTML = variants.map(v => `
    <button class="overlay-variant${v.key === cfg.key ? ' active' : ''}"
            data-key="${v.key}"
            aria-pressed="${v.key === cfg.key ? 'true' : 'false'}">
      ${v.label}
    </button>
  `).join('');
}

// ── One-time update notification ──────────────────────────────────
function checkUpdateBanner() {
  if (!localStorage.getItem('wtc-overlay-update-seen')) {
    const banner = document.getElementById('update-banner');
    if (banner) banner.hidden = false;
  }
}

// ── Platform-aware labels ─────────────────────────────────────────
function updateSaveLabels() {
  const btn = document.getElementById('btn-save-all');
  if (!btn) return;
  const label = state.isIos ? 'Salva tutte nella Galleria' : 'Scarica tutte';
  // Preserve the SVG icon, only replace the text node
  const svg = btn.querySelector('svg');
  btn.textContent = label;
  if (svg) btn.insertBefore(svg, btn.firstChild);
}

// ── Event binding ─────────────────────────────────────────────────
function bindEvents() {
  // All three file inputs share the same handler
  ['file-input', 'file-input-more', 'file-input-more-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', handleFileSelection);
  });

  // Photo grid — event delegation for save/share/lightbox
  document.getElementById('photo-grid')
    ?.addEventListener('click', handleGridClick);

  // Save all
  document.getElementById('btn-save-all')
    ?.addEventListener('click', saveAll);

  // Reset / start over
  document.getElementById('btn-reset')
    ?.addEventListener('click', resetAll);

  // Lightbox controls
  document.getElementById('lightbox-close')
    ?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-backdrop')
    ?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev')
    ?.addEventListener('click', () => navLightbox(-1));
  document.getElementById('lightbox-next')
    ?.addEventListener('click', () => navLightbox(1));

  // Keyboard: Escape to close, arrows to navigate
  document.addEventListener('keydown', e => {
    const lb = document.getElementById('lightbox');
    if (!lb || lb.hidden) return;
    if (e.key === 'Escape')      { e.preventDefault(); closeLightbox(); }
    if (e.key === 'ArrowLeft')   { e.preventDefault(); navLightbox(-1); }
    if (e.key === 'ArrowRight')  { e.preventDefault(); navLightbox(1); }
  });

  // Install banner close
  document.getElementById('install-banner-close')
    ?.addEventListener('click', () => {
      document.getElementById('install-banner').hidden = true;
      sessionStorage.setItem('install-dismissed', '1');
    });

  // Overlay group tabs (LinkedIn / IG Orizzontale / IG Verticale)
  document.getElementById('overlay-tabs')
    ?.addEventListener('click', async e => {
      const tab = e.target.closest('.overlay-tab');
      if (!tab) return;
      const first = OVERLAYS.find(o => o.group === tab.dataset.group);
      if (first) {
        await selectOverlay(first.key);
        renderOverlaySelector();
      }
    });

  // Overlay variant chips (Centro / Destra / Sinistra / Alto …)
  document.getElementById('overlay-variants')
    ?.addEventListener('click', async e => {
      const chip = e.target.closest('.overlay-variant');
      if (!chip) return;
      await selectOverlay(chip.dataset.key);
      renderOverlaySelector();
    });

  // Update banner close
  document.getElementById('update-banner-close')
    ?.addEventListener('click', () => {
      document.getElementById('update-banner').hidden = true;
      localStorage.setItem('wtc-overlay-update-seen', '1');
    });
}

// ── File selection ────────────────────────────────────────────────
async function handleFileSelection(e) {
  const files = Array.from(e.target.files ?? []);
  if (!files.length) return;

  // Reset input so the same file can be re-selected later
  e.target.value = '';

  showState('processing');
  updateProcessingUI(0, files.length);

  // Process all files concurrently — Canvas API is fast enough that
  // Promise.all keeps the loading state feeling snappy.
  const newResults = await Promise.all(
    files.map((file, i) => processFile(file, i, files.length))
  );

  state.results.push(...newResults.filter(Boolean));

  renderResults();
  showState('results');
}

// ── Process single file ───────────────────────────────────────────
async function processFile(file, index, total) {
  try {
    const img  = await loadImage(file);
    const blob = await compositeImage(img);
    const previewUrl = URL.createObjectURL(blob);

    updateProcessingUI(index + 1, total);

    return {
      originalName: sanitizeFilename(file.name),
      blob,
      previewUrl,
    };
  } catch (err) {
    console.error('Failed to process:', file.name, err);
    return null;
  }
}

// ── Load file into HTMLImageElement ──────────────────────────────
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url); // free the object URL — we have the decoded image
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Cannot decode image: ${file.name}`));
    };
    img.src = url;
  });
}

// ── Vignette ──────────────────────────────────────────────────────
// Draws a radial gradient from transparent (centre) to soft dark (edges).
// Keeps the subject lit while gently focusing attention away from corners.
function applyVignette(ctx, W, H) {
  const cx = W / 2;
  const cy = H / 2;
  // Inner radius: 38% of the shorter side — subject area stays clean
  const innerR = Math.min(W, H) * 0.38;
  // Outer radius: 88% of the longer side — dark reaches all four corners
  const outerR = Math.max(W, H) * 0.88;

  const gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.30)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

// ── Canvas compositing ────────────────────────────────────────────
// Strategy: scale overlay to COVER the photo (like CSS object-fit:cover),
// then anchor to the edge/corner where the logo sits — it's always fully
// visible while the opposite sides may be cropped for unusual aspect ratios.
function compositeImage(photoImg) {
  return new Promise((resolve, reject) => {
    const W = photoImg.naturalWidth;
    const H = photoImg.naturalHeight;

    const cfg = getOverlayCfg();

    // Use the overlay's actual dimensions (works for all aspect ratios)
    const OW = state.overlayImg.naturalWidth;
    const OH = state.overlayImg.naturalHeight;

    // Scale so the overlay covers the entire photo
    const scale = Math.max(W / OW, H / OH);
    const scaledW = OW * scale;
    const scaledH = OH * scale;

    // Horizontal: anchor to the side where the logo is
    const x = cfg.anchorH === 'left'  ? 0
             : cfg.anchorH === 'right' ? W - scaledW
             :                          (W - scaledW) / 2;

    // Vertical: anchor to the side where the logo is
    const y = cfg.anchorV === 'top' ? 0 : H - scaledH;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }

    // 1. Apply photo enhancements via ctx.filter (GPU-accelerated).
    //    Filter is set BEFORE drawing and reset to 'none' AFTER so the
    //    WTC overlay is never colour-shifted or brightness-adjusted.
    const supportsFilter = typeof ctx.filter !== 'undefined';
    if (supportsFilter) {
      ctx.filter = 'contrast(1.10) saturate(1.20) brightness(1.02)';
    }
    ctx.drawImage(photoImg, 0, 0, W, H);
    if (supportsFilter) { ctx.filter = 'none'; }

    // 2. Vignette — radial gradient from transparent centre to soft dark edge.
    //    Drawn AFTER the photo but BEFORE the overlay so the WTC frame sits clean.
    applyVignette(ctx, W, H);

    // 3. Draw overlay on top — any overflow outside canvas bounds is
    //    automatically clipped; we never distort the overlay's pixels.
    ctx.drawImage(state.overlayImg, x, y, scaledW, scaledH);

    // 4. Export as high-quality JPEG
    canvas.toBlob(
      blob => { blob ? resolve(blob) : reject(new Error('toBlob failed')); },
      'image/jpeg',
      0.95
    );
  });
}

// ── Render results grid ───────────────────────────────────────────
function renderResults() {
  const grid = document.getElementById('photo-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const saveLabel = state.isIos ? 'Salva' : 'Scarica';

  state.results.forEach((result, i) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-index', i);
    // Stagger entrance animation
    card.style.animationDelay = `${i * 55}ms`;

    card.innerHTML = `
      <img class="photo-card-img"
           src="${result.previewUrl}"
           alt="Foto ${i + 1} con frame WTC"
           loading="lazy"
           decoding="async">
      <div class="photo-card-badge" aria-hidden="true">
        <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#F26522" stroke-width="1.5"/><circle cx="5" cy="5" r="2" fill="#F26522"/></svg>
        WTC
      </div>
      <div class="photo-card-actions">
        <button class="card-btn card-btn-save btn-save"
                data-index="${i}"
                aria-label="${saveLabel} foto ${i + 1}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ${saveLabel}
        </button>
        <button class="card-btn card-btn-share btn-share"
                data-index="${i}"
                aria-label="Condividi foto ${i + 1}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Condividi
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  // Update count
  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = state.results.length;

  // Show bottom bar
  document.getElementById('bottom-bar')?.classList.add('visible');
}

// ── Grid click delegation ─────────────────────────────────────────
function handleGridClick(e) {
  const saveBtn  = e.target.closest('.btn-save');
  const shareBtn = e.target.closest('.btn-share');
  const card     = e.target.closest('.photo-card');

  if (saveBtn)  { saveSingle(parseInt(saveBtn.dataset.index, 10)); return; }
  if (shareBtn) { shareSingle(parseInt(shareBtn.dataset.index, 10)); return; }
  // Click anywhere on the card (not on action buttons) opens lightbox
  if (card && !e.target.closest('.photo-card-actions')) {
    openLightbox(parseInt(card.dataset.index, 10));
  }
}

// ── Lightbox ──────────────────────────────────────────────────────
function openLightbox(index) {
  lightboxIndex = index;
  updateLightbox();
  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.hidden = true;
    document.body.style.overflow = '';
  }
}

function navLightbox(dir) {
  const newIndex = lightboxIndex + dir;
  if (newIndex >= 0 && newIndex < state.results.length) {
    lightboxIndex = newIndex;
    updateLightbox();
  }
}

function updateLightbox() {
  const result = state.results[lightboxIndex];
  if (!result) return;

  const img     = document.getElementById('lightbox-img');
  const counter = document.getElementById('lightbox-counter');
  const prev    = document.getElementById('lightbox-prev');
  const next    = document.getElementById('lightbox-next');

  if (img) {
    img.src = result.previewUrl;
    img.alt = `Foto ${lightboxIndex + 1} con frame WTC`;
  }
  if (counter) {
    counter.textContent = state.results.length > 1
      ? `${lightboxIndex + 1} / ${state.results.length}`
      : '';
  }
  if (prev) prev.hidden = lightboxIndex === 0;
  if (next) next.hidden = lightboxIndex === state.results.length - 1;
}

// ── Reset / start over ────────────────────────────────────────────
function resetAll() {
  // Revoke all blob URLs to free memory
  state.results.forEach(r => URL.revokeObjectURL(r.previewUrl));
  state.results = [];

  const grid = document.getElementById('photo-grid');
  if (grid) grid.innerHTML = '';

  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = '';

  closeLightbox();
  showState('empty');
}

// ── Save single image ─────────────────────────────────────────────
// "Scarica" always triggers a direct file download — no share dialog, ever.
// On mobile, users can use "Condividi" to reach the gallery via the share sheet.
function saveSingle(index) {
  const result = state.results[index];
  if (!result) return;
  triggerDownload(result.blob, buildFilename(result.originalName));
}

// ── Share single image (explicit share button) ────────────────────
async function shareSingle(index) {
  const result = state.results[index];
  if (!result) return;

  const filename = buildFilename(result.originalName);
  const file = new File([result.blob], filename, { type: 'image/jpeg' });

  // Share button always tries the native share sheet regardless of platform
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'WTC Frame' });
    } catch (err) {
      if (err.name !== 'AbortError') triggerDownload(result.blob, filename);
    }
  } else {
    triggerDownload(result.blob, filename);
  }
}

// ── Save / download all ───────────────────────────────────────────
// Mobile: Web Share API with multiple files → one share sheet,
//         user saves all to gallery at once.
// Desktop: JSZip → .zip download (JPEGs don't compress further, use STORE).
async function saveAll() {
  if (!state.results.length) return;

  const btn = document.getElementById('btn-save-all');
  if (btn) { btn.disabled = true; btn.textContent = 'Attendere…'; }

  try {
    const files = state.results.map(r =>
      new File([r.blob], buildFilename(r.originalName), { type: 'image/jpeg' })
    );

    // "Scarica tutte" always downloads — no share dialog on any platform.
    await downloadZip(files);
  } finally {
    if (btn) {
      btn.disabled = false;
      updateSaveLabels();
    }
  }
}

// ── ZIP download (desktop fallback) ──────────────────────────────
async function downloadZip(files) {
  // JSZip is loaded via CDN with defer; wait up to 3s for it to be ready
  const JSZip = await waitForJSZip();
  if (!JSZip) {
    // Fallback: download files individually
    files.forEach(f => triggerDownload(f, f.name));
    return;
  }

  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f));

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE', // JPEGs don't compress — STORE is much faster
  });

  triggerDownload(zipBlob, 'wtc-foto.zip');
}

function waitForJSZip(timeout = 3000) {
  return new Promise(resolve => {
    if (typeof JSZip !== 'undefined') { resolve(JSZip); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof JSZip !== 'undefined') { clearInterval(interval); resolve(JSZip); }
      else if (Date.now() - start > timeout) { clearInterval(interval); resolve(null); }
    }, 100);
  });
}

// ── Download helper ───────────────────────────────────────────────
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true, view: window }));
  document.body.removeChild(a);
  // Keep URL alive long enough for the browser to start the download
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── Helpers ───────────────────────────────────────────────────────
function buildFilename(originalName) {
  const base = originalName.replace(/\.[^.]+$/, ''); // strip extension
  return `wtc_${base}.jpg`;
}

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_').substring(0, 120);
}

function updateProcessingUI(done, total) {
  const label = document.getElementById('processing-label');
  const count = document.getElementById('processing-count');
  if (label) {
    label.textContent = done < total
      ? `Elaborazione foto ${done + 1} di ${total}…`
      : 'Quasi pronto…';
  }
  if (count) count.textContent = `${done} / ${total}`;
}

// ── State machine ─────────────────────────────────────────────────
const STATES = ['empty', 'processing', 'results'];

function showState(name) {
  STATES.forEach(s => {
    const el = document.getElementById(`state-${s}`);
    if (!el) return;
    el.classList.toggle('active', s === name);
    el.setAttribute('aria-hidden', s !== name ? 'true' : 'false');
  });

  // Hide bottom bar when not in results
  if (name !== 'results') {
    document.getElementById('bottom-bar')?.classList.remove('visible');
  }
}

// ── Service Worker ────────────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  }
}

// ── PWA install prompt ────────────────────────────────────────────
function checkInstallPrompt() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  // Show iOS instructions banner (Safari doesn't fire beforeinstallprompt)
  if (state.isIos && !isStandalone && !sessionStorage.getItem('install-dismissed')) {
    const banner = document.getElementById('install-banner');
    if (banner) banner.hidden = false;
  }

  // Android: Chrome fires beforeinstallprompt — just let the browser handle it
  // (the install chip in the address bar is sufficient UX)
  window.addEventListener('beforeinstallprompt', e => e.preventDefault());
}
