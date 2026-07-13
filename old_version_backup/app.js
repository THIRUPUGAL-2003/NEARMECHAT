/* =============================================
   NearMe — app.js v2  (Real-Time Edition)
   Leaflet + OpenStreetMap + Overpass API
   Features: live tracking, favorites, filters,
   directions, drawer, clustering, dark/light mode
   ============================================= */

'use strict';

// ══════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

let RADIUS = 3000; // metres — updated by slider
const MAX_RESULTS = 60;
const MOVE_THRESHOLD = 50; // metres before auto-re-fetch
const AUTO_REFRESH_INTERVAL = 60000; // 60 s

const CATEGORY_ICONS = {
  restaurant:   '🍽️',
  hospital:     '🏥',
  atm:          '🏧',
  park:         '🌳',
  pharmacy:     '💊',
  fuel:         '⛽',
  school:       '🏫',
  supermarket:  '🛒',
  cafe:         '☕',
  hotel:        '🏨',
  gym:          '🏋️',
  university:   '🎓',
  bus_station:  '🚌',
  parking:      '🅿️',
  bank:         '🏦',
  bar:          '🍺',
  cinema:       '🎬',
  convenience:  '🏪',
};

const OVERPASS_TAG = {
  restaurant:   'amenity=restaurant',
  hospital:     'amenity=hospital',
  atm:          'amenity=atm',
  park:         'leisure=park',
  pharmacy:     'amenity=pharmacy',
  fuel:         'amenity=fuel',
  school:       'amenity=school',
  supermarket:  'shop=supermarket',
  cafe:         'amenity=cafe',
  hotel:        'tourism=hotel',
  gym:          'leisure=fitness_centre',
  university:   'amenity=university',
  bus_station:  'amenity=bus_station',
  parking:      'amenity=parking',
  bank:         'amenity=bank',
  bar:          'amenity=bar',
  cinema:       'amenity=cinema',
  convenience:  'shop=convenience',
};

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════
let map           = null;
let markerCluster = null;
let userMarker    = null;
let userCircle    = null;
let markers       = [];          // parallel array to allPlaces (sorted)
let rawMarkers    = [];          // parallel array to allPlaces (raw order)

let userLat       = null;
let userLng       = null;
let lastFetchLat  = null;
let lastFetchLng  = null;

let currentCategory = 'restaurant';
let allPlaces       = [];
let activeFilters   = new Set();

let watchId         = null;   // geolocation watch ID
let autoRefreshTimer= null;
let autoRefreshOn   = false;
let clockTimer      = null;

let favorites       = loadFavorites();  // Set of place IDs

// ══════════════════════════════════════════════
//  REAL-TIME CLOCK
// ══════════════════════════════════════════════
function startClock() {
  const el = document.getElementById('realtimeClock');
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }
  tick();
  clockTimer = setInterval(tick, 1000);
}

// ══════════════════════════════════════════════
//  DARK / LIGHT THEME
// ══════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('nearme_theme') || 'dark';
  applyTheme(saved);
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = `<span aria-hidden="true">${theme === 'dark' ? '☀️' : '🌙'}</span>`;
  localStorage.setItem('nearme_theme', theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ══════════════════════════════════════════════
//  FAVORITES (localStorage)
// ══════════════════════════════════════════════
function loadFavorites() {
  try {
    const raw = localStorage.getItem('nearme_favs');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function saveFavorites() {
  localStorage.setItem('nearme_favs', JSON.stringify([...favorites]));
  updateStatsFavs();
}
function toggleFavorite(placeId) {
  if (favorites.has(placeId)) {
    favorites.delete(placeId);
    showToast('Removed from favorites', 'info');
  } else {
    favorites.add(placeId);
    showToast('⭐ Added to favorites!', 'success');
  }
  saveFavorites();
  // Update button in current list
  const btn = document.querySelector(`.fav-btn[data-id="${CSS.escape(placeId)}"]`);
  if (btn) btn.classList.toggle('fav-active', favorites.has(placeId));
}
function clearFavorites() {
  favorites.clear();
  saveFavorites();
  // Refresh all fav buttons
  document.querySelectorAll('.fav-btn').forEach((b) => b.classList.remove('fav-active'));
  showToast('Favorites cleared', 'info');
}
function updateStatsFavs() {
  const el = document.getElementById('statFavs');
  if (el) el.textContent = favorites.size;
}

// ══════════════════════════════════════════════
//  MAP INIT
// ══════════════════════════════════════════════
function initMap(lat, lng) {
  if (map) {
    map.setView([lat, lng], 15, { animate: true });
    return;
  }

  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
  }).setView([lat, lng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'topleft' }).addTo(map);
  L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);

  // Marker cluster group
  markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div style="
          width:38px;height:38px;
          border-radius:50%;
          background:linear-gradient(135deg,rgba(108,99,255,0.85),rgba(167,139,250,0.85));
          border:2px solid rgba(255,255,255,0.3);
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:800;font-size:0.85rem;
          box-shadow:0 4px 14px rgba(108,99,255,0.5);
          font-family:'Outfit',sans-serif;
        ">${count}</div>`,
        className: '',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });
    },
  });
  map.addLayer(markerCluster);
}

