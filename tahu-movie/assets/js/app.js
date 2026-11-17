// ==========================================
// 1. CẤU HÌNH HỆ THỐNG
// ==========================================
const CONFIG = {
    APP_NAME: "TaHu Cinema",
    API_BASE: "https://phim.nguonc.com/api",
    SOURCE_NAME: "nguonc",
    DEFAULT_THUMB: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=60",
    CACHE_TTL: 5 * 60 * 1000,
    FETCH_TIMEOUT: 8000,
    ACCESS_PASSWORD: "123456", // Đổi mật khẩu tại đây hoặc đặt "" để tắt hỏi mật khẩu
    STORAGE_KEYS: {
        FAVORITES: "cinemax_favorites",
        HISTORY: "cinemax_history",
        CURRENT_WATCH: "cinemax_current_watch",
        ACCESS_GRANTED: "tahu_access_granted",
        CACHE_PREFIX: "moviecache_"
    }
};

// ==========================================
// 2. BIẾN TRẠNG THÁI TOÀN CỤC (STATE)
// ==========================================
const state = {
    currentPage: 1,
    currentKeyword: "",
    currentCategory: "",
    currentType: "",
    isViewingHistory: false,
    isViewingFavorites: false,
    isLoading: false,
    hasMoreData: true
};

let bannerMovies = [];
let currentBannerIndex = 0;
let bannerInterval = null;

let player = null;
let hlsInstance = null;
let currentMovieData = null;
let currentServerIndex = 0;
let currentEpIndex = 0;
let globalMovieEpisodes = [];

let videoPlayer, plyrWrapper, videoIframe;

// ==========================================
// 3. CÁC HÀM TIỆN ÍCH & LƯU TRỮ
// ==========================================
const storage = {
    get(key, defaultValue = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {}
    }
};

const cacheManager = {
    get(key) {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.CACHE_PREFIX + key);
            if (!raw) return null;
            const item = JSON.parse(raw);
            if (Date.now() - item.ts > CONFIG.CACHE_TTL) {
                localStorage.removeItem(CONFIG.STORAGE_KEYS.CACHE_PREFIX + key);
                return null;
            }
            return item.data;
        } catch (e) {
            return null;
        }
    },
    set(key, data) {
        try {
            localStorage.setItem(
                CONFIG.STORAGE_KEYS.CACHE_PREFIX + key,
                JSON.stringify({ ts: Date.now(), data })
            );
        } catch (e) {}
    }
};

let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('appToast');
    const msgEl = document.getElementById('toastMsg');
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2600);
}

function startTransition() {
    const overlay = document.getElementById('transitionOverlay');
    if (overlay) overlay.classList.add('active');
}

function endTransition() {
    const overlay = document.getElementById('transitionOverlay');
    if (overlay) overlay.classList.remove('active');
}

function getSafeImageUrl(movie) {
    return movie.thumb_url || movie.poster_url || CONFIG.DEFAULT_THUMB;
}

function extractNames(data) {
    if (!data || data.length === 0) return "Đang cập nhật";
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(i => typeof i === 'object' ? i.name : i).join(', ');
    return "Đang cập nhật";
}

function updateURLParams(params = {}) {
    try {
        const url = new URL(window.location.href);
        const currentParams = new URLSearchParams(url.search);
        
        if (params.clear) {
            url.search = '';
        } else {
            Object.keys(params).forEach(key => {
                if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
                    currentParams.set(key, params[key]);
                } else {
                    currentParams.delete(key);
                }
            });
            url.search = currentParams.toString();
        }
        window.history.pushState({}, '', url.toString());
    } catch (e) {}
}

