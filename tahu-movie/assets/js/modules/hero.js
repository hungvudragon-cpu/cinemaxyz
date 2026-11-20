import { getSafeImageUrl } from './utils.js';
import { getTMDBDetails } from './tmdb.js';

let bannerMovies = [];
let currentBannerIndex = 0;
let bannerInterval = null;
let onPlayMovieCallback = null;
let activeBackdropLayer = 'A'; // 'A' or 'B'

export function initHeroSlider(movies, onPlayMovie) {
    onPlayMovieCallback = onPlayMovie;
    bannerMovies = movies.slice(0, 6);
    currentBannerIndex = 0;
    activeBackdropLayer = 'A';

    const banner = document.getElementById('heroBanner');
    if (!banner) return;
    banner.style.display = 'flex';
    document.body.classList.add('hero-active-page');

    const dotsContainer = document.getElementById('heroDots');
    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        bannerMovies.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('role', 'tab');
            dot.setAttribute('aria-label', `Banner slide ${i + 1}`);
            dot.onclick = () => {
                currentBannerIndex = i;
                updateHeroBannerDisplay(currentBannerIndex);
                resetBannerInterval();
            };
            dotsContainer.appendChild(dot);
        });
    }

    updateHeroBannerDisplay(currentBannerIndex);
    resetBannerInterval();
    setupBannerEvents(banner);
}

export function hideHeroBanner() {
    if (bannerInterval) clearInterval(bannerInterval);
    const banner = document.getElementById('heroBanner');
    if (banner) banner.style.display = 'none';
    document.body.classList.remove('hero-active-page');
}

async function updateHeroBannerDisplay(index) {
    if (!bannerMovies[index]) return;
    const movie = bannerMovies[index];
    const content = document.querySelector('.hero-content');
    
    if (content) {
        content.classList.remove('animate-in');
        void content.offsetWidth; // trigger reflow
        content.classList.add('animate-in');
    }

    document.getElementById('heroTitle').innerText = movie.name;
    document.getElementById('heroDesc').innerText = movie.bannerDesc || "Đang tải tóm tắt phim...";
    
    const bgUrl = movie.bannerBg || getSafeImageUrl(movie);
    
    // Cross-fade mượt mà giữa 2 backdrop layer (A và B)
    const layerA = document.getElementById('heroBackdropA');
    const layerB = document.getElementById('heroBackdropB');

    if (layerA && layerB) {
        if (activeBackdropLayer === 'A') {
            // Đang ở A, nạp sang B và kích hoạt B
            layerB.style.backgroundImage = `url('${bgUrl}')`;
            layerB.classList.add('active');
            layerA.classList.remove('active');
            activeBackdropLayer = 'B';
        } else {
            // Đang ở B, nạp sang A và kích hoạt A
            layerA.style.backgroundImage = `url('${bgUrl}')`;
            layerA.classList.add('active');
            layerB.classList.remove('active');
            activeBackdropLayer = 'A';
        }
    }
    
    const qualEl = document.getElementById('heroBadgeQuality');
    if (qualEl) qualEl.innerText = movie.quality || "FHD";
    
    const yearEl = document.getElementById('heroYear');
    if (yearEl) yearEl.innerText = movie.year || "2026";
    
    const langEl = document.getElementById('heroLang');
    if (langEl) langEl.innerText = movie.lang || movie.language || "Vietsub";

    const playAction = (autoPlay = false) => {
        if (onPlayMovieCallback) onPlayMovieCallback(movie.slug, movie.source, autoPlay);
    };

    const playBtn = document.getElementById('heroPlayBtn');
    if (playBtn) playBtn.onclick = () => playAction(false);

    const infoBtn = document.getElementById('heroInfoBtn');
    if (infoBtn) infoBtn.onclick = () => playAction(false);

    document.querySelectorAll('.dot').forEach((d, i) => {
        d.classList.toggle('active', i === index);
        d.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });

    if (!movie.detailFetched) {
        try {
            const res = await fetch(`https://phim.nguonc.com/api/film/${movie.slug}`);
            const data = await res.json();
            const detail = data.movie || data.item || {};
            let betterImg = detail.poster_url || detail.thumb_url || bgUrl;
            
            // Tìm ảnh backdrop 4K từ TMDB để Hero Banner hiển thị sắc nét nhất
            try {
                const tmdb = await getTMDBDetails({
                    title: movie.name,
                    originalTitle: detail.original_name || movie.original_name,
                    year: movie.year,
                    tmdb: detail.tmdb || movie.tmdb,
                    imdb: detail.imdb || movie.imdb,
                    type: detail.type || movie.type
                });
                if (tmdb?.backdrop4k) {
                    betterImg = tmdb.backdrop4k;
                }
            } catch (err) {}
            
            const tmp = document.createElement("div");
            tmp.innerHTML = detail.content || detail.description || "Chưa có thông tin mô tả cho bộ phim này.";
            movie.bannerBg = betterImg;
            movie.bannerDesc = tmp.textContent || tmp.innerText || "";
            movie.detailFetched = true;

            if (currentBannerIndex === index) {
                const activeLayerEl = activeBackdropLayer === 'A' ? layerA : layerB;
                if (activeLayerEl) activeLayerEl.style.backgroundImage = `url('${betterImg}')`;
                const descEl = document.getElementById('heroDesc');
                if (descEl) descEl.innerText = movie.bannerDesc;
            }
        } catch(e) {
            movie.bannerDesc = "Bộ phim đặc sắc với nội dung hấp dẫn chuẩn điện ảnh.";
            movie.detailFetched = true;
        }
    }
}

function resetBannerInterval() {
    if (bannerInterval) clearInterval(bannerInterval);
    bannerInterval = setInterval(() => {
        currentBannerIndex = (currentBannerIndex + 1) % bannerMovies.length;
        updateHeroBannerDisplay(currentBannerIndex);
    }, 7000);
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
