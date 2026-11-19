import { CONFIG } from './config.js';
import { getSafeImageUrl } from './utils.js';
import { isFavorite, toggleFavorite } from './storage.js';
import { prefetchMovie } from './api.js';

// SVG Heart Helper
function getHeartSvg(isFav) {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#E50914' : 'none'}" stroke="${isFav ? '#E50914' : 'currentColor'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
    `;
}

// Tạo thẻ Movie Card trực quan chuẩn Netflix
export function createMovieCard(movie, onCardClick, onFavToggleCallback) {
    const card = document.createElement('div');
    card.className = 'movie-card netflix-card';
    const source = movie.source || CONFIG.SOURCE_NAME;

    // Prefetch khi hover
    card.addEventListener('mouseenter', () => prefetchMovie(movie.slug, source), { once: true });
    
    // Nhấp vào phim để xem
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
    const qualText = movie.quality || "HD";
    const isFav = isFavorite(movie.slug, source);

    card.innerHTML = `
        <div class="card-img-wrapper">
            <img src="${imgUrl}" alt="${movie.name}" loading="lazy" onerror="this.onerror=null; this.src='${CONFIG.DEFAULT_THUMB}'">
            <span class="card-top-badge">${episodeBadge}</span>
            <div class="card-hover-panel">
                <div class="card-hover-actions">
                    <button class="hover-circle-btn play-btn" title="Phát ngay" aria-label="Phát ngay">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                    </button>
                    <button class="hover-circle-btn fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Bỏ lưu' : 'Thêm vào danh sách'}" aria-label="Yêu thích">
                        ${getHeartSvg(isFav)}
                    </button>
                    <button class="hover-circle-btn info-btn" title="Xem chi tiết" aria-label="Chi tiết">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                </div>
                <div class="card-hover-meta">
                    <span class="netflix-match-mini">98% Phù hợp</span>
                    <span class="badge-age-mini">16+</span>
                    <span class="badge-qual-mini">${qualText}</span>
                </div>
                <div class="card-hover-genres">
                    <span>${yearText}</span>
                    <span>•</span>
                    <span>${movie.lang || 'Vietsub'}</span>
                </div>
            </div>
        </div>
        <div class="card-details">
            <div class="card-title" title="${movie.name}">${movie.name}</div>
            <div class="card-sub">${originalName || 'Đang cập nhật'}</div>
        </div>
    `;

    const favBtn = card.querySelector('.hover-circle-btn.fav-btn');
    if (favBtn) {
        favBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite({
                slug: movie.slug,
                source: source,
                name: movie.name,
                originalName: originalName,
                image: imgUrl,
                episode_current: episodeBadge
            }, favBtn, (isNowFav) => {
                favBtn.innerHTML = getHeartSvg(isNowFav);
                favBtn.classList.toggle('active', isNowFav);
                if (onFavToggleCallback) onFavToggleCallback(isNowFav);
            });
        };
    }

    return card;
}

// Tạo Horizontal Movie Rail Component chuẩn Netflix Slider
export function createMovieRailSection({ title, movies = [], onPlayMovie = null, onSeeAll = null }) {
    const section = document.createElement('div');
    section.className = 'movie-rail-section';

    section.innerHTML = `
        <div class="rail-header">
            <div class="rail-title-wrap" ${onSeeAll ? 'style="cursor:pointer;"' : ''}>
                <h3 class="rail-title">${title}</h3>
                ${onSeeAll ? `<span class="rail-explore-link">Khám phá tất cả <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>` : ''}
            </div>
        </div>
        <div class="rail-track-wrapper">
            <button class="netflix-slider-btn slider-prev" aria-label="Cuộn sang trái">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="movie-rail"></div>
            <button class="netflix-slider-btn slider-next" aria-label="Cuộn sang phải">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
    `;

    const rail = section.querySelector('.movie-rail');
    const prevBtn = section.querySelector('.slider-prev');
    const nextBtn = section.querySelector('.slider-next');
    const titleWrap = section.querySelector('.rail-title-wrap');

    movies.forEach(movie => {
        rail.appendChild(createMovieCard(movie, (m) => {
            if (onPlayMovie) onPlayMovie(m.slug, m.source);
        }));
    });

    prevBtn?.addEventListener('click', () => {
        const scrollAmount = rail.clientWidth * 0.8;
        rail.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    });

    nextBtn?.addEventListener('click', () => {
        const scrollAmount = rail.clientWidth * 0.8;
        rail.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    });

    if (titleWrap && onSeeAll) {
        titleWrap.addEventListener('click', onSeeAll);
    }

    return section;
}

// Skeleton shimmer loading chuẩn Netflix
export function showSkeleton() {
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

export function hideSkeleton() {
    const container = document.getElementById('skeletonContainer');
    if (container) container.style.display = 'none';
}

export function renderMovieCards(container, movies, isAppend = false, onPlayMovie = null) {
    if (!container) return;
    if (!isAppend) container.innerHTML = '';
    movies.forEach(movie => {
        container.appendChild(createMovieCard(movie, (m) => {
            if (onPlayMovie) onPlayMovie(m.slug, m.source);
        }));
    });
}

export function renderSkeleton(container, count = 10) {
    if (!container) return;
    showSkeleton();
}

export function updateSectionTitle(title, actionHtml = '') {
    const titleEl = document.getElementById('currentSectionTitle');
    const actionEl = document.getElementById('sectionActionArea');
    if (titleEl) titleEl.innerText = title;
    if (actionEl) actionEl.innerHTML = actionHtml;
}

export function toggleMobileMenu(open) {
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