// ==========================================
// 4. API NGUỒN PHIM
// ==========================================
async function fetchWithTimeout(url, timeoutMs = CONFIG.FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

const prefetchCache = new Map();
async function prefetchMovie(slug, source = CONFIG.SOURCE_NAME) {
    const key = `${source}_${slug}`;
    if (prefetchCache.has(key)) return;
    prefetchCache.set(key, 'loading');
    try {
        const res = await fetchWithTimeout(`${CONFIG.API_BASE}/film/${slug}`, 8000);
        const data = await res.json();
        prefetchCache.set(key, data);
    } catch (e) {
        prefetchCache.delete(key);
    }
}

async function searchMovies(keyword, page = 1, limit = null) {
    const limitQuery = limit ? `&limit=${limit}` : '';
    const res = await fetchWithTimeout(`${CONFIG.API_BASE}/films/search?keyword=${encodeURIComponent(keyword)}&page=${page}${limitQuery}`);
    const data = await res.json();
    const items = data.items || [];
    items.forEach(m => { m.source = CONFIG.SOURCE_NAME; m.imgDomain = ''; });
    return items;
}

async function fetchMovieList({ type = '', category = '', page = 1 }) {
    const cacheKey = `list_${CONFIG.SOURCE_NAME}_${type}_${category}_${page}`;
    const cached = cacheManager.get(cacheKey);
    if (cached) return cached;

    let apiUrl = "";
    if (type !== "") {
        apiUrl = `${CONFIG.API_BASE}/films/danh-sach/${type}?page=${page}`;
    } else if (category !== "") {
        apiUrl = `${CONFIG.API_BASE}/films/the-loai/${category}?page=${page}`;
    } else {
        apiUrl = `${CONFIG.API_BASE}/films/phim-moi-cap-nhat?page=${page}`;
    }

    const res = await fetchWithTimeout(apiUrl);
    const data = await res.json();
    const items = data.items || [];
    items.forEach(m => { m.source = CONFIG.SOURCE_NAME; m.imgDomain = ''; });

    if (items.length > 0) {
        cacheManager.set(cacheKey, items);
    }
    return items;
}

async function fetchMovieDetail(slug) {
    const res = await fetchWithTimeout(`${CONFIG.API_BASE}/film/${slug}?_t=${Date.now()}`, 10000);
    const data = await res.json();
    return data;
}

// ==========================================
// 5. YÊU THÍCH & LỊCH SỬ
// ==========================================
function getFavorites() {
    return storage.get(CONFIG.STORAGE_KEYS.FAVORITES, []);
}

function isFavorite(slug, source = CONFIG.SOURCE_NAME) {
    const favs = getFavorites();
    return favs.some(f => f.slug === slug && f.source === source);
}

function toggleFavorite(movieData, btnEl = null, onStateChange = null) {
    let favs = getFavorites();
    const index = favs.findIndex(f => f.slug === movieData.slug && f.source === movieData.source);
    let isFavNow = false;

    if (index > -1) {
        favs.splice(index, 1);
        showToast(`Đã xóa "${movieData.name}" khỏi danh sách yêu thích`);
    } else {
        favs.unshift(movieData);
        isFavNow = true;
        showToast(`Đã thêm "${movieData.name}" vào danh sách yêu thích`);
    }

    storage.set(CONFIG.STORAGE_KEYS.FAVORITES, favs);

    if (btnEl) {
        btnEl.classList.toggle('active', isFavNow);
        btnEl.innerText = isFavNow ? '❤' : '🤍';
    }

    if (currentMovieData && currentMovieData.slug === movieData.slug) {
        updateModalFavBtn(isFavNow);
    }

    if (onStateChange) onStateChange(isFavNow);
    return isFavNow;
}

function prioritizeSearchResults(movies) {
    const favs = getFavorites();
    if (favs.length === 0) return movies;
    
    const favWords = new Set();
    favs.forEach(f => {
        const words = (f.name + " " + (f.originalName || "")).toLowerCase().split(/[\s\-_:]+/);
        words.forEach(w => { if (w.length > 2) favWords.add(w); });
    });

    movies.forEach(m => {
        m.score = 0;
        const originalName = m.original_name || m.origin_name || "";
        if (favs.some(f => f.slug === m.slug && f.source === m.source)) { 
            m.score += 1000; 
        }
        const mWords = (m.name + " " + originalName).toLowerCase().split(/[\s\-_:]+/);
        mWords.forEach(w => { if (favWords.has(w)) m.score += 10; });
    });

    return movies.sort((a, b) => b.score - a.score);
}

function getHistory() {
    return storage.get(CONFIG.STORAGE_KEYS.HISTORY, []);
}

function saveToHistory(movieData) {
    let history = getHistory();
    history = history.filter(item => item.slug !== movieData.slug);
    history.unshift(movieData);
    if (history.length > 50) history.pop();
    storage.set(CONFIG.STORAGE_KEYS.HISTORY, history);
}

// ==========================================
// 6. RENDER GIAO DIỆN (UI & CARDS)
// ==========================================
function createMovieCard(movie, onCardClick, onFavToggleCallback) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    const source = movie.source || CONFIG.SOURCE_NAME;

    card.addEventListener('mouseenter', () => prefetchMovie(movie.slug, source), { once: true });
    
    card.onclick = () => {
        if (onCardClick) onCardClick(movie);
    };

    const imgUrl = getSafeImageUrl(movie);
    const originalName = movie.original_name || movie.origin_name || "";
    
    let epCurr = movie.episode_current || "";
    let epTotal = movie.episode_total || "";
    let episodeBadge = epCurr || "HD";
    if (epCurr && epTotal && epTotal !== "0" && epTotal !== "?" && epCurr.indexOf(epTotal) === -1) {
        episodeBadge = !isNaN(epCurr) ? `Tập ${epCurr}/${epTotal}` : `${epCurr}/${epTotal}`;
    }

    const yearText = movie.year || new Date().getFullYear();
    const langText = movie.lang || movie.language || "Vietsub";
    const qualText = movie.quality || "HD";
    const isFav = isFavorite(movie.slug, source);

    card.innerHTML = `
        <div class="card-img-wrapper">
            <span class="badge-ep">${episodeBadge}</span>
            <span class="badge-quality">${qualText}</span>
            <img src="${imgUrl}" alt="${movie.name}" loading="lazy">
            <div class="card-overlay">
                <div class="overlay-btns">
                    <button class="overlay-play-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Xem
                    </button>
                    <button class="overlay-fav-btn ${isFav ? 'active' : ''}" title="Yêu thích">
                        ${isFav ? '❤' : '🤍'}
                    </button>
                </div>
                <div class="overlay-meta">
                    <span>${yearText}</span>
                    <span>${langText}</span>
                </div>
            </div>
        </div>
        <div class="card-details">
            <div class="card-title" title="${movie.name}">${movie.name}</div>
            <div class="card-sub">${originalName || 'Đang cập nhật'}</div>
        </div>
    `;

    const favBtn = card.querySelector('.overlay-fav-btn');
    favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite({
            slug: movie.slug,
            source: source,
            name: movie.name,
            originalName: originalName,
            image: imgUrl,
            episode_current: episodeBadge
        }, favBtn, onFavToggleCallback);
    };

    return card;
}

