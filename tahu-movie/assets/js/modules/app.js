import { CONFIG } from './config.js';
import { storage, showToast, startTransition, endTransition, updateURLParams } from './utils.js';
import { fetchMovieList, searchMovies } from './api.js';
import { renderMovieCards, renderSkeleton, updateSectionTitle, toggleMobileMenu } from './ui.js';
import { initHeroSlider, hideHeroBanner } from './hero.js';
import { playMovie, closeVideo, toggleDescription, toggleCurrentModalFav, shareCurrentEpisode } from './player.js';
import { getFavorites, getHistory, clearHistory, removeHistoryItem } from './storage.js';
import { initRandomPicker, openRandomModal } from './randomPicker.js';

// State quản lý toàn bộ trang
export const state = {
    currentPage: 1,
    currentKeyword: "",
    currentCategory: "",
    currentType: "",
    isViewingHistory: false,
    isViewingFavorites: false,
    isLoading: false,
    hasMoreData: true
};

// Hàm kích hoạt tìm kiếm phim từ thẻ phim tương tự TMDB hoặc bên ngoài
window.triggerSearchMovie = function(movieTitle) {
    closeVideo();
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = movieTitle;
    state.currentKeyword = movieTitle;
    state.currentCategory = "";
    state.currentType = "";
    state.currentPage = 1;
    state.hasMoreData = true;
    updateURLParams({ search: movieTitle, cat: null, type: null });
    loadData();
};

export async function loadData(isAppend = false) {
    if (state.isLoading) return;
    state.isLoading = true;

    const movieGrid = document.getElementById('movie-grid');
    const skeleton = document.getElementById('skeletonContainer');
    const endIndicator = document.getElementById('endOfListIndicator');

    if (!isAppend) {
        startTransition();
        movieGrid.innerHTML = '';
        renderSkeleton(skeleton, 10);
        if (endIndicator) endIndicator.style.display = 'none';
    }

    try {
        let movies = [];

        if (state.currentKeyword !== "") {
            hideHeroBanner();
            movies = await searchMovies(state.currentKeyword, state.currentPage);
            updateSectionTitle(`Kết quả tìm kiếm cho: "${state.currentKeyword}"`);
        } else if (state.currentType !== "") {
            hideHeroBanner();
            movies = await fetchMovieList({ type: state.currentType, page: state.currentPage });
            const titleMap = {
                'phim-le': 'Danh Sách Phim Lẻ',
                'phim-bo': 'Danh Sách Phim Bộ',
                'hoat-hinh': 'Kho Phim Hoạt Hình - Anime'
            };
            updateSectionTitle(titleMap[state.currentType] || 'Danh Sách Phim');
        } else if (state.currentCategory !== "") {
            hideHeroBanner();
            movies = await fetchMovieList({ category: state.currentCategory, page: state.currentPage });
            const chip = document.querySelector(`.chip[data-category="${state.currentCategory}"]`);
            const catName = chip ? chip.innerText : state.currentCategory;
            updateSectionTitle(`Thể Loại: ${catName}`);
        } else {
            // Trang chủ
            movies = await fetchMovieList({ page: state.currentPage });
            updateSectionTitle('Phim Mới Cập Nhật');
            if (state.currentPage === 1 && movies.length > 0) {
                initHeroSlider(movies, (slug, source) => playMovie(slug, source));
            }
        }

        if (skeleton) skeleton.innerHTML = '';

        if (!movies || movies.length === 0) {
            state.hasMoreData = false;
            if (isAppend) {
                if (endIndicator) endIndicator.style.display = 'block';
            } else {
                movieGrid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <span class="empty-icon">🎬</span>
                        <h3>Không tìm thấy phim phù hợp</h3>
                        <p>Thử tìm kiếm với từ khóa khác hoặc quay lại trang chủ.</p>
                        <button class="btn-primary" style="margin: 16px auto 0;" id="emptyHomeBtn">Về Trang Chủ</button>
                    </div>
                `;
                document.getElementById('emptyHomeBtn')?.addEventListener('click', resetToHome);
            }
        } else {
            renderMovieCards(movieGrid, movies, isAppend, (slug, source) => playMovie(slug, source));
            if (movies.length < 10) {
                state.hasMoreData = false;
                if (endIndicator) endIndicator.style.display = 'block';
            }
        }

        if (!isAppend) endTransition();
    } catch (err) {
        console.error('Lỗi tải dữ liệu phim:', err);
        if (skeleton) skeleton.innerHTML = '';
        if (!isAppend) {
            movieGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <span class="empty-icon">⚠️</span>
                    <h3>Có lỗi xảy ra khi kết nối máy chủ</h3>
                    <p>Vui lòng kiểm tra lại đường truyền mạng hoặc thử tải lại.</p>
                    <button class="btn-primary" style="margin: 16px auto 0;" id="retryBtn">Thử Lại</button>
                </div>
            `;
            document.getElementById('retryBtn')?.addEventListener('click', () => loadData(false));
            endTransition();
        }
    } finally {
        state.isLoading = false;
    }
}

export function resetToHome() {
    state.currentKeyword = "";
    state.currentCategory = "";
    state.currentType = "";
    state.currentPage = 1;
    state.isViewingFavorites = false;
    state.isViewingHistory = false;
    state.hasMoreData = true;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = "";
    document.getElementById('searchResultsBox')?.classList.remove('show');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('navHome')?.classList.add('active');

    document.querySelectorAll('#genreChips .chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-category') === '');
    });

    updateURLParams({ search: null, cat: null, type: null });
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function filterType(type, element) {
    state.currentType = type;
    state.currentCategory = "";
    state.currentKeyword = "";
    state.currentPage = 1;
    state.isViewingFavorites = false;
    state.isViewingHistory = false;
    state.hasMoreData = true;

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (element) element.classList.add('active');

    document.querySelectorAll('#genreChips .chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-category') === '');
    });

    updateURLParams({ type: type, cat: null, search: null });
    loadData();
}

