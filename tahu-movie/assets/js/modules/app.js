import { CONFIG } from './config.js';
import { storage, showToast, startTransition, endTransition, updateURLParams } from './utils.js';
import { fetchMovieList, searchMovies } from './api.js';
import { renderMovieCards, createMovieRailSection, renderSkeleton, updateSectionTitle, toggleMobileMenu } from './ui.js';
import { initHeroSlider, hideHeroBanner } from './hero.js';
import { playMovie, closeVideo, toggleDescription, toggleCurrentModalFav, shareCurrentEpisode } from './player.js';
import { getFavorites, getHistory, clearHistory, removeHistoryItem } from './storage.js';
import { initRandomPicker, openRandomModal } from './randomPicker.js';
import { hybridSearchService } from './hybridSearch.js';
import { highlightMatch, correctQueryTypos } from './smartSearch.js';

// Các từ khóa thịnh hành gợi ý khi tìm kiếm
const TRENDING_KEYWORDS = [
    'Dragon Ball Super',
    'One Piece',
    'Thám Tử Conan',
    'Doraemon',
    'Avatar',
    'Kimetsu no Yaiba',
    'Jujutsu Kaisen',
    'Spider-Man'
];

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

// Đồng bộ class active cho cả Desktop Header Nav và Mobile Bottom Nav
function syncNavActive(activeId) {
    document.querySelectorAll('.nav-btn, .mobile-bottom-btn').forEach(b => b.classList.remove('active'));
    if (activeId) {
        document.getElementById(activeId)?.classList.add('active');
        const map = {
            'navHome': 'bnavHome',
            'navSeries': 'bnavSeries',
            'navSingle': 'bnavSingle',
            'navFav': 'bnavFav',
            'bnavHome': 'navHome',
            'bnavSeries': 'navSeries',
            'bnavSingle': 'navSingle',
            'bnavFav': 'navFav'
        };
        const peer = map[activeId];
        if (peer) document.getElementById(peer)?.classList.add('active');
    }
}