function showSkeleton() {
    const container = document.getElementById('skeletonContainer');
    if (!container) return;
    let html = '';
    for (let i = 0; i < 12; i++) {
        html += `
            <div class="skeleton-card">
                <div class="skeleton-img skeleton"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line skeleton" style="width: 85%;"></div>
                    <div class="skeleton-line skeleton" style="width: 55%;"></div>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
    container.style.display = 'grid';
    const endEl = document.getElementById('endOfListIndicator');
    if (endEl) endEl.style.display = 'none';
}

function hideSkeleton() {
    const container = document.getElementById('skeletonContainer');
    if (container) container.style.display = 'none';
}

// ==========================================
// 7. HERO SLIDER BANNER
// ==========================================
function initHeroSlider(movies) {
    bannerMovies = movies.slice(0, 5);
    currentBannerIndex = 0;
    const banner = document.getElementById('heroBanner');
    if (!banner) return;
    banner.style.display = 'flex';

    const dotsContainer = document.getElementById('heroDots');
    dotsContainer.innerHTML = '';
    bannerMovies.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.onclick = () => {
            currentBannerIndex = i;
            updateHeroBannerDisplay(currentBannerIndex);
            resetBannerInterval();
        };
        dotsContainer.appendChild(dot);
    });

    updateHeroBannerDisplay(currentBannerIndex);
    resetBannerInterval();
    setupBannerEvents(banner);
}

function hideHeroBanner() {
    if (bannerInterval) clearInterval(bannerInterval);
    const banner = document.getElementById('heroBanner');
    if (banner) banner.style.display = 'none';
}

async function updateHeroBannerDisplay(index) {
    if (!bannerMovies[index]) return;
    const movie = bannerMovies[index];
    const content = document.querySelector('.hero-content');
    
    if (content) {
        content.style.animation = 'none';
        content.offsetHeight;
        content.style.animation = null;
    }

    document.getElementById('heroTitle').innerText = movie.name;
    document.getElementById('heroDesc').innerText = movie.bannerDesc || "Đang tải tóm tắt phim...";
    
    const bgUrl = movie.bannerBg || getSafeImageUrl(movie);
    document.getElementById('heroBackdrop').style.backgroundImage = `url('${bgUrl}')`;
    
    document.getElementById('heroBadgeQuality').innerText = movie.quality || "HD";
    document.getElementById('heroYear').innerText = movie.year || "2024";
    document.getElementById('heroLang').innerText = movie.lang || "Vietsub";

    const playAction = () => {
        startTransition();
        playMovie(movie.slug, movie.source);
    };

    document.getElementById('heroPlayBtn').onclick = playAction;
    document.getElementById('heroInfoBtn').onclick = playAction;

    document.querySelectorAll('.dot').forEach((d, i) => {
        d.classList.toggle('active', i === index);
    });

    if (!movie.detailFetched) {
        try {
            const res = await fetch(`https://phim.nguonc.com/api/film/${movie.slug}`);
            const data = await res.json();
            const detail = data.movie || data.item || {};
            const betterImg = detail.poster_url || detail.thumb_url || bgUrl;
            
            const tmp = document.createElement("div");
            tmp.innerHTML = detail.content || detail.description || "Chưa có thông tin mô tả cho bộ phim này.";
            movie.bannerBg = betterImg;
            movie.bannerDesc = tmp.textContent || tmp.innerText || "";
            movie.detailFetched = true;

            if (currentBannerIndex === index) {
                document.getElementById('heroBackdrop').style.backgroundImage = `url('${betterImg}')`;
                document.getElementById('heroDesc').innerText = movie.bannerDesc;
            }
        } catch(e) {
            movie.bannerDesc = "Bộ phim đặc sắc với nội dung hấp dẫn.";
            movie.detailFetched = true;
        }
    }
}

function resetBannerInterval() {
    if (bannerInterval) clearInterval(bannerInterval);
    bannerInterval = setInterval(() => {
        currentBannerIndex = (currentBannerIndex + 1) % bannerMovies.length;
        updateHeroBannerDisplay(currentBannerIndex);
    }, 6000);
}

let eventsBound = false;
function setupBannerEvents(banner) {
    if (eventsBound) return;
    eventsBound = true;

    let startX = 0;
    let isDragging = false;

    banner.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    banner.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
            currentBannerIndex = (currentBannerIndex + (diff > 0 ? 1 : -1) + bannerMovies.length) % bannerMovies.length;
            updateHeroBannerDisplay(currentBannerIndex);
            resetBannerInterval();
        }
    });

    banner.addEventListener('mousedown', e => {
        startX = e.clientX;
        isDragging = true;
    });
    banner.addEventListener('mouseup', e => {
        if (!isDragging) return;
        isDragging = false;
        const diff = startX - e.clientX;
        if (Math.abs(diff) > 40) {
            currentBannerIndex = (currentBannerIndex + (diff > 0 ? 1 : -1) + bannerMovies.length) % bannerMovies.length;
            updateHeroBannerDisplay(currentBannerIndex);
            resetBannerInterval();
        }
    });
    banner.addEventListener('mouseleave', () => { isDragging = false; });

    window.addEventListener('keydown', e => {
        if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        const modal = document.getElementById('videoModal');
        if (modal && modal.classList.contains('show')) return;
        if (banner.style.display === 'none') return;

        if (e.key === 'ArrowRight') {
            currentBannerIndex = (currentBannerIndex + 1) % bannerMovies.length;
            updateHeroBannerDisplay(currentBannerIndex);
            resetBannerInterval();
        } else if (e.key === 'ArrowLeft') {
            currentBannerIndex = (currentBannerIndex - 1 + bannerMovies.length) % bannerMovies.length;
            updateHeroBannerDisplay(currentBannerIndex);
            resetBannerInterval();
        }
    });
}

