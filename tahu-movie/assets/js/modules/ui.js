import { CONFIG } from './config.js';
import { getSafeImageUrl } from './utils.js';
import { isFavorite, toggleFavorite } from './storage.js';
import { prefetchMovie } from './api.js';

// Tạo thẻ Movie Card trực quan
export function createMovieCard(movie, onCardClick, onFavToggleCallback) {
    const card = document.createElement('div');
    card.className = 'movie-card';
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

// Skeleton loading
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
