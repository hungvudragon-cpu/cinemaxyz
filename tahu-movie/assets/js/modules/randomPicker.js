import { fetchMovieList, fetchMovieDetail } from './api.js';
import { getTMDBDetails } from './tmdb.js';
import { playMovie } from './player.js';
import { showToast, getSafeImageUrl } from './utils.js';
import { CONFIG } from './config.js';

const GENRE_LIST = [
    { id: '', name: 'Mọi thể loại' },
    { id: 'hanh-dong', name: 'Hành Động' },
    { id: 'tinh-cam', name: 'Tình Cảm' },
    { id: 'hai-huoc', name: 'Hài Hước' },
    { id: 'kinh-di', name: 'Kinh Dị' },
    { id: 'phieu-luu', name: 'Phiêu Lưu' },
    { id: 'khoa-hoc-vien-tuong', name: 'Viễn Tưởng' },
    { id: 'hinh-su', name: 'Hình Sự' },
    { id: 'vo-thuat', name: 'Võ Thuật' },
    { id: 'hoat-hinh', name: 'Hoạt Hình' }
];

let randomModalEl = null;
let isRolling = false;

export function initRandomPicker() {
    createRandomModal();
}

function createRandomModal() {
    if (document.getElementById('randomPickerModal')) return;

    const modal = document.createElement('div');
    modal.id = 'randomPickerModal';
    modal.className = 'modal random-modal';
    modal.innerHTML = `
        <div class="modal-container random-modal-container">
            <button class="modal-close-btn" id="randomCloseBtn" aria-label="Đóng">&times;</button>
            <div class="random-header">
                <div class="random-title-badge">Hôm nay xem gì?</div>
                <h2 class="random-title">Xúc Xắc Chọn Phim Ngẫu Nhiên</h2>
                <p class="random-subtitle">Giải quyết nỗi khổ "lướt 30 phút không biết xem gì". Chọn gu và lắc xúc xắc ngay!</p>
            </div>

            <div class="random-genres" id="randomGenreSelect">
                ${GENRE_LIST.map(g => `
                    <button class="random-genre-chip ${g.id === '' ? 'active' : ''}" data-genre="${g.id}">
                        ${g.name}
                    </button>
                `).join('')}
            </div>

            <div class="random-action-box">
                <button id="rollDiceBtn" class="btn-dice-roll">
                    <svg class="dice-icon-3d" viewBox="0 0 32 32" fill="none">
                        <g transform="translate(16, 16)">
                            <polygon points="0,-14 13,-6.5 0,1 -13,-6.5" fill="url(#diceTopGrad)" stroke="#38bdf8" stroke-width="1.2" stroke-linejoin="round"/>
                            <polygon points="-13,-6.5 0,1 0,15 -13,7.5" fill="url(#diceLeftGrad)" stroke="#0284c7" stroke-width="1.2" stroke-linejoin="round"/>
                            <polygon points="0,1 13,-6.5 13,7.5 0,15" fill="url(#diceRightGrad)" stroke="#0369a1" stroke-width="1.2" stroke-linejoin="round"/>
                            <ellipse cx="0" cy="-6.5" rx="2" ry="1.2" fill="#ffffff"/>
                            <ellipse cx="-6.5" cy="-0.5" rx="1.2" ry="1.8" transform="rotate(-30 -6.5 -0.5)" fill="#e0f2fe"/>
                            <ellipse cx="-6.5" cy="8.5" rx="1.2" ry="1.8" transform="rotate(-30 -6.5 8.5)" fill="#e0f2fe"/>
                            <ellipse cx="6.5" cy="-0.5" rx="1.2" ry="1.8" transform="rotate(30 6.5 -0.5)" fill="#bae6fd"/>
                            <ellipse cx="6.5" cy="4" rx="1.2" ry="1.8" transform="rotate(30 6.5 4)" fill="#bae6fd"/>
                            <ellipse cx="6.5" cy="8.5" rx="1.2" ry="1.8" transform="rotate(30 6.5 8.5)" fill="#bae6fd"/>
                        </g>
                        <defs>
                            <linearGradient id="diceTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#38bdf8"/>
                                <stop offset="100%" stop-color="#0284c7"/>
                            </linearGradient>
                            <linearGradient id="diceLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#0284c7"/>
                                <stop offset="100%" stop-color="#0369a1"/>
                            </linearGradient>
                            <linearGradient id="diceRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#075985"/>
                                <stop offset="100%" stop-color="#0c4a6e"/>
                            </linearGradient>
                        </defs>
                    </svg>
                    <span class="dice-text">Lắc Xúc Xắc Chọn Phim</span>
                </button>
            </div>

            <div class="random-result-box" id="randomResultBox" style="display: none;">
                <div class="random-card" id="randomCard">
                    <!-- Thông tin phim được chèn vào đây -->
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    randomModalEl = modal;

    // Sự kiện đóng modal
    document.getElementById('randomCloseBtn')?.addEventListener('click', closeRandomModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeRandomModal();
    });

    // Sự kiện chọn thể loại
    modal.querySelectorAll('.random-genre-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            modal.querySelectorAll('.random-genre-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });

    // Sự kiện lắc xúc xắc
    document.getElementById('rollDiceBtn')?.addEventListener('click', handleRoll);
}

export function openRandomModal() {
    if (!randomModalEl) createRandomModal();
    randomModalEl.style.display = 'flex';
    setTimeout(() => randomModalEl.classList.add('show'), 10);
    document.body.style.overflow = 'hidden';
}

export function closeRandomModal() {
    if (!randomModalEl) return;
    randomModalEl.classList.remove('show');
    setTimeout(() => {
        randomModalEl.style.display = 'none';
        document.body.style.overflow = '';
    }, 300);
}

async function handleRoll() {
    if (isRolling) return;
    isRolling = true;

    const rollBtn = document.getElementById('rollDiceBtn');
    const resultBox = document.getElementById('randomResultBox');
    const cardEl = document.getElementById('randomCard');

    rollBtn.classList.add('rolling');
    rollBtn.querySelector('.dice-text').innerText = 'Đang quay ngẫu nhiên...';

    if (resultBox) resultBox.style.display = 'none';

    try {
        const activeChip = randomModalEl.querySelector('.random-genre-chip.active');
        const selectedGenre = activeChip ? activeChip.getAttribute('data-genre') : '';

        // Chọn trang ngẫu nhiên từ 1 đến 15
        const randomPage = Math.floor(Math.random() * 15) + 1;
        const typeParam = selectedGenre === 'hoat-hinh' ? 'hoat-hinh' : '';
        const catParam = selectedGenre !== 'hoat-hinh' ? selectedGenre : '';

        const movies = await fetchMovieList({
            type: typeParam,
            category: catParam,
            page: randomPage
        });

        if (!movies || movies.length === 0) {
            throw new Error('Không tìm thấy phim');
        }

        // Chọn ngẫu nhiên 1 phim trong danh sách trang đó
        const luckyMovie = movies[Math.floor(Math.random() * movies.length)];

        // Tải chi tiết và kiểm tra TMDB để lấy rating & backdrop đẹp chính xác
        const detailData = await fetchMovieDetail(luckyMovie.slug).catch(() => null);
        const movieItem = detailData?.movie || detailData?.item || luckyMovie;
        const tmdbData = await getTMDBDetails({
            title: movieItem.name || luckyMovie.name,
            originalTitle: movieItem.original_name || luckyMovie.original_name,
            year: movieItem.year || luckyMovie.year,
            tmdb: movieItem.tmdb || luckyMovie.tmdb,
            imdb: movieItem.imdb || luckyMovie.imdb,
            type: movieItem.type || luckyMovie.type
        }).catch(() => null);
        renderLuckyCard(cardEl, movieItem, tmdbData);

        setTimeout(() => {
            if (resultBox) {
                resultBox.style.display = 'block';
                resultBox.classList.add('fade-in');
            }
            rollBtn.classList.remove('rolling');
            rollBtn.querySelector('.dice-text').innerText = 'Lắc Lại Phim Khác';
            isRolling = false;
        }, 600);

    } catch (err) {
        console.error('Lỗi chọn phim ngẫu nhiên:', err);
        showToast('Không thể lấy danh sách phim lúc này. Hãy thử lại!');
        rollBtn.classList.remove('rolling');
        rollBtn.querySelector('.dice-text').innerText = 'Thử Lại';
        isRolling = false;
    }
}

function renderLuckyCard(container, movie, tmdb) {
    const posterUrl = tmdb?.posterHd || movie.poster_url || movie.thumb_url || movie.image || CONFIG.DEFAULT_THUMB;
    const backdrop = tmdb?.backdrop4k || movie.thumb_url || movie.poster_url || posterUrl;
    const rating = tmdb?.voteAverage ? `${tmdb.voteAverage}/10 TMDB` : `Phổ Biến`;
    const year = movie.year || (movie.created ? movie.created.substring(0, 4) : '2026');
    const quality = movie.quality || movie.episode_current || 'FHD';
    const lang = movie.lang || movie.language || 'Vietsub';
    const desc = tmdb?.overview || movie.description || movie.content || 'Một siêu phẩm điện ảnh dành riêng cho bạn hôm nay!';
    const cleanDesc = desc.replace(/<[^>]*>/g, '').slice(0, 190) + '...';

    container.innerHTML = `
        <div class="lucky-card-bg" style="background-image: url('${backdrop}')"></div>
        <div class="lucky-card-grid">
            <div class="lucky-poster-wrap" title="Nhấn để xem giới thiệu phim: ${movie.name}">
                <img class="lucky-poster-img" src="${posterUrl}" alt="${movie.name}" loading="lazy" onerror="this.onerror=null; this.src='${CONFIG.DEFAULT_THUMB}'">
                <span class="lucky-poster-badge">${quality}</span>
                <div class="lucky-poster-overlay">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="#ffffff"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                </div>
            </div>
            <div class="lucky-card-content">
                <div class="lucky-badge-row">
                    <span class="lucky-badge lucky-pill">${quality}</span>
                    <span class="lucky-badge">${year}</span>
                    <span class="lucky-badge">${lang}</span>
                    <span class="lucky-badge rating">⭐ ${rating}</span>
                </div>
                <h3 class="lucky-title">${movie.name}</h3>
                ${movie.original_name ? `<div class="lucky-orig-title">${movie.original_name}</div>` : ''}
                <p class="lucky-desc">${cleanDesc}</p>
                <div class="lucky-actions">
                    <button class="btn-primary lucky-play-btn" id="luckyPlayBtn">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                        <span>Xem Giới Thiệu Phim</span>
                    </button>
                    ${tmdb?.trailerYoutubeKey ? `
                        <button class="btn-secondary lucky-trailer-btn" id="luckyTrailerBtn" data-key="${tmdb.trailerYoutubeKey}">
                            <span>Xem Trailer</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    container.querySelector('#luckyPlayBtn')?.addEventListener('click', () => {
        closeRandomModal();
        playMovie(movie.slug, movie.source || CONFIG.SOURCE_NAME, null, false);
    });

    container.querySelector('.lucky-poster-wrap')?.addEventListener('click', () => {
        closeRandomModal();
        playMovie(movie.slug, movie.source || CONFIG.SOURCE_NAME, null, false);
    });

    container.querySelector('#luckyTrailerBtn')?.addEventListener('click', (e) => {
        const key = e.currentTarget.getAttribute('data-key');
        if (key) {
            window.open(`https://www.youtube.com/watch?v=${key}`, '_blank');
        }
    });
}