// ==========================================
// 8. TRÌNH PHÁT VIDEO & MODAL
// ==========================================
function initPlayer() {
    if (!player && typeof Plyr !== 'undefined' && videoPlayer) {
        player = new Plyr(videoPlayer, {
            controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
            settings: ['quality', 'speed', 'loop']
        });
    }
}

function showModal() {
    const modal = document.getElementById('videoModal');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    document.body.style.overflow = 'hidden';
}

function hideModal() {
    const modal = document.getElementById('videoModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }, 300);
}

function closeVideo() {
    hideModal();
    storage.remove(CONFIG.STORAGE_KEYS.CURRENT_WATCH);
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (player) { player.stop(); }
    if (videoIframe) videoIframe.src = "";
    updateURLParams({ watch: null, sv: null, ep: null });
}

function toggleDescription() {
    const desc = document.getElementById('detailDescription');
    const btn = document.getElementById('readMoreBtn');
    if (!desc || !btn) return;
    desc.classList.toggle('expanded');
    btn.innerText = desc.classList.contains('expanded') ? 'Thu gọn ⌃' : 'Xem thêm ⌄';
}

function updateModalFavBtn(isFav) {
    const icon = document.getElementById('modalFavIcon');
    const btn = document.getElementById('modalFavBtn');
    if (icon && btn) {
        icon.innerText = isFav ? '❤️' : '🤍';
        btn.style.color = isFav ? '#ff3b5c' : '#fff';
    }
}

function toggleCurrentModalFav() {
    if (!currentMovieData) return;
    toggleFavorite(currentMovieData, null, (isFav) => {
        updateModalFavBtn(isFav);
    });
}

function shareCurrentEpisode() {
    if (!currentMovieData || !currentMovieData.slug) return;
    const shareUrl = new URL(window.location.origin + window.location.pathname);
    shareUrl.searchParams.set('watch', currentMovieData.slug);
    if (currentServerIndex > 0) shareUrl.searchParams.set('sv', currentServerIndex);
    if (currentEpIndex > 0) shareUrl.searchParams.set('ep', currentEpIndex);

    const finalUrl = shareUrl.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(finalUrl).then(() => {
            showToast('📋 Đã sao chép link tập phim vào bộ nhớ tạm!');
        }).catch(() => {
            prompt('Link tập phim của bạn:', finalUrl);
        });
    } else {
        prompt('Link tập phim của bạn:', finalUrl);
    }
}

async function playMovie(slug, source = CONFIG.SOURCE_NAME, resumeEp = null) {
    initPlayer();
    showModal();

    const loading = document.getElementById('modalLoading');
    const content = document.getElementById('modalContent');
    const loadingStatus = document.getElementById('loadingStatus');

    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';
    if (loadingStatus) loadingStatus.innerText = 'Đang tải thông tin & máy chủ phim...';

    const serverListEl = document.getElementById('serverList');
    const epListEl = document.getElementById('episodeList');
    if (serverListEl) serverListEl.innerHTML = '';
    if (epListEl) epListEl.innerHTML = '';

    try {
        const data = await fetchMovieDetail(slug);
        const movieDetail = data.movie || data.item || {};
        globalMovieEpisodes = movieDetail.episodes || data.episodes || [];

        const originalName = movieDetail.original_name || movieDetail.origin_name || "";
        currentMovieData = {
            slug: slug,
            source: source,
            name: movieDetail.name || "Đang cập nhật",
            originalName: originalName,
            image: getSafeImageUrl(movieDetail),
            episode_current: movieDetail.episode_current || "HD"
        };

        saveToHistory(currentMovieData);
        updateModalFavBtn(isFavorite(slug, source));

        document.getElementById('detailTitle').innerText = movieDetail.name || "Đang cập nhật...";
        document.getElementById('detailOriginalTitle').innerText = originalName;
        document.getElementById('detailYear').innerText = movieDetail.year || "2024";
        document.getElementById('detailQuality').innerText = movieDetail.quality || movieDetail.episode_current || "HD";
        document.getElementById('detailLang').innerText = movieDetail.lang || movieDetail.language || "Vietsub";
        document.getElementById('detailTime').innerText = movieDetail.time || "Đang cập nhật";

        const tmpDiv = document.createElement("div");
        const descContent = movieDetail.description || movieDetail.content || "Chưa có thông tin mô tả chi tiết cho bộ phim này.";
        tmpDiv.innerHTML = descContent;
        const descEl = document.getElementById('detailDescription');
        descEl.innerText = tmpDiv.textContent || tmpDiv.innerText || descContent;
        descEl.classList.remove('expanded');
        document.getElementById('readMoreBtn').innerText = "Xem thêm ⌄";

        document.getElementById('detailCategory').innerText = extractNames(movieDetail.category || movieDetail.categories);
        document.getElementById('detailCountry').innerText = extractNames(movieDetail.country || movieDetail.countries);
        document.getElementById('detailDirector').innerText = extractNames(movieDetail.director || movieDetail.directors);
        document.getElementById('detailCast').innerText = extractNames(movieDetail.actor || movieDetail.casts || movieDetail.cast);

        loading.style.display = 'none';
        content.style.display = 'flex';

        const serverContainer = document.getElementById('serverContainer');
        if (globalMovieEpisodes.length > 0) {
            serverContainer.style.display = 'block';
            globalMovieEpisodes.forEach((server, index) => {
                const btn = document.createElement('button');
                btn.className = 'server-btn';
                btn.innerText = server.server_name || `Server ${index + 1}`;
                btn.onclick = () => selectServer(index);
                serverListEl.appendChild(btn);
            });

            const targetServer = resumeEp?.serverIndex || 0;
            const targetEpisode = resumeEp?.episodeIndex || 0;
            selectServer(targetServer, targetEpisode);
        } else {
            serverContainer.style.display = 'none';
            document.getElementById('episodeContainer').style.display = 'none';
        }

        endTransition();
    } catch (err) {
        console.error(err);
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'flex';
        endTransition();
    }
}