// ══════════════════════════════════════════════
//  USER MARKER
// ══════════════════════════════════════════════
function placeUserMarker(lat, lng) {
  const userIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
      <div style="
        width:20px;height:20px;
        background:linear-gradient(135deg,#6c63ff,#a78bfa);
        border-radius:50%;border:3px solid #fff;
        box-shadow:0 0 14px rgba(108,99,255,0.8);
        position:relative;z-index:2;
      "></div>
      <div style="
        position:absolute;top:50%;left:50%;
        transform:translate(-50%,-50%);
        width:40px;height:40px;border-radius:50%;
        border:2px solid rgba(108,99,255,0.5);
        animation:userRingAnim 2s ease-out infinite;
      "></div>
      <div style="
        position:absolute;top:50%;left:50%;
        transform:translate(-50%,-50%);
        width:60px;height:60px;border-radius:50%;
        border:1.5px solid rgba(108,99,255,0.25);
        animation:userRingAnim 2s ease-out 0.6s infinite;
      "></div>
    </div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });

  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup('<div class="popup-title">📍 You are here</div>');
  }

  if (userCircle) {
    userCircle.setLatLng([lat, lng]);
    userCircle.setRadius(RADIUS);
  } else {
    userCircle = L.circle([lat, lng], {
      radius: RADIUS,
      color: '#6c63ff',
      fillColor: '#6c63ff',
      fillOpacity: 0.04,
      weight: 1.5,
      dashArray: '6 4',
    }).addTo(map);
  }

  // Inject pulse keyframes into page if not present
  if (!document.getElementById('pulseStyle')) {
    const style = document.createElement('style');
    style.id = 'pulseStyle';
    style.textContent = `
      @keyframes userRingAnim {
        0%   { transform:translate(-50%,-50%) scale(0.4); opacity:1; }
        100% { transform:translate(-50%,-50%) scale(1);   opacity:0; }
      }
    `;
    document.head.appendChild(style);
  }

  const badge = document.getElementById('locationBadge');
  if (badge) badge.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ══════════════════════════════════════════════
//  GET LOCATION — with live tracking
// ══════════════════════════════════════════════
function getUserLocation() {
  showToast('🎯 Detecting your location…', 'info');

  if (!navigator.geolocation) {
    showToast('Geolocation not supported by your browser.', 'error');
    useFallbackLocation();
    return;
  }

  // One-shot first fix
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      lastFetchLat = userLat;
      lastFetchLng = userLng;
      initMap(userLat, userLng);
      placeUserMarker(userLat, userLng);
      showToast('✅ Location found!', 'success');
      fetchNearbyPlaces(currentCategory);
      startLiveTracking();
    },
    (err) => {
      console.warn('Geolocation error:', err.message);
      showToast('Could not get location. Using fallback.', 'error');
      useFallbackLocation();
    },
    { enableHighAccuracy: true, timeout: 14000, maximumAge: 0 }
  );
}

function useFallbackLocation() {
  const fallLat = 20.5937, fallLng = 78.9629;
  initMap(fallLat, fallLng);
  const badge = document.getElementById('locationBadge');
  if (badge) badge.textContent = '📍 Location unavailable';
  setBadgeInactive();
}