export function filterCategory(category, element) {
    state.currentCategory = category;
    state.currentType = "";
    state.currentKeyword = "";
    state.currentPage = 1;
    state.isViewingFavorites = false;
    state.isViewingHistory = false;
    state.hasMoreData = true;

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#genreChips .chip').forEach(c => c.classList.remove('active'));
    if (element) element.classList.add('active');

    updateURLParams({ cat: category || null, type: null, search: null });
    loadData();
}

export function loadFavoritesView(element) {
    state.isViewingFavorites = true;
    state.isViewingHistory = false;
    state.currentKeyword = "";
    state.currentType = "";
    state.currentCategory = "";
    state.hasMoreData = false;

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (element) element.classList.add('active');
    hideHeroBanner();

    updateSectionTitle('Danh Sách Phim Yêu Thích');
    const movieGrid = document.getElementById('movie-grid');
    const favs = getFavorites();

    if (favs.length === 0) {
        movieGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <span class="empty-icon">🤍</span>
                <h3>Chưa có phim yêu thích</h3>
                <p>Nhấp vào biểu tượng trái tim ở từng phim để lưu lại danh sách xem sau.</p>
                <button class="btn-primary" style="margin: 16px auto 0;" id="emptyFavHomeBtn">Khám Phá Phim Ngay</button>
            </div>
        `;
        document.getElementById('emptyFavHomeBtn')?.addEventListener('click', resetToHome);
    } else {
        renderMovieCards(movieGrid, favs, false, (slug, source) => playMovie(slug, source));
    }
}

export function loadHistoryView(element) {
    state.isViewingHistory = true;
    state.isViewingFavorites = false;
    state.currentKeyword = "";
    state.currentType = "";
    state.currentCategory = "";
    state.hasMoreData = false;

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (element) element.classList.add('active');
    hideHeroBanner();

    updateSectionTitle('Lịch Sử Xem Phim', `
        <button class="btn-secondary" id="clearHistoryBtn" style="padding: 6px 14px; font-size: 12.5px;">
            <span>🗑️</span> Xóa toàn bộ lịch sử
        </button>
    `);

    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử xem phim?')) {
            clearHistory();
            loadHistoryView(element);
            showToast('🗑️ Đã xóa sạch lịch sử xem phim');
        }
    });

    const movieGrid = document.getElementById('movie-grid');
    const history = getHistory();

    if (history.length === 0) {
        movieGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <span class="empty-icon">🕒</span>
                <h3>Lịch sử xem trống</h3>
                <p>Các bộ phim bạn đã xem sẽ tự động được ghi nhớ tại đây.</p>
                <button class="btn-primary" style="margin: 16px auto 0;" id="emptyHistHomeBtn">Xem Phim Ngay</button>
            </div>
        `;
        document.getElementById('emptyHistHomeBtn')?.addEventListener('click', resetToHome);
    } else {
        renderMovieCards(movieGrid, history, false, (slug, source) => playMovie(slug, source));
    }
}

function setupSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    const resultsBox = document.getElementById('searchResultsBox');

    let debounceTimer = null;

    input?.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        clearBtn.style.display = val ? 'block' : 'none';

        if (debounceTimer) clearTimeout(debounceTimer);
        if (!val) {
            resultsBox.classList.remove('show');
            resultsBox.innerHTML = '';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const results = await searchMovies(val, 1, 6);
                if (results.length > 0) {
                    resultsBox.innerHTML = results.map(m => `
                        <div class="search-result-item" data-slug="${m.slug}">
                            <img class="search-item-thumb" src="${m.thumb_url || m.poster_url || CONFIG.DEFAULT_THUMB}" alt="${m.name}" onerror="this.src='${CONFIG.DEFAULT_THUMB}'">
                            <div class="search-item-info">
                                <div class="search-item-title">${m.name}</div>
                                <div class="search-item-meta">${m.year || '2024'} • ${m.quality || m.episode_current || 'HD'}</div>
                            </div>
                        </div>
                    `).join('');
                    resultsBox.classList.add('show');

                    resultsBox.querySelectorAll('.search-result-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const slug = item.getAttribute('data-slug');
                            resultsBox.classList.remove('show');
                            playMovie(slug);
                        });
                    });
                } else {
                    resultsBox.innerHTML = `<div style="padding: 14px; text-align: center; color: var(--text-sub); font-size: 13px;">Không tìm thấy phim phù hợp</div>`;
                    resultsBox.classList.add('show');
                }
            } catch(e) {}
        }, 350);
    });

    clearBtn?.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        resultsBox.classList.remove('show');
        resetToHome();
    });

    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = input.value.trim();
            if (val) {
                resultsBox.classList.remove('show');
                state.currentKeyword = val;
                state.currentPage = 1;
                state.hasMoreData = true;
                updateURLParams({ search: val, cat: null, type: null });
                loadData();
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            resultsBox?.classList.remove('show');
        }
    });
}

function setupScrollEvents() {
    const topBtn = document.getElementById('backToTopBtn');
    const header = document.getElementById('mainHeader');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 80) {
            header?.classList.add('scrolled');
        } else {
            header?.classList.remove('scrolled');
        }

        if (window.scrollY > 400) {
            if (topBtn) topBtn.style.display = 'flex';
        } else {
            if (topBtn) topBtn.style.display = 'none';
        }

        // Infinite scroll tải thêm trang
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

    // Nút mở modal "Hôm nay xem gì?"
    document.getElementById('navRandomPicker')?.addEventListener('click', openRandomModal);
    document.getElementById('randomDiceQuickBtn')?.addEventListener('click', openRandomModal);

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
}

function restoreCurrentWatch() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const watchSlug = urlParams.get('watch');
        if (watchSlug) {
            const sv = parseInt(urlParams.get('sv')) || 0;
            const ep = parseInt(urlParams.get('ep')) || 0;
            playMovie(watchSlug, CONFIG.SOURCE_NAME, { serverIndex: sv, episodeIndex: ep });
            return;
        }

        const savedWatch = storage.get(CONFIG.STORAGE_KEYS.CURRENT_WATCH);
        if (savedWatch && savedWatch.slug) {
            playMovie(savedWatch.slug, savedWatch.source, savedWatch);
        }
    } catch(e) {}
}

function initApp() {
    initRandomPicker();
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