function selectServer(serverIndex, targetEpIndex = 0) {
    currentServerIndex = serverIndex;
    document.querySelectorAll('.server-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === serverIndex);
    });

    const serverData = globalMovieEpisodes[serverIndex]?.server_data || globalMovieEpisodes[serverIndex]?.items || [];
    const episodeList = document.getElementById('episodeList');
    const epContainer = document.getElementById('episodeContainer');
    const epBadge = document.getElementById('episodeCountBadge');

    episodeList.innerHTML = '';
    
    if (serverData.length <= 1) {
        epContainer.style.display = 'none';
    } else {
        epContainer.style.display = 'block';
        epBadge.innerText = `Tổng cộng ${serverData.length} tập`;
    }

    serverData.forEach((tap, idx) => {
        const btn = document.createElement('button');
        btn.className = 'ep-btn';
        btn.innerText = tap.name || `Tập ${idx + 1}`;
        btn.onclick = () => playEpisode(idx, serverData);
        episodeList.appendChild(btn);
    });

    if (serverData[targetEpIndex]) {
        playEpisode(targetEpIndex, serverData);
    } else if (serverData.length > 0) {
        playEpisode(0, serverData);
    }
}

function playEpisode(index, serverData) {
    currentEpIndex = index;
    const tapPhim = serverData[index];
    document.querySelectorAll('.ep-btn').forEach((b, i) => b.classList.toggle('active', i === index));

    if (currentMovieData && currentMovieData.slug) {
        storage.set(CONFIG.STORAGE_KEYS.CURRENT_WATCH, {
            slug: currentMovieData.slug,
            source: currentMovieData.source || CONFIG.SOURCE_NAME,
            serverIndex: currentServerIndex || 0,
            episodeIndex: index
        });

        updateURLParams({
            watch: currentMovieData.slug,
            sv: currentServerIndex || 0,
            ep: index
        });
    }

    const m3u8Link = tapPhim.link_m3u8 || tapPhim.m3u8 || tapPhim.hls || tapPhim.link || "";
    const embedLink = tapPhim.link_embed || tapPhim.embed || tapPhim.url_embed || tapPhim.iframe || "";

    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (player) { player.stop(); }
    if (videoIframe) videoIframe.src = "";

    if (embedLink) {
        if (plyrWrapper) plyrWrapper.style.display = 'none';
        if (videoIframe) {
            videoIframe.style.display = 'block';
            videoIframe.src = embedLink;
        }
    } else if (m3u8Link) {
        if (plyrWrapper) plyrWrapper.style.display = 'block';
        if (videoIframe) videoIframe.style.display = 'none';
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls({
                maxBufferLength: 10,
                maxMaxBufferLength: 20,
                enableWorker: true,
                capLevelToPlayerSize: true,
                fragLoadingTimeOut: 6000,
                manifestLoadingTimeOut: 6000
            });
            hlsInstance.loadSource(m3u8Link);
            hlsInstance.attachMedia(videoPlayer);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                player.play().catch(() => {});
            });
        } else if (videoPlayer && videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            videoPlayer.src = m3u8Link;
        }
    }
}

// ==========================================
// 9. QUẢN LÝ ĐIỀU HƯỚNG & DANH SÁCH PHIM
// ==========================================
function checkAuth() {
    if (!CONFIG.ACCESS_PASSWORD) return;
    if (localStorage.getItem(CONFIG.STORAGE_KEYS.ACCESS_GRANTED) === "true") return;

    let pass = prompt("Nhập mật khẩu truy cập (Dành cho bạn bè):");
    while (pass !== CONFIG.ACCESS_PASSWORD) {
        if (pass === null) {
            document.body.innerHTML = '<div style="color:#fff;text-align:center;padding:100px;font-family:sans-serif;"><h2>Bạn cần nhập mật khẩu để truy cập web phim này.</h2><button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#ff2a4b;color:#fff;border:none;border-radius:6px;cursor:pointer;">Thử lại</button></div>';
            throw new Error("Access denied");
        }
        pass = prompt("Mật khẩu không đúng. Vui lòng nhập lại:");
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.ACCESS_GRANTED, "true");
}