// ── LIVE TRACKING ─────────────────────────────
function startLiveTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      userLat = lat;
      userLng = lng;

      placeUserMarker(lat, lng);

      // If user moved more than threshold, re-fetch
      if (lastFetchLat !== null) {
        const d = haversine(lastFetchLat, lastFetchLng, lat, lng);
        if (d > MOVE_THRESHOLD) {
          lastFetchLat = lat;
          lastFetchLng = lng;
          fetchNearbyPlaces(currentCategory);
          showToast('📍 Location updated — refreshing…', 'info');
        } else {
          // Just re-compute distances
          recalcDistances();
        }
      }
    },
    (err) => {
      console.warn('Watch error:', err.message);
      setBadgeInactive();
    },
    { enableHighAccuracy: true, maximumAge: 5000 }
  );

  setLiveBadge(true);
}

function setLiveBadge(active) {
  const el = document.getElementById('liveBadge');
  if (!el) return;
  el.classList.toggle('inactive', !active);
  el.title = active ? 'Live tracking active' : 'Live tracking inactive';
}
function setBadgeInactive() { setLiveBadge(false); }

// Re-calculate distances without re-fetching
function recalcDistances() {
  if (!userLat || !allPlaces.length) return;
  allPlaces.forEach((p) => {
    p.dist = haversine(userLat, userLng, p.lat, p.lng);
  });
  renderResults(allPlaces, currentCategory);
  updateStats();
}

// ══════════════════════════════════════════════
//  AUTO-REFRESH
// ══════════════════════════════════════════════
function toggleAutoRefresh() {
  autoRefreshOn = !autoRefreshOn;
  const btn = document.getElementById('autoRefreshBtn');
  if (btn) {
    btn.classList.toggle('active', autoRefreshOn);
    btn.setAttribute('aria-pressed', autoRefreshOn);
    btn.title = autoRefreshOn ? 'Auto-refresh ON (60s)' : 'Toggle auto-refresh (60s)';
  }

  if (autoRefreshOn) {
    autoRefreshTimer = setInterval(() => {
      if (userLat !== null) {
        fetchNearbyPlaces(currentCategory);
        showToast('🔄 Auto-refresh complete', 'info');
      }
    }, AUTO_REFRESH_INTERVAL);
    showToast('🔄 Auto-refresh ON (every 60s)', 'success');
  } else {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    showToast('Auto-refresh OFF', 'info');
  }
}

// ══════════════════════════════════════════════
//  OVERPASS QUERY
// ══════════════════════════════════════════════
async function fetchNearbyPlaces(category) {
  if (userLat === null) {
    showToast('⚠️ Please allow location access first.', 'error');
    return;
  }

  currentCategory = category;
  showSkeletons();

  const tag = OVERPASS_TAG[category] || 'amenity=restaurant';
  const [k, v] = tag.split('=');

  const query = `
    [out:json][timeout:30];
    (
      node["${k}"="${v}"](around:${RADIUS},${userLat},${userLng});
      way["${k}"="${v}"](around:${RADIUS},${userLat},${userLng});
    );
    out center ${MAX_RESULTS};
  `;

  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      allPlaces = data.elements
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (!lat || !lng) return null;
          const dist = haversine(userLat, userLng, lat, lng);
          const id = `${el.type}_${el.id}`;
          return { ...el, lat, lng, dist, _id: id };
        })
        .filter(Boolean);

      clearMapMarkers();
      renderResults(allPlaces, category);
      renderMapMarkers(allPlaces, category);
      updateStats();

      const count = allPlaces.length;
      const icon = CATEGORY_ICONS[category] || '📍';
      showToast(`${icon} Found ${count} ${category}${count !== 1 ? 's' : ''} nearby`, 'success');
      return; // success — exit retry loop
    } catch (err) {
      lastError = err;
      console.warn(`Overpass endpoint failed (${endpoint}):`, err.message);
    }
  }

  // All endpoints failed
  console.error('All Overpass endpoints failed:', lastError);
  showToast('❌ Failed to fetch places. Try again.', 'error');
  renderEmpty('Connection failed. Check your internet and try again.');
}

