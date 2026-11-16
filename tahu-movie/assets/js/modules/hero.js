import { getSafeImageUrl } from './utils.js';

let bannerMovies = [];
let currentBannerIndex = 0;
let bannerInterval = null;
let onPlayMovieCallback = null;

export function initHeroSlider(movies, onPlayMovie) {
    onPlayMovieCallback = onPlayMovie;
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

export function hideHeroBanner() {
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
        if (onPlayMovieCallback) onPlayMovieCallback(movie.slug, movie.source);
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