function toggleMobileMenu(open) {
    const menu = document.getElementById('navMenu');
    const overlay = document.getElementById('mobileOverlay');
    const top = document.getElementById('mobileMenuTop');
    if (open) {
        menu?.classList.add('open');
        overlay?.classList.add('active');
        if (top) top.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } else {
        menu?.classList.remove('open');
        overlay?.classList.remove('active');
        if (top) top.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function updateNavUI(btn) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

function resetChipsUI() {
    document.querySelectorAll('.chip').forEach((c, idx) => {
        c.classList.toggle('active', idx === 0);
    });
}

function updateTitleText(titleEl) {
    if (!titleEl) return;
    if (state.currentKeyword !== "") {
        titleEl.innerText = `Tìm kiếm: "${state.currentKeyword}"`;
    } else if (state.currentType === "phim-le") {
        titleEl.innerText = "Danh Sách Phim Lẻ";
    } else if (state.currentType === "phim-bo") {
        titleEl.innerText = "Danh Sách Phim Bộ";
    } else if (state.currentType === "hoat-hinh") {
        titleEl.innerText = "Phim Hoạt Hình - Anime";
    } else if (state.currentCategory !== "") {
        titleEl.innerText = "Danh Sách Thể Loại";
    } else {
        titleEl.innerText = "Phim Mới Cập Nhật";
    }
}

function handleCardClick(movie) {
    startTransition();
    playMovie(movie.slug, movie.source || CONFIG.SOURCE_NAME);
}

async function loadData(append = false) {
    if (state.isViewingHistory || state.isViewingFavorites) return;
    if (state.isLoading || (!state.hasMoreData && append)) return;
    state.isLoading = true;

    const grid = document.getElementById('movie-grid');
    const sectionTitle = document.getElementById('currentSectionTitle');
    const filterSection = document.getElementById('filterSection');

    if (!append && grid) {
        grid.innerHTML = '';
        state.hasMoreData = true;
    }
    showSkeleton();

    let movies = [];
    try {
        if (state.currentKeyword !== "") {
            if (sectionTitle) sectionTitle.innerText = `Kết quả tìm kiếm: "${state.currentKeyword}"`;
            movies = await searchMovies(state.currentKeyword, state.currentPage);
            movies = prioritizeSearchResults(movies);
        } else {
            updateTitleText(sectionTitle);
            movies = await fetchMovieList({
                type: state.currentType,
                category: state.currentCategory,
                page: state.currentPage
            });
        }
    } catch (error) {
        console.error(error);
        hideSkeleton();
        if (!append && grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <div class="empty-title">Không thể kết nối máy chủ phim</div>
                    <div class="empty-desc">Vui lòng kiểm tra lại kết nối mạng của bạn hoặc thử lại sau vài phút.</div>
                    <button class="btn-primary" id="retryLoadBtn" style="margin-top:10px;">Thử lại</button>
                </div>
            `;
            document.getElementById('retryLoadBtn')?.addEventListener('click', () => loadData(false));
        }
        state.isLoading = false;
        return;
    }

    hideSkeleton();

    if (movies.length === 0) {
        state.hasMoreData = false;
        if (!append && grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">Không tìm thấy phim phù hợp</div>
                    <div class="empty-desc">Hãy thử tìm kiếm với từ khóa khác hoặc khám phá các thể loại phổ biến.</div>
                    <button class="btn-primary" id="emptyHomeBtn" style="margin-top:10px;">Về Trang Chủ</button>
                </div>
            `;
            document.getElementById('emptyHomeBtn')?.addEventListener('click', resetToHome);
        } else {
            const endEl = document.getElementById('endOfListIndicator');
            if (endEl) endEl.style.display = 'block';
        }
        hideHeroBanner();
    } else {
        if (!append && state.currentPage === 1 && state.currentKeyword === "" && state.currentCategory === "" && state.currentType === "") {
            initHeroSlider(movies);
            if (filterSection) filterSection.style.display = 'flex';
        } else if (!append) {
            hideHeroBanner();
        }

        if (grid) {
            movies.forEach(movie => {
                grid.appendChild(createMovieCard(movie, handleCardClick, () => {
                    if (state.isViewingFavorites) loadFavoritesView();
                }));
            });
        }
    }
    state.isLoading = false;
}

function resetToHome() {
    state.currentKeyword = "";
    state.currentCategory = "";
    state.currentType = "";
    state.currentPage = 1;
    state.isViewingHistory = false;
    state.isViewingFavorites = false;
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = "";
    const searchClear = document.getElementById('searchClearBtn');
    if (searchClear) searchClear.style.display = 'none';
    const actionArea = document.getElementById('sectionActionArea');
    if (actionArea) actionArea.innerHTML = '';
    
    updateNavUI(document.getElementById('navHome'));
    resetChipsUI();
    toggleMobileMenu(false);
    updateURLParams({ clear: true });
    loadData(false);
}

function filterCategory(cat, chipEl) {
    state.currentKeyword = "";
    state.currentCategory = cat;
    state.currentPage = 1;
    state.isViewingHistory = false;
    state.isViewingFavorites = false;
    
    const actionArea = document.getElementById('sectionActionArea');
    if (actionArea) actionArea.innerHTML = '';
    
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (chipEl) chipEl.classList.add('active');

    updateURLParams({ clear: true });
    if (cat) updateURLParams({ cat: cat });
    loadData(false);
}

function filterType(type, btn) {
    state.currentKeyword = "";
    state.currentCategory = "";
    state.currentType = type;
    state.currentPage = 1;
    state.isViewingHistory = false;
    state.isViewingFavorites = false;
    
    const actionArea = document.getElementById('sectionActionArea');
    if (actionArea) actionArea.innerHTML = '';
    
    updateNavUI(btn);
    resetChipsUI();
    toggleMobileMenu(false);
    updateURLParams({ clear: true });
    updateURLParams({ type: type });
    loadData(false);
}

function loadHistoryView(btn) {
    state.isViewingHistory = true;
    state.isViewingFavorites = false;
    updateNavUI(btn || document.getElementById('navHistory'));
    toggleMobileMenu(false);

    hideHeroBanner();
    const filterSection = document.getElementById('filterSection');
    if (filterSection) filterSection.style.display = 'none';
    hideSkeleton();

    const grid = document.getElementById('movie-grid');
    const titleEl = document.getElementById('currentSectionTitle');
    if (titleEl) titleEl.innerText = 'Lịch Sử Xem Phim';
    const actionArea = document.getElementById('sectionActionArea');
    if (actionArea) {
        actionArea.innerHTML = `<button class="clear-btn" id="clearHistoryBtn">🗑️ Xóa lịch sử</button>`;
        document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
            if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử xem phim?")) {
                storage.remove(CONFIG.STORAGE_KEYS.HISTORY);
                showToast("Đã xóa lịch sử xem phim");
                loadHistoryView();
            }
        });
    }

    const history = getHistory();
    if (!grid) return;
    if (history.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🕒</div>
                <div class="empty-title">Chưa có lịch sử xem phim</div>
                <div class="empty-desc">Các tập phim bạn đã xem sẽ được tự động lưu tại đây để tiện theo dõi tiếp.</div>
                <button class="btn-primary" id="historyHomeBtn" style="margin-top:10px;">Khám Phá Phim Ngay</button>
            </div>
        `;
        document.getElementById('historyHomeBtn')?.addEventListener('click', resetToHome);
        return;
    }

    grid.innerHTML = '';
    history.forEach(m => {
        const mock = {
            slug: m.slug,
            name: m.name,
            original_name: m.originalName,
            thumb_url: m.image,
            episode_current: "Đã xem"
        };
        grid.appendChild(createMovieCard(mock, handleCardClick, () => {}));
    });
}

function loadFavoritesView(btn) {
    state.isViewingFavorites = true;
    state.isViewingHistory = false;
    updateNavUI(btn || document.getElementById('navFav'));
    toggleMobileMenu(false);

    hideHeroBanner();
    const filterSection = document.getElementById('filterSection');
    if (filterSection) filterSection.style.display = 'none';
    hideSkeleton();

    const grid = document.getElementById('movie-grid');
    const titleEl = document.getElementById('currentSectionTitle');
    if (titleEl) titleEl.innerText = 'Phim Yêu Thích Của Bạn';
    const actionArea = document.getElementById('sectionActionArea');
    if (actionArea) {
        actionArea.innerHTML = `<button class="clear-btn" id="clearFavsBtn">🗑️ Xóa danh sách</button>`;
        document.getElementById('clearFavsBtn')?.addEventListener('click', () => {
            if (confirm("Bạn có chắc muốn xóa tất cả phim yêu thích?")) {
                storage.remove(CONFIG.STORAGE_KEYS.FAVORITES);
                showToast("Đã làm trống danh sách yêu thích");
                loadFavoritesView();
            }
        });
    }

    const favs = getFavorites();
    if (!grid) return;
    if (favs.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❤️</div>
                <div class="empty-title">Danh sách yêu thích đang trống</div>
                <div class="empty-desc">Nhấn vào biểu tượng trái tim ở bất kỳ phim nào để lưu lại xem sau.</div>
                <button class="btn-primary" id="favHomeBtn" style="margin-top:10px;">Khám Phá Phim Ngay</button>
            </div>
        `;
        document.getElementById('favHomeBtn')?.addEventListener('click', resetToHome);
        return;
    }

    grid.innerHTML = '';
    favs.forEach(m => {
        const mock = {
            slug: m.slug,
            name: m.name,
            original_name: m.originalName,
            thumb_url: m.image,
            episode_current: m.episode_current || "Yêu thích"
        };
        grid.appendChild(createMovieCard(mock, handleCardClick, () => loadFavoritesView()));
    });
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const suggestionsBox = document.getElementById('searchResultsBox');
    let searchTimeout;

    if (!searchInput) return;

    searchClearBtn?.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        suggestionsBox.style.display = 'none';
        resetToHome();
    });

    searchInput.addEventListener('input', function() {
        const kw = this.value.trim();
        if (searchClearBtn) searchClearBtn.style.display = kw.length > 0 ? 'block' : 'none';
        clearTimeout(searchTimeout);

        if (kw.length < 2) {
            suggestionsBox.style.display = 'none';
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                const items = await searchMovies(kw, 1, 7);
                if (items.length > 0) {
                    suggestionsBox.innerHTML = '';
                    items.forEach(m => {
                        const item = document.createElement('div');
                        item.className = 'suggestion-item';
                        const originalName = m.origin_name || m.original_name || '';
                        const year = m.year ? `(${m.year})` : '';

                        item.innerHTML = `
                            <img src="${m.thumb_url || m.poster_url || CONFIG.DEFAULT_THUMB}" alt="${m.name}">
                            <div class="suggestion-info">
                                <h4>${m.name}</h4>
                                <p>${originalName} ${year}</p>
                            </div>
                        `;
                        item.onclick = () => {
                            suggestionsBox.style.display = 'none';
                            searchInput.value = m.name;
                            searchClearBtn.style.display = 'block';
                            startTransition();
                            playMovie(m.slug, CONFIG.SOURCE_NAME);
                        };
                        suggestionsBox.appendChild(item);
                    });
                    suggestionsBox.style.display = 'block';
                } else {
                    suggestionsBox.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Không tìm thấy phim phù hợp</div>';
                    suggestionsBox.style.display = 'block';
                }
            } catch (e) {
                suggestionsBox.style.display = 'none';
            }
        }, 350);
    });

    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const kw = this.value.trim();
            if (kw) {
                state.currentKeyword = kw;
                state.currentCategory = "";
                state.currentType = "";
                state.currentPage = 1;
                state.isViewingHistory = false;
                state.isViewingFavorites = false;
                suggestionsBox.style.display = 'none';
                updateNavUI(null);
                loadData(false);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!document.querySelector('.search-container')?.contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    });
}