// ══════════════════════════════════════════════
//  SKELETON LOADERS
// ══════════════════════════════════════════════
function showSkeletons(count = 5) {
  const list = document.getElementById('resultsList');
  document.getElementById('resultCount').textContent = 'Loading…';
  list.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skel-top">
        <div class="skel-line skel-icon"></div>
        <div class="skel-info">
          <div class="skel-line skel-h skel-w80"></div>
          <div class="skel-line skel-h skel-w50"></div>
        </div>
      </div>
      <div class="skel-line skel-meta"></div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════
//  RENDER RESULTS LIST
// ══════════════════════════════════════════════
function getActiveFilters() {
  return activeFilters;
}

function applyFilters(places) {
  let filtered = [...places];
  if (activeFilters.has('open')) {
    filtered = filtered.filter((p) => {
      const status = getOpenStatus(p.tags?.opening_hours);
      return status === 'open';
    });
  }
  if (activeFilters.has('named')) {
    filtered = filtered.filter((p) => p.tags?.name);
  }
  if (activeFilters.has('address')) {
    filtered = filtered.filter((p) => buildAddress(p.tags));
  }
  return filtered;
}

function getSorted(places) {
  const sort = document.getElementById('sortSelect')?.value || 'distance';
  return [...places].sort((a, b) => {
    if (sort === 'name') {
      return (a.tags?.name || 'Unnamed').localeCompare(b.tags?.name || 'Unnamed');
    }
    if (sort === 'open') {
      const ao = getOpenStatus(a.tags?.opening_hours) === 'open' ? 0 : 1;
      const bo = getOpenStatus(b.tags?.opening_hours) === 'open' ? 0 : 1;
      return ao - bo || a.dist - b.dist;
    }
    return a.dist - b.dist; // distance
  });
}

function renderResults(places, category) {
  const filtered = applyFilters(places);
  const sorted   = getSorted(filtered);

  const list   = document.getElementById('resultsList');
  const count  = document.getElementById('resultCount');
  const icon   = CATEGORY_ICONS[category] || '📍';

  count.textContent = `${sorted.length} ${category.charAt(0).toUpperCase() + category.slice(1)}${sorted.length !== 1 ? 's' : ''} Found`;

  if (!sorted.length) {
    renderEmpty(
      activeFilters.size
        ? 'No places match your current filters. Try removing filters.'
        : `No ${category}s found nearby. Try increasing the radius.`
    );
    return;
  }

  list.innerHTML = sorted
    .map((p, i) => buildCard(p, i, category, icon))
    .join('');
}

function buildCard(p, i, category, icon) {
  const name      = p.tags?.name || 'Unnamed Place';
  const addr      = buildAddress(p.tags);
  const phone     = p.tags?.phone || p.tags?.['contact:phone'] || '';
  const openStatus= getOpenStatus(p.tags?.opening_hours);
  const isFav     = favorites.has(p._id);
  const openBadge = openStatus === 'unknown'
    ? ''
    : `<span class="rc-open ${openStatus}">${openStatus === 'open' ? '● Open' : '● Closed'}</span>`;

  return `
    <div class="result-card" data-index="${i}" data-id="${p._id}"
         onclick="focusPlace(${i})"
         role="listitem"
         tabindex="0"
         aria-label="${name}, ${formatDist(p.dist)} away"
         onkeydown="if(event.key==='Enter')focusPlace(${i})">
      <div class="rc-top">
        <div class="rc-icon" aria-hidden="true">${icon}</div>
        <div class="rc-info">
          <div class="rc-name" title="${escHtml(name)}">${escHtml(name)}</div>
          <div class="rc-type">${category}</div>
        </div>
        <div class="rc-actions">
          <button class="rc-action-btn fav-btn ${isFav ? 'fav-active' : ''}"
                  data-id="${p._id}"
                  onclick="event.stopPropagation();toggleFavorite('${p._id}')"
                  aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}"
                  title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">⭐</button>
          <button class="rc-action-btn"
                  onclick="event.stopPropagation();openDirections(${p.lat},${p.lng},'${escHtml(name)}')"
                  aria-label="Get directions to ${escHtml(name)}"
                  title="Directions">🗺️</button>
          <button class="rc-action-btn"
                  onclick="event.stopPropagation();openDrawer(${i})"
                  aria-label="View details of ${escHtml(name)}"
                  title="Details">ℹ️</button>
        </div>
      </div>
      <div class="rc-meta">
        <span class="rc-dist">📍 ${formatDist(p.dist)}</span>
        ${openBadge}
      </div>
      ${addr ? `<div class="rc-address">🏠 ${escHtml(addr)}</div>` : ''}
      ${phone ? `<a class="rc-phone" href="tel:${phone}" onclick="event.stopPropagation()" aria-label="Call ${escHtml(name)}">📞 ${escHtml(phone)}</a>` : ''}
    </div>`;
}

function renderEmpty(msg = 'No places found. Try a different category or adjust filters.') {
  document.getElementById('resultsList').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">🔍</div>
      <p>${msg}</p>
    </div>`;
  document.getElementById('resultCount').textContent = '0 Results';
}

// ══════════════════════════════════════════════
//  MAP MARKERS
// ══════════════════════════════════════════════
function renderMapMarkers(places, category) {
  clearMapMarkers();

  const filtered = applyFilters(places);
  const sorted   = getSorted(filtered);
  rawMarkers = [];

  sorted.forEach((p, i) => {
    const icon = CATEGORY_ICONS[category] || '📍';
    const name = p.tags?.name || 'Unnamed';
    const addr = buildAddress(p.tags);
    const openStatus = getOpenStatus(p.tags?.opening_hours);

    const divIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:36px;height:36px;
        background:linear-gradient(135deg,#181c2a,#252a45);
        border:2px solid #6c63ff;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:1.05rem;cursor:pointer;
        box-shadow:0 4px 14px rgba(108,99,255,0.45);
        transition:transform 0.2s;
      " title="${escHtml(name)}">${icon}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const openHtml = openStatus === 'unknown' ? '' :
      `<div class="popup-open ${openStatus}">${openStatus === 'open' ? '● Open now' : '● Closed'}</div>`;

    const marker = L.marker([p.lat, p.lng], { icon: divIcon })
      .bindPopup(`
        <div class="popup-title">${icon} ${escHtml(name)}</div>
        <div class="popup-sub">${category}</div>
        ${addr ? `<div class="popup-sub">🏠 ${escHtml(addr)}</div>` : ''}
        ${openHtml}
        <div class="popup-dist">📍 ${formatDist(p.dist)}</div>
        <a class="popup-dir-btn"
           href="${googleMapsUrl(p.lat, p.lng, name)}"
           target="_blank"
           rel="noopener noreferrer">🗺️ Directions</a>
      `, { maxWidth: 240 });

    marker.on('click', () => highlightCard(i));
    markerCluster.addLayer(marker);
    rawMarkers.push(marker);
  });

  markers = rawMarkers; // keep reference
}

function clearMapMarkers() {
  if (markerCluster) markerCluster.clearLayers();
  markers = [];
  rawMarkers = [];
}

// ══════════════════════════════════════════════
//  FOCUS PLACE
// ══════════════════════════════════════════════
function focusPlace(index) {
  const filtered = applyFilters(allPlaces);
  const sorted   = getSorted(filtered);
  const place    = sorted[index];
  if (!place || !map) return;

  map.setView([place.lat, place.lng], 17, { animate: true });

  // Open corresponding marker popup
  if (markers[index]) {
    markers[index].openPopup();
  }

  highlightCard(index);
}

function highlightCard(index) {
  document.querySelectorAll('.result-card').forEach((c) => c.classList.remove('highlighted'));
  const card = document.querySelector(`.result-card[data-index="${index}"]`);
  if (card) {
    card.classList.add('highlighted');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ══════════════════════════════════════════════
//  DETAIL DRAWER
// ══════════════════════════════════════════════
function openDrawer(index) {
  const filtered = applyFilters(allPlaces);
  const sorted   = getSorted(filtered);
  const p        = sorted[index];
  if (!p) return;

  const category  = currentCategory;
  const icon      = CATEGORY_ICONS[category] || '📍';
  const name      = p.tags?.name || 'Unnamed Place';
  const addr      = buildAddress(p.tags);
  const phone     = p.tags?.phone || p.tags?.['contact:phone'] || '';
  const website   = p.tags?.website || p.tags?.['contact:website'] || '';
  const hours     = p.tags?.opening_hours || '';
  const email     = p.tags?.email || p.tags?.['contact:email'] || '';
  const openStatus= getOpenStatus(hours);
  const isFav     = favorites.has(p._id);

  document.getElementById('drawerIcon').textContent = icon;
  document.getElementById('drawerTitle').textContent = name;
  document.getElementById('drawerType').textContent = `${category} · ${formatDist(p.dist)} away`;

  const body = document.getElementById('drawerBody');
  body.innerHTML = `
    <!-- Location -->
    <div class="drawer-section">
      <div class="drawer-section-title">Location</div>
      ${addr ? `<div class="drawer-row"><span class="drawer-row-icon">🏠</span><span>${escHtml(addr)}</span></div>` : ''}
      <div class="drawer-row"><span class="drawer-row-icon">📏</span><span>${formatDist(p.dist)} away</span></div>
      <div class="drawer-row"><span class="drawer-row-icon">🗺️</span>
        <span>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</span>
      </div>
    </div>

    ${hours || phone || email || website ? `
    <!-- Contact -->
    <div class="drawer-section">
      <div class="drawer-section-title">Contact & Hours</div>
      ${phone ? `<div class="drawer-row"><span class="drawer-row-icon">📞</span><a class="drawer-link" href="tel:${phone}">${escHtml(phone)}</a></div>` : ''}
      ${email ? `<div class="drawer-row"><span class="drawer-row-icon">✉️</span><a class="drawer-link" href="mailto:${email}">${escHtml(email)}</a></div>` : ''}
      ${website ? `<div class="drawer-row"><span class="drawer-row-icon">🌐</span><a class="drawer-link" href="${website}" target="_blank" rel="noopener">${escHtml(website.replace(/^https?:\/\//, ''))}</a></div>` : ''}
      ${hours ? `<div class="drawer-row"><span class="drawer-row-icon">🕐</span><span class="${openStatus !== 'unknown' ? ('rc-open ' + openStatus) : ''}">${escHtml(hours)}</span></div>` : ''}
    </div>
    ` : ''}

    <!-- OSM Data -->
    <div class="drawer-section">
      <div class="drawer-section-title">Data</div>
      <div class="drawer-row"><span class="drawer-row-icon">🔖</span>
        <a class="drawer-link" href="https://www.openstreetmap.org/${p.type}/${p.id}" target="_blank" rel="noopener">
          View on OpenStreetMap ↗
        </a>
      </div>
    </div>

    <!-- Actions -->
    <div class="drawer-actions">
      <a class="drawer-action-btn primary"
         href="${googleMapsUrl(p.lat, p.lng, name)}"
         target="_blank" rel="noopener noreferrer">
        🗺️ Directions
      </a>
      <button class="drawer-action-btn" onclick="sharePlace(${p.lat},${p.lng},'${escHtml(name)}')">
        🔗 Share
      </button>
      <button class="drawer-action-btn ${isFav ? 'fav-active' : ''}"
              id="drawerFavBtn"
              onclick="toggleFavorite('${p._id}');updateDrawerFav('${p._id}')">
        ⭐ ${isFav ? 'Saved' : 'Save'}
      </button>
      <button class="drawer-action-btn"
              onclick="focusPlace(${index});closeDrawer()">
        🔍 Focus on Map
      </button>
    </div>
  `;

  const drawer = document.getElementById('detailDrawer');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const drawer = document.getElementById('detailDrawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function updateDrawerFav(id) {
  const btn = document.getElementById('drawerFavBtn');
  if (!btn) return;
  const isFav = favorites.has(id);
  btn.textContent = `⭐ ${isFav ? 'Saved' : 'Save'}`;
  btn.classList.toggle('fav-active', isFav);
}

// ══════════════════════════════════════════════
//  DIRECTIONS & SHARE
// ══════════════════════════════════════════════
function googleMapsUrl(lat, lng, name) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(name)}`;
}

function openDirections(lat, lng, name) {
  window.open(googleMapsUrl(lat, lng, name), '_blank', 'noopener,noreferrer');
}

async function sharePlace(lat, lng, name) {
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const text = `${name} — ${url}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: name, text, url });
      return;
    } catch { /* fallthrough to clipboard */ }
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('🔗 Link copied to clipboard!', 'success');
  } catch {
    showToast('Could not copy link', 'error');
  }
}