// Kích hoạt tìm kiếm phim từ thẻ phim tương tự TMDB hoặc bên ngoài
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
    const railsContainer = document.getElementById('railsContainer');
    const skeleton = document.getElementById('skeletonContainer');
    const endIndicator = document.getElementById('endOfListIndicator');

    const isHomePage = (
        state.currentKeyword === "" &&
        state.currentType === "" &&
        state.currentCategory === "" &&
        !state.isViewingFavorites &&
        !state.isViewingHistory &&
        state.currentPage === 1
    );

    if (!isAppend) {
        startTransition();
        movieGrid.classList.remove('view-enter');
        movieGrid.classList.add('view-transitioning');
        if (railsContainer) {
            railsContainer.classList.remove('view-enter');
            railsContainer.classList.add('view-transitioning');
        }
        movieGrid.innerHTML = '';
        if (railsContainer) railsContainer.innerHTML = '';
        renderSkeleton(skeleton, 10);
        if (endIndicator) endIndicator.style.display = 'none';
    }

    try {
        let movies = [];

        if (state.currentKeyword !== "") {
            hideHeroBanner();
            if (railsContainer) railsContainer.style.display = 'none';
            movieGrid.style.display = 'grid';
            movies = await searchMovies(state.currentKeyword, state.currentPage);

            const typoCheck = correctQueryTypos(state.currentKeyword);
            let actionHtml = '';
            if (typoCheck.hasTypo && typoCheck.suggestion) {
                actionHtml = `
                    <div class="search-typo-indicator">
                        <span>Đã tự động sửa từ khóa sang: <strong>"${typoCheck.suggestion}"</strong></span>
                    </div>
                `;
            }
            updateSectionTitle(`Kết quả tìm kiếm cho: "${state.currentKeyword}"`, actionHtml);
        } else if (state.currentType !== "") {
            hideHeroBanner();
            if (railsContainer) railsContainer.style.display = 'none';
            movieGrid.style.display = 'grid';
            movies = await fetchMovieList({ type: state.currentType, page: state.currentPage });
            const titleMap = {
                'phim-le': 'Danh Sách Phim Lẻ',
                'phim-bo': 'Danh Sách Phim Bộ',
                'hoat-hinh': 'Kho Phim Hoạt Hình - Anime'
            };
            updateSectionTitle(titleMap[state.currentType] || 'Danh Sách Phim');
        } else if (state.currentCategory !== "") {
            hideHeroBanner();
            if (railsContainer) railsContainer.style.display = 'none';
            movieGrid.style.display = 'grid';
            movies = await fetchMovieList({ category: state.currentCategory, page: state.currentPage });
            const chip = document.querySelector(`.chip[data-category="${state.currentCategory}"]`);
            const catName = chip ? chip.innerText : state.currentCategory;
            updateSectionTitle(`Thể Loại: ${catName}`);
        } else {
            // Trang chủ: Cinematic Rails Layout
            movies = await fetchMovieList({ page: state.currentPage });
            updateSectionTitle('Khám Phá Điện Ảnh');

            if (isHomePage) {
                if (movies.length > 0) {
                    initHeroSlider(movies, (slug, source) => playMovie(slug, source));
                }

                if (railsContainer) {
                    railsContainer.style.display = 'flex';
                    movieGrid.style.display = 'none';
                    railsContainer.innerHTML = '';

                    // Rail 1: Phim mới cập nhật
                    const railLatest = createMovieRailSection({
                        title: 'Phim Mới Cập Nhật',
                        movies: movies.slice(0, 14),
                        onPlayMovie: (slug, source) => playMovie(slug, source)
                    });
                    railsContainer.appendChild(railLatest);

                    // Tải bất đồng bộ thêm 3 Rails cho Trang chủ: Phim Bộ, Phim Lẻ, Hoạt Hình
                    Promise.all([
                        fetchMovieList({ type: 'phim-bo', page: 1 }).catch(() => []),
                        fetchMovieList({ type: 'phim-le', page: 1 }).catch(() => []),
                        fetchMovieList({ type: 'hoat-hinh', page: 1 }).catch(() => [])
                    ]).then(([seriesList, singlesList, animeList]) => {
                        if (seriesList.length > 0) {
                            railsContainer.appendChild(createMovieRailSection({
                                title: 'Phim Bộ Đang Thịnh Hành',
                                movies: seriesList.slice(0, 14),
                                onPlayMovie: (slug, source) => playMovie(slug, source),
                                onSeeAll: () => filterType('phim-bo', document.getElementById('navSeries'))
                            }));
                        }
                        if (singlesList.length > 0) {
                            railsContainer.appendChild(createMovieRailSection({
                                title: 'Phim Lẻ Đỉnh Cao',
                                movies: singlesList.slice(0, 14),
                                onPlayMovie: (slug, source) => playMovie(slug, source),
                                onSeeAll: () => filterType('phim-le', document.getElementById('navSingle'))
                            }));
                        }
                        if (animeList.length > 0) {
                            railsContainer.appendChild(createMovieRailSection({
                                title: 'Thế Giới Anime & Hoạt Hình',
                                movies: animeList.slice(0, 14),
                                onPlayMovie: (slug, source) => playMovie(slug, source),
                                onSeeAll: () => filterType('hoat-hinh', document.getElementById('navAnime'))
                            }));
                        }
                    });
                }
            } else {
                if (railsContainer) railsContainer.style.display = 'none';
                movieGrid.style.display = 'grid';
            }
        }

        if (skeleton) skeleton.innerHTML = '';

        if (!movies || movies.length === 0) {
            state.hasMoreData = false;
            if (isAppend) {
                if (endIndicator) endIndicator.style.display = 'flex';
            } else if (!isHomePage) {
                movieGrid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <h3>Không tìm thấy phim phù hợp</h3>
                        <p>Thử tìm kiếm với một trong các từ khóa thịnh hành gợi ý dưới đây:</p>
                        <div class="empty-trending-tags">
                            ${TRENDING_KEYWORDS.map(kw => `
                                <button class="empty-tag-btn" data-search="${kw}">${kw}</button>
                            `).join('')}
                        </div>
                        <button class="btn-primary" style="margin: 20px auto 0;" id="emptyHomeBtn">Về Trang Chủ</button>
                    </div>
                `;
                document.getElementById('emptyHomeBtn')?.addEventListener('click', resetToHome);
                movieGrid.querySelectorAll('.empty-tag-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const kw = btn.getAttribute('data-search');
                        window.triggerSearchMovie(kw);
                    });
                });
            }
        } else if (!isHomePage) {
            renderMovieCards(movieGrid, movies, isAppend, (slug, source) => playMovie(slug, source));
            if (movies.length < 10) {
                state.hasMoreData = false;
                if (endIndicator) endIndicator.style.display = 'flex';
            }
        }

        if (!isAppend) {
            setTimeout(() => {
                movieGrid.classList.remove('view-transitioning');
                movieGrid.classList.add('view-enter');
                if (railsContainer) {
                    railsContainer.classList.remove('view-transitioning');
                    railsContainer.classList.add('view-enter');
                }
            }, 50);
            endTransition();
        }
    } catch (err) {
        console.error('Lỗi tải dữ liệu phim:', err);
        if (skeleton) skeleton.innerHTML = '';
        if (!isAppend) {
            movieGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
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

    syncNavActive('navHome');

    document.querySelectorAll('#genreChips .chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-category') === '');
    });

    updateURLParams({ search: null, cat: null, type: null });
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterCategory(category, targetChip) {
    state.currentCategory = category;
    state.currentKeyword = "";
    state.currentType = "";
    state.currentPage = 1;
    state.isViewingFavorites = false;
    state.isViewingHistory = false;
    state.hasMoreData = true;

    document.querySelectorAll('#genreChips .chip').forEach(c => c.classList.remove('active'));
    if (targetChip) targetChip.classList.add('active');

    syncNavActive(null);
    updateURLParams({ cat: category || null, search: null, type: null });
    loadData();
}

function filterType(type, targetNav) {
    state.currentType = type;
    state.currentKeyword = "";
    state.currentCategory = "";
    state.currentPage = 1;
    state.isViewingFavorites = false;
    state.isViewingHistory = false;
    state.hasMoreData = true;

    syncNavActive(targetNav?.id);

    document.querySelectorAll('#genreChips .chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-category') === '');
    });

    updateURLParams({ type: type, cat: null, search: null });
    loadData();
}

function loadFavoritesView(targetNav) {
    state.isViewingFavorites = true;
    state.isViewingHistory = false;
    state.currentKeyword = "";
    state.currentCategory = "";
    state.currentType = "";
    state.hasMoreData = false;

    syncNavActive(targetNav?.id);
    hideHeroBanner();

    const railsContainer = document.getElementById('railsContainer');
    if (railsContainer) railsContainer.style.display = 'none';

    updateSectionTitle('Phim Yêu Thích Của Bạn');

    const movieGrid = document.getElementById('movie-grid');
    movieGrid.style.display = 'grid';
    const favs = getFavorites();

    if (favs.length === 0) {
        movieGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <h3>Danh sách yêu thích trống</h3>
                <p>Bạn chưa lưu bộ phim nào. Hãy bấm biểu tượng trái tim để lưu lại phim bạn thích!</p>
                <button class="btn-primary" style="margin: 16px auto 0;" id="emptyFavHomeBtn">Khám Phá Phim</button>
            </div>
        `;
        document.getElementById('emptyFavHomeBtn')?.addEventListener('click', resetToHome);
    } else {
        renderMovieCards(movieGrid, favs, false, (slug, source) => playMovie(slug, source));
    }
}

function loadHistoryView(targetNav) {
    state.isViewingHistory = true;
    state.isViewingFavorites = false;
    state.currentKeyword = "";
    state.currentCategory = "";
    state.currentType = "";
    state.hasMoreData = false;

    syncNavActive(targetNav?.id);
    hideHeroBanner();

    const railsContainer = document.getElementById('railsContainer');
    if (railsContainer) railsContainer.style.display = 'none';

    updateSectionTitle('Lịch Sử Xem Gần Đây', `
        <button id="clearHistoryBtn" class="action-pill" style="font-size: 13px;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>Xóa toàn bộ lịch sử</span>
        </button>
    `);

    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử xem phim?')) {
            clearHistory();
            loadHistoryView(targetNav);
        }
    });

    const movieGrid = document.getElementById('movie-grid');
    movieGrid.style.display = 'grid';
    const history = getHistory();

    if (history.length === 0) {
        movieGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
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
    if (!input || !resultsBox) return;

    let debounceTimer = null;
    let selectedIndex = -1;

    const renderRecentSearches = () => {
        const recents = hybridSearchService.loadRecentSearches();
        selectedIndex = -1;

        let html = '';

        if (recents.length > 0) {
            html += `
                <div class="search-group-header">
                    <span>Tìm kiếm gần đây</span>
                    <button class="recent-delete-btn" id="clearAllSearchHistory" style="cursor:pointer; font-size:11px; color:var(--text-muted); background:none; border:none;">Xóa tất cả</button>
                </div>
                ${recents.map((item, idx) => `
                    <div class="recent-item" data-keyword="${item.replace(/"/g, '&quot;')}" data-index="${idx}">
                        <div class="recent-item-left">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span>${item}</span>
                        </div>
                        <button class="recent-delete-btn" data-remove="${item.replace(/"/g, '&quot;')}" title="Xóa">&times;</button>
                    </div>
                `).join('')}
            `;
        }

        // Luôn hiển thị Từ Khóa Thịnh Hành
        html += `
            <div class="search-group-header">
                <span>🔥 Từ khóa thịnh hành</span>
            </div>
            <div class="search-trending-pills">
                ${TRENDING_KEYWORDS.map(kw => `
                    <button class="search-trend-chip" data-trend="${kw}">${kw}</button>
                `).join('')}
            </div>
        `;

        resultsBox.innerHTML = html;
        resultsBox.classList.add('show');

        resultsBox.querySelectorAll('.recent-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                if (e.target.closest('.recent-delete-btn')) return;
                const kw = el.getAttribute('data-keyword');
                input.value = kw;
                clearBtn.style.display = 'flex';
                hybridSearchService.saveRecentSearch(kw);
                triggerMainSearch(kw);
            });
        });

        resultsBox.querySelectorAll('.search-trend-chip').forEach(chip => {
            chip.addEventListener('mousedown', () => {
                const kw = chip.getAttribute('data-trend');
                input.value = kw;
                clearBtn.style.display = 'flex';
                hybridSearchService.saveRecentSearch(kw);
                triggerMainSearch(kw);
            });
        });

        resultsBox.querySelectorAll('.recent-delete-btn[data-remove]').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const kw = btn.getAttribute('data-remove');
                hybridSearchService.removeRecentSearch(kw);
                renderRecentSearches();
            });
        });

        document.getElementById('clearAllSearchHistory')?.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            hybridSearchService.clearRecentSearches();
            renderRecentSearches();
        });
    };

    const renderSearchResults = ({ items, didYouMean, isPendingApi, query }) => {
        selectedIndex = -1;

        if (!items || items.length === 0) {
            if (isPendingApi) {
                resultsBox.innerHTML = `
                    <div class="search-status-bar">
                        <div class="search-spinner"></div>
                        <span>Đang tìm kiếm thông minh...</span>
                    </div>
                `;
                resultsBox.classList.add('show');
                return;
            }

            resultsBox.innerHTML = `
                <div class="search-status-bar">
                    <span>Không tìm thấy phim phù hợp với "<strong>${query}</strong>"</span>
                </div>
                <div class="search-group-header">
                    <span>💡 Gợi ý từ khóa thịnh hành</span>
                </div>
                <div class="search-trending-pills">
                    ${TRENDING_KEYWORDS.map(kw => `
                        <button class="search-trend-chip" data-trend="${kw}">${kw}</button>
                    `).join('')}
                </div>
            `;
            resultsBox.classList.add('show');

            resultsBox.querySelectorAll('.search-trend-chip').forEach(chip => {
                chip.addEventListener('mousedown', () => {
                    const kw = chip.getAttribute('data-trend');
                    input.value = kw;
                    clearBtn.style.display = 'flex';
                    hybridSearchService.saveRecentSearch(kw);
                    triggerMainSearch(kw);
                });
            });
            return;
        }

        let html = '';

        if (didYouMean && didYouMean.toLowerCase() !== query.toLowerCase()) {
            html += `
                <div class="search-did-you-mean" id="didYouMeanAction" data-suggest="${didYouMean.replace(/"/g, '&quot;')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span>Có phải bạn muốn tìm: <strong>${didYouMean}</strong>?</span>
                </div>
            `;
        }

        html += `
            <div class="search-group-header">
                <span>Gợi ý phim (${items.length})</span>
                ${isPendingApi ? '<div class="search-spinner" title="Đang nạp thêm kết quả..."></div>' : ''}
            </div>
        `;

        html += items.map((m, idx) => {
            const highlightedTitle = highlightMatch(m.name, query);
            const highlightedOrig = m.original_name ? highlightMatch(m.original_name, query) : '';
            const thumb = m.thumb_url || CONFIG.DEFAULT_THUMB;

            return `
                <div class="search-result-item" data-slug="${m.slug}" data-name="${m.name.replace(/"/g, '&quot;')}" data-index="${idx}">
                    <img class="search-item-thumb" src="${thumb}" alt="${m.name}" loading="lazy" onerror="this.onerror=null; this.src='${CONFIG.DEFAULT_THUMB}'">
                    <div class="search-item-info">
                        <div class="search-item-title">${highlightedTitle}</div>
                        ${highlightedOrig ? `<div class="search-item-orig">${highlightedOrig}</div>` : ''}
                        <div class="search-item-meta">
                            <span>${m.year || '2026'}</span>
                            <span>•</span>
                            <span class="search-badge-quality">${m.quality || 'FHD'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Thêm nút Xem tất cả kết quả ở chân dropdown
        html += `
            <div class="search-see-all-footer" id="searchSeeAllBtn">
                <span>Xem tất cả kết quả cho "<strong>${query}</strong>" ›</span>
            </div>
        `;

        resultsBox.innerHTML = html;
        resultsBox.classList.add('show');

        resultsBox.querySelectorAll('.search-result-item').forEach(el => {
            el.addEventListener('mousedown', () => {
                const slug = el.getAttribute('data-slug');
                const name = el.getAttribute('data-name');
                if (name) hybridSearchService.saveRecentSearch(name);
                resultsBox.classList.remove('show');
                playMovie(slug);
            });
        });

        document.getElementById('didYouMeanAction')?.addEventListener('mousedown', (e) => {
            const suggested = e.currentTarget.getAttribute('data-suggest');
            input.value = suggested;
            clearBtn.style.display = 'flex';
            hybridSearchService.saveRecentSearch(suggested);
            triggerMainSearch(suggested);
        });

        document.getElementById('searchSeeAllBtn')?.addEventListener('mousedown', () => {
            hybridSearchService.saveRecentSearch(query);
            triggerMainSearch(query);
        });
    };

    const triggerMainSearch = (keyword) => {
        resultsBox.classList.remove('show');
        state.currentKeyword = keyword;
        state.currentPage = 1;
        state.hasMoreData = true;
        updateURLParams({ search: keyword, cat: null, type: null });
        loadData();
    };

    input.addEventListener('focus', () => {
        const val = input.value.trim();
        if (!val) {
            renderRecentSearches();
        } else {
            hybridSearchService.executeHybridSearch(val, {
                onInstantResult: (res) => renderSearchResults({ ...res, query: val }),
                onFinalResult: (res) => renderSearchResults({ ...res, query: val })
            });
        }
    });

    input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        clearBtn.style.display = val ? 'flex' : 'none';

        if (!val) {
            if (debounceTimer) clearTimeout(debounceTimer);
            renderRecentSearches();
            return;
        }

        hybridSearchService.executeHybridSearch(val, {
            onInstantResult: (instantRes) => {
                renderSearchResults({ ...instantRes, query: val });
            }
        });

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            hybridSearchService.executeHybridSearch(val, {
                onFinalResult: (finalRes) => {
                    renderSearchResults({ ...finalRes, query: val });
                }
            });
        }, 250);
    });

    clearBtn?.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        renderRecentSearches();
        resetToHome();
    });

    input.addEventListener('keydown', (e) => {
        const items = resultsBox.querySelectorAll('.search-result-item, .recent-item');
        if (items.length === 0 || !resultsBox.classList.contains('show')) {
            if (e.key === 'Enter') {
                const val = input.value.trim();
                if (val) {
                    hybridSearchService.saveRecentSearch(val);
                    triggerMainSearch(val);
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateActiveSearchItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updateActiveSearchItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && items[selectedIndex]) {
                const selected = items[selectedIndex];
                if (selected.classList.contains('search-result-item')) {
                    const slug = selected.getAttribute('data-slug');
                    const name = selected.getAttribute('data-name');
                    if (name) hybridSearchService.saveRecentSearch(name);
                    resultsBox.classList.remove('show');
                    playMovie(slug);
                } else if (selected.classList.contains('recent-item')) {
                    const kw = selected.getAttribute('data-keyword');
                    input.value = kw;
                    clearBtn.style.display = 'flex';
                    hybridSearchService.saveRecentSearch(kw);
                    triggerMainSearch(kw);
                }
            } else {
                const val = input.value.trim();
                if (val) {
                    hybridSearchService.saveRecentSearch(val);
                    triggerMainSearch(val);
                }
            }
        } else if (e.key === 'Escape') {
            resultsBox.classList.remove('show');
        }
    });

    function updateActiveSearchItem(items) {
        items.forEach((item, idx) => {
            item.classList.toggle('active', idx === selectedIndex);
            if (idx === selectedIndex) {
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            resultsBox.classList.remove('show');
        }
    });
}

function setupScrollEvents() {
    const topBtn = document.getElementById('backToTopBtn');
    const header = document.getElementById('mainHeader');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 60) {
            header?.classList.add('scrolled');
        } else {
            header?.classList.remove('scrolled');
        }

        if (window.scrollY > 400) {
            if (topBtn) topBtn.style.display = 'flex';
        } else {
            if (topBtn) topBtn.style.display = 'none';
        }

        // Infinite scroll tải thêm trang khi ở chế độ Grid (không ở Trang chủ Rails)
        const isHomePage = (
            state.currentKeyword === "" &&
            state.currentType === "" &&
            state.currentCategory === "" &&
            !state.isViewingFavorites &&
            !state.isViewingHistory &&
            state.currentPage === 1
        );

        if (!isHomePage && !state.isViewingHistory && !state.isViewingFavorites && !state.isLoading && state.hasMoreData) {
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
    document.querySelectorAll('.logo, #navHome, #bnavHome').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMobileMenu(false);
            resetToHome();
        });
    });

    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => toggleMobileMenu(true));
    document.getElementById('mobileOverlay')?.addEventListener('click', () => toggleMobileMenu(false));
    document.getElementById('mobileCloseBtn')?.addEventListener('click', () => toggleMobileMenu(false));

    // Nav Desktop & Mobile Bottom
    document.getElementById('navSingle')?.addEventListener('click', (e) => { toggleMobileMenu(false); filterType('phim-le', e.currentTarget); });
    document.getElementById('bnavSingle')?.addEventListener('click', (e) => { filterType('phim-le', e.currentTarget); });

    document.getElementById('navSeries')?.addEventListener('click', (e) => { toggleMobileMenu(false); filterType('phim-bo', e.currentTarget); });
    document.getElementById('bnavSeries')?.addEventListener('click', (e) => { filterType('phim-bo', e.currentTarget); });

    document.getElementById('navAnime')?.addEventListener('click', (e) => { toggleMobileMenu(false); filterType('hoat-hinh', e.currentTarget); });

    document.getElementById('navFav')?.addEventListener('click', (e) => { toggleMobileMenu(false); loadFavoritesView(e.currentTarget); });
    document.getElementById('bnavFav')?.addEventListener('click', (e) => { loadFavoritesView(e.currentTarget); });

    document.getElementById('navHistory')?.addEventListener('click', (e) => { toggleMobileMenu(false); loadHistoryView(e.currentTarget); });

    // Mobile Bottom Nav Search Trigger
    document.getElementById('bnavSearch')?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const input = document.getElementById('searchInput');
        if (input) {
            setTimeout(() => input.focus(), 250);
        }
    });

    // Nút mở modal "Hôm nay xem gì?"
    document.getElementById('navRandomPicker')?.addEventListener('click', () => { toggleMobileMenu(false); openRandomModal(); });
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

function handleSplashIntro() {
    const splash = document.getElementById('pageSplashIntro');
    if (!splash) return;
    setTimeout(() => {
        splash.classList.add('hide');
        document.body.classList.add('page-entered');
        setTimeout(() => {
            splash.style.display = 'none';
        }, 550);
    }, 650);
}

function initApp() {
    handleSplashIntro();
    initRandomPicker();
    setupEventListeners();
    hybridSearchService.initLocalPool();

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