function restoreCurrentWatch() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const watchSlug = urlParams.get('watch') || urlParams.get('slug');
        const svParam = parseInt(urlParams.get('sv') || '0', 10);
        const epParam = parseInt(urlParams.get('ep') || '0', 10);

        if (watchSlug) {
            setTimeout(() => {
                playMovie(watchSlug, CONFIG.SOURCE_NAME, {
                    serverIndex: isNaN(svParam) ? 0 : svParam,
                    episodeIndex: isNaN(epParam) ? 0 : epParam
                });
            }, 200);
            return true;
        }

        const currentWatch = storage.get(CONFIG.STORAGE_KEYS.CURRENT_WATCH);
        if (currentWatch && currentWatch.slug) {
            setTimeout(() => {
                playMovie(currentWatch.slug, currentWatch.source || CONFIG.SOURCE_NAME, {
                    serverIndex: currentWatch.serverIndex || 0,
                    episodeIndex: currentWatch.episodeIndex || 0
                });
            }, 200);
            return true;
        }
    } catch(e) {}
    return false;
}

function setupPopstateListener() {
    window.addEventListener('popstate', () => {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const watchSlug = urlParams.get('watch') || urlParams.get('slug');
            const catParam = urlParams.get('cat') || '';
            const typeParam = urlParams.get('type') || '';
            const searchParam = urlParams.get('search') || '';

            if (watchSlug) {
                const sv = parseInt(urlParams.get('sv') || '0', 10);
                const ep = parseInt(urlParams.get('ep') || '0', 10);
                playMovie(watchSlug, CONFIG.SOURCE_NAME, { serverIndex: sv, episodeIndex: ep });
            } else {
                const modal = document.getElementById('videoModal');
                if (modal && modal.classList.contains('show')) {
                    hideModal();
                }
                if (searchParam) {
                    state.currentKeyword = searchParam;
                    loadData(false);
                } else if (typeParam) {
                    state.currentType = typeParam;
                    loadData(false);
                } else if (catParam) {
                    state.currentCategory = catParam;
                    loadData(false);
                } else {
                    resetToHome();
                }
            }
        } catch(e) {}
    });
}