// ══════════════════════════════════════════════
//  SEARCH BY CITY / ADDRESS
// ══════════════════════════════════════════════
async function searchCity(query) {
  if (!query.trim()) return;
  showToast('🔍 Searching…', 'info');

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'NearMe-App/2.0' },
    });
    const data = await res.json();

    if (!data.length) { showToast('❌ Location not found', 'error'); return; }

    userLat = parseFloat(data[0].lat);
    userLng = parseFloat(data[0].lon);
    lastFetchLat = userLat;
    lastFetchLng = userLng;

    if (!map) initMap(userLat, userLng);
    else map.setView([userLat, userLng], 14, { animate: true });

    placeUserMarker(userLat, userLng);
    fetchNearbyPlaces(currentCategory);
    showToast(`📍 Moved to ${data[0].display_name.split(',')[0]}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Search failed. Try again.', 'error');
  }
}

// ══════════════════════════════════════════════
//  STATS BAR
// ══════════════════════════════════════════════
function updateStats() {
  const filtered = applyFilters(allPlaces);
  const sorted   = getSorted(filtered);

  const elFound   = document.getElementById('statFound');
  const elNearest = document.getElementById('statNearest');
  const elRadius  = document.getElementById('statRadius');

  if (elFound)   elFound.textContent   = sorted.length || '—';
  if (elNearest) elNearest.textContent = sorted.length ? formatDist(sorted[0].dist) : '—';
  if (elRadius)  elRadius.textContent  = RADIUS >= 1000 ? `${(RADIUS/1000).toFixed(1)} km` : `${RADIUS} m`;

  updateStatsFavs();
}

// ══════════════════════════════════════════════
//  FIT ALL MARKERS
// ══════════════════════════════════════════════
function fitAllMarkers() {
  if (!map || !allPlaces.length) return;
  const filtered = applyFilters(allPlaces);
  if (!filtered.length) return;

  const bounds = L.latLngBounds(filtered.map((p) => [p.lat, p.lng]));
  if (userLat) bounds.extend([userLat, userLng]);
  map.fitBounds(bounds, { padding: [40, 40], animate: true });
}

// ══════════════════════════════════════════════
//  OPENING HOURS PARSER  (improved)
// ══════════════════════════════════════════════
function getOpenStatus(hours) {
  if (!hours) return 'unknown';

  const h = hours.trim().toLowerCase();

  // Always open
  if (/24\/7/.test(h) || h === 'open' || h === 'yes') return 'open';

  // Always closed
  if (h === 'closed' || h === 'no') return 'closed';

  try {
    const now = new Date();
    const dayNames = ['su','mo','tu','we','th','fr','sa'];
    const today = dayNames[now.getDay()];
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Split by semicolons into rules
    const rules = h.split(';').map((r) => r.trim());

    for (const rule of rules) {
      // e.g. "Mo-Fr 09:00-18:00" or "Sa,Su 10:00-14:00" or "Mo-Su 08:00-22:00"
      const m = rule.match(/^([a-z,\-]+)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (!m) continue;

      const [, daysStr, startStr, endStr] = m;
      if (!matchesDay(daysStr, today)) continue;

      const startMins = timeToMins(startStr);
      const endMins   = timeToMins(endStr);

      if (endMins < startMins) {
        // Overnight span
        if (currentMins >= startMins || currentMins < endMins) return 'open';
      } else {
        if (currentMins >= startMins && currentMins < endMins) return 'open';
      }
      return 'closed';
    }
  } catch { /* ignore parse errors */ }

  return 'unknown';
}

function matchesDay(daysStr, today) {
  const dayNames = ['su','mo','tu','we','th','fr','sa'];
  const parts = daysStr.split(',');
  for (const part of parts) {
    const range = part.split('-');
    if (range.length === 2) {
      const start = dayNames.indexOf(range[0]);
      const end   = dayNames.indexOf(range[1]);
      const cur   = dayNames.indexOf(today);
      if (start === -1 || end === -1 || cur === -1) continue;
      // Handle week-wrap (e.g. fr-su)
      if (start <= end) {
        if (cur >= start && cur <= end) return true;
      } else {
        if (cur >= start || cur <= end) return true;
      }
    } else {
      if (part.trim() === today) return true;
    }
  }
  return false;
}

function timeToMins(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(m) {
  if (m < 100)  return `${Math.round(m)} m`;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function buildAddress(tags) {
  if (!tags) return '';
  return [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:postcode'],
  ].filter(Boolean).join(', ');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ══════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════
let toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// ══════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // ── Theme
  initTheme();
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

  // ── Real-time clock
  startClock();

  // ── Category chips
  document.getElementById('chipsWrap')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.disabled) return;
    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');
    currentCategory = chip.dataset.type;
    fetchNearbyPlaces(currentCategory);
  });

  // ── Chip scroll arrows
  document.getElementById('chipScrollLeft')?.addEventListener('click', () => {
    const wrap = document.getElementById('chipsWrap');
    if (wrap) wrap.scrollBy({ left: -200, behavior: 'smooth' });
  });
  document.getElementById('chipScrollRight')?.addEventListener('click', () => {
    const wrap = document.getElementById('chipsWrap');
    if (wrap) wrap.scrollBy({ left: 200, behavior: 'smooth' });
  });

  // ── My Location button
  document.getElementById('myLocationBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    getUserLocation();
  });

  // ── Center user button (map)
  document.getElementById('centerUserBtn')?.addEventListener('click', () => {
    if (userLat && map) map.setView([userLat, userLng], 15, { animate: true });
    else showToast('⚠️ Location not available', 'error');
  });

  // ── Fit all markers
  document.getElementById('fitAllBtn')?.addEventListener('click', fitAllMarkers);
  document.getElementById('fitMarkersBtn')?.addEventListener('click', fitAllMarkers);

  // ── Search
  document.getElementById('searchBtn')?.addEventListener('click', () => {
    searchCity(document.getElementById('searchInput')?.value || '');
  });
  document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      searchCity(e.target.value);
    }
  });

  // ── Sort
  document.getElementById('sortSelect')?.addEventListener('change', () => {
    if (allPlaces.length) {
      renderResults(allPlaces, currentCategory);
      renderMapMarkers(allPlaces, currentCategory);
    }
  });

  // ── Radius slider
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusVal    = document.getElementById('radiusVal');
  radiusSlider?.addEventListener('input', () => {
    const val = parseInt(radiusSlider.value, 10);
    RADIUS = val;
    const display = val >= 1000 ? `${(val / 1000).toFixed(1)} km` : `${val} m`;
    if (radiusVal) radiusVal.textContent = display;
    // Update circle on map
    if (userCircle) userCircle.setRadius(RADIUS);
    // Update stats
    updateStats();
  });
  radiusSlider?.addEventListener('change', () => {
    // Re-fetch when slider stops
    if (userLat !== null) fetchNearbyPlaces(currentCategory);
  });

  // ── Filter chips
  document.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter;
      if (activeFilters.has(f)) {
        activeFilters.delete(f);
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      } else {
        activeFilters.add(f);
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      }
      if (allPlaces.length) {
        renderResults(allPlaces, currentCategory);
        renderMapMarkers(allPlaces, currentCategory);
        updateStats();
      }
    });
  });

  // ── Auto-refresh toggle
  document.getElementById('autoRefreshBtn')?.addEventListener('click', toggleAutoRefresh);

  // ── Clear favorites
  document.getElementById('clearFavsBtn')?.addEventListener('click', () => {
    if (favorites.size === 0) { showToast('No favorites to clear', 'info'); return; }
    if (confirm('Clear all favorites?')) clearFavorites();
  });

  // ── Detail drawer close
  document.getElementById('drawerClose')?.addEventListener('click', closeDrawer);
  document.getElementById('drawerBackdrop')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // ── Init stats
  updateStatsFavs();

  // ── Auto-locate on load
  getUserLocation();
});