function setupScrollEvents() {
    const header = document.getElementById('mainHeader');
    const topBtn = document.getElementById('backToTopBtn');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) header?.classList.add('scrolled');
        else header?.classList.remove('scrolled');

        if (window.scrollY > 400) {
            if (topBtn) topBtn.style.display = 'flex';
        } else {
            if (topBtn) topBtn.style.display = 'none';
        }

        if (!state.isViewingHistory && !state.isViewingFavorites && !state.isLoading && state.hasMoreData) {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 450) {
                state.currentPage++;
                loadData(true);
            }
        }
    });

    topBtn?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function setupEventListeners() {
    videoPlayer = document.getElementById('videoPlayer');
    plyrWrapper = document.getElementById('plyrWrapper');
    videoIframe = document.getElementById('videoIframe');

    document.querySelectorAll('.logo, #navHome').forEach(el => {
        el.addEventListener('click', resetToHome);
    });

    document.querySelector('.mobile-toggle')?.addEventListener('click', () => toggleMobileMenu(true));
    document.getElementById('mobileOverlay')?.addEventListener('click', () => toggleMobileMenu(false));
    document.getElementById('mobileCloseBtn')?.addEventListener('click', () => toggleMobileMenu(false));

    document.getElementById('navSingle')?.addEventListener('click', (e) => filterType('phim-le', e.currentTarget));
    document.getElementById('navSeries')?.addEventListener('click', (e) => filterType('phim-bo', e.currentTarget));
    document.getElementById('navAnime')?.addEventListener('click', (e) => filterType('hoat-hinh', e.currentTarget));
    document.getElementById('navFav')?.addEventListener('click', (e) => loadFavoritesView(e.currentTarget));
    document.getElementById('navHistory')?.addEventListener('click', (e) => loadHistoryView(e.currentTarget));

    document.querySelectorAll('#genreChips .chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const cat = e.currentTarget.getAttribute('data-category') || '';
            filterCategory(cat, e.currentTarget);
        });
    });

    document.getElementById('modalCloseBtn')?.addEventListener('click', closeVideo);
    document.getElementById('readMoreBtn')?.addEventListener('click', toggleDescription);
    document.getElementById('modalFavBtn')?.addEventListener('click', toggleCurrentModalFav);
    document.getElementById('modalShareBtn')?.addEventListener('click', shareCurrentEpisode);

    setupSearch();
    setupScrollEvents();
    setupPopstateListener();
}

function initApp() {
    checkAuth();
    setupEventListeners();

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const cat = urlParams.get('cat');
        const type = urlParams.get('type');
        const search = urlParams.get('search');

        if (search) {
            state.currentKeyword = search;
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = search;
        } else if (type) {
            state.currentType = type;
        } else if (cat) {
            state.currentCategory = cat;
        }
    } catch(e) {}

    loadData();
    restoreCurrentWatch();

    window.addEventListener('pageshow', () => {
        restoreCurrentWatch();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
