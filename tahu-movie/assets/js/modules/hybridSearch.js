import { CONFIG } from './config.js';
import { scoreMovie, generateSearchQueries, correctQueryTypos, normalizeText } from './smartSearch.js';
import { fetchMovieList } from './api.js';

/**
 * Service Tìm kiếm Lai 2 Tầng Cải Tiến (Enhanced Hybrid Search Engine)
 * - Tầng 1: Lọc tức thì trên Local Pool (< 5ms)
 * - Tầng 2: Tìm kiếm API NguonC đa biến thể (Full Query + Typo-corrected + Alias + Sub-queries Fallback)
 * - Tự động phát hiện lỗi chính tả (Did You Mean & Auto-correction)
 * - Cache kết quả thông minh trong sessionStorage
 * - Quản lý lịch sử tìm kiếm gần nhất trong localStorage
 */

const STORAGE_KEY_RECENT = 'cinemax_recent_searches';
const SESSION_KEY_LOCAL_POOL = 'cinemax_search_local_pool';
const SESSION_KEY_API_PREFIX = 'cinemax_api_search_v2_';

class HybridSearchService {
    constructor() {
        this.localPool = [];
        this.isPoolLoaded = false;
        this.activeAbortController = null;
        this.recentSearches = this.loadRecentSearches();
    }

    /**
     * Khởi tạo và nạp trước Local Movie Pool phong phú
     */
    async initLocalPool() {
        if (this.isPoolLoaded && this.localPool.length > 0) return;

        // Thử đọc từ sessionStorage trước
        try {
            const cached = sessionStorage.getItem(SESSION_KEY_LOCAL_POOL);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.localPool = parsed;
                    this.isPoolLoaded = true;
                    return;
                }
            }
        } catch (e) {}

        // Tải bất đồng bộ Page 1 & Page 2 từ API NguonC
        try {
            const [page1, page2] = await Promise.all([
                fetchMovieList({ page: 1 }).catch(() => []),
                fetchMovieList({ page: 2 }).catch(() => [])
            ]);

            const merged = [];
            const seen = new Set();
            const allItems = [...(Array.isArray(page1) ? page1 : []), ...(Array.isArray(page2) ? page2 : [])];

            for (const item of allItems) {
                if (item && item.slug && !seen.has(item.slug)) {
                    seen.add(item.slug);
                    merged.push({
                        slug: item.slug,
                        name: item.name || '',
                        original_name: item.original_name || item.origin_name || '',
                        thumb_url: item.thumb_url || item.poster_url || '',
                        year: item.year || '',
                        quality: item.quality || item.episode_current || 'HD',
                        source: item.source || CONFIG.SOURCE_NAME
                    });
                }
            }

            this.localPool = merged;
            this.isPoolLoaded = true;

            try {
                sessionStorage.setItem(SESSION_KEY_LOCAL_POOL, JSON.stringify(merged));
            } catch (e) {}
        } catch (err) {
            console.warn('Không thể nạp trước Search Local Pool:', err);
        }
    }

    /**
     * Tầng 1: Instant Local Search (< 5ms)
     * Lọc và xếp hạng trực tiếp trên Local Pool
     */
    searchLocal(query) {
        if (!query || !query.trim()) return [];
        const results = [];

        for (const movie of this.localPool) {
            const match = scoreMovie(query, movie);
            if (match.score > 70) {
                results.push({
                    ...movie,
                    searchScore: match.score,
                    isFuzzy: match.isFuzzy,
                    bestMatchField: match.bestMatchField
                });
            }
        }

        results.sort((a, b) => b.searchScore - a.searchScore);
        return results.slice(0, 10);
    }

    /**
     * Tầng 2: Gọi API NguonC với Full Query, Typo Fallback và Alias Mapping
     */
    async searchApi(query) {
        const rawQuery = (query || '').trim();
        if (!rawQuery) return [];

        const cacheKey = SESSION_KEY_API_PREFIX + encodeURIComponent(normalizeText(rawQuery));

        // Kiểm tra cache sessionStorage
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {}

        // Hủy request API trước đó nếu còn đang pending
        if (this.activeAbortController) {
            this.activeAbortController.abort();
        }
        this.activeAbortController = new AbortController();
        const signal = this.activeAbortController.signal;

        try {
            // Tạo danh sách các truy vấn theo thứ tự ưu tiên: Query gốc -> Đã sửa typo -> Alias -> Sub-query
            const searchQueries = generateSearchQueries(rawQuery);
            const mergedMap = new Map();

            // Hàm fetch an toàn từ API NguonC
            const fetchFromApi = async (keyword) => {
                try {
                    const url = `${CONFIG.API_BASE}/films/search?keyword=${encodeURIComponent(keyword)}&page=1`;
                    const res = await fetch(url, { signal });
                    if (!res.ok) return [];
                    const data = await res.json();
                    return Array.isArray(data?.items) ? data.items : [];
                } catch (e) {
                    return [];
                }
            };

            // 1. Thử truy vấn đầu tiên (Query gốc)
            const primaryItems = await fetchFromApi(searchQueries[0]);
            primaryItems.forEach(item => {
                if (item?.slug && !mergedMap.has(item.slug)) {
                    mergedMap.set(item.slug, item);
                }
            });

            // 2. Nếu query gốc có ít hơn 3 kết quả và có các query bổ trợ (do typo hoặc alias)
            if (mergedMap.size < 3 && searchQueries.length > 1) {
                const fallbackQueries = searchQueries.slice(1, 4); // Thử tối đa 3 query bổ trợ
                const fallbackPromises = fallbackQueries.map(q => fetchFromApi(q));
                const fallbackResults = await Promise.all(fallbackPromises);

                fallbackResults.forEach(itemList => {
                    itemList.forEach(item => {
                        if (item?.slug && !mergedMap.has(item.slug)) {
                            mergedMap.set(item.slug, item);
                        }
                    });
                });
            }

            const rawItems = Array.from(mergedMap.values());

            // Chuẩn hóa cấu trúc movie item
            const normalizedItems = rawItems.map(m => ({
                slug: m.slug,
                name: m.name || '',
                original_name: m.original_name || m.origin_name || '',
                thumb_url: m.thumb_url || m.poster_url || '',
                year: m.year || '',
                quality: m.quality || m.episode_current || 'HD',
                source: CONFIG.SOURCE_NAME
            }));

            // Làm giàu Local Pool để tăng tốc cho các lần tìm tiếp theo
            this.enrichLocalPool(normalizedItems);

            // Lưu cache sessionStorage
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify(normalizedItems));
            } catch (e) {}

            return normalizedItems;
        } catch (err) {
            if (err.name === 'AbortError') {
                return null; // Bị hủy bởi ký tự gõ mới hơn
            }
            console.warn('Lỗi tìm kiếm API NguonC:', err.message);
            return [];
        } finally {
            if (this.activeAbortController?.signal === signal) {
                this.activeAbortController = null;
            }
        }
    }

    /**
     * Gộp và làm giàu Local Pool với các phim mới từ API
     */
    enrichLocalPool(newMovies) {
        if (!Array.isArray(newMovies) || newMovies.length === 0) return;
        const existingSlugs = new Set(this.localPool.map(m => m.slug));
        let added = false;

        for (const movie of newMovies) {
            if (movie?.slug && !existingSlugs.has(movie.slug)) {
                this.localPool.push(movie);
                existingSlugs.add(movie.slug);
                added = true;
            }
        }

        if (added) {
            try {
                sessionStorage.setItem(SESSION_KEY_LOCAL_POOL, JSON.stringify(this.localPool));
            } catch (e) {}
        }
    }

    /**
     * Thực hiện tìm kiếm lai hoàn chỉnh
     */
    async executeHybridSearch(query, { onInstantResult, onFinalResult }) {
        const trimmed = (query || '').trim();
        if (!trimmed) {
            if (onFinalResult) onFinalResult({ items: [], didYouMean: null });
            return;
        }

        // Kiểm tra typo từ khóa nhập vào
        const typoCheck = correctQueryTypos(trimmed);

        // --- TẦNG 1: Instant Local Search ---
        const localMatches = this.searchLocal(trimmed);
        if (onInstantResult) {
            onInstantResult({
                items: localMatches,
                didYouMean: typoCheck.hasTypo ? typoCheck.suggestion : null,
                isPendingApi: true
            });
        }

        // --- TẦNG 2: Debounced API Fallback ---
        const apiItems = await this.searchApi(trimmed);
        if (apiItems === null) {
            // Request này đã bị Abort bởi ký tự gõ mới hơn
            return;
        }

        // Gộp kết quả Local + API (khử trùng theo slug)
        const mergedMap = new Map();
        for (const item of localMatches) {
            mergedMap.set(item.slug, item);
        }

        for (const item of apiItems) {
            if (!mergedMap.has(item.slug)) {
                const match = scoreMovie(trimmed, item);
                // Cho phép ngưỡng điểm linh hoạt để không bỏ sót phim liên quan
                if (match.score > 40 || typoCheck.hasTypo) {
                    mergedMap.set(item.slug, {
                        ...item,
                        searchScore: match.score || 50,
                        isFuzzy: match.isFuzzy,
                        bestMatchField: match.bestMatchField
                    });
                }
            }
        }

        const finalResults = Array.from(mergedMap.values());
        finalResults.sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));

        // Xác định gợi ý "Có phải bạn muốn tìm..." (Did You Mean)
        let didYouMean = null;
        if (typoCheck.hasTypo && typoCheck.suggestion) {
            didYouMean = typoCheck.suggestion;
        } else if (finalResults.length > 0 && finalResults[0].isFuzzy) {
            const topNorm = normalizeText(finalResults[0].name);
            const qNorm = normalizeText(trimmed);
            if (topNorm !== qNorm && finalResults[0].searchScore >= 200) {
                didYouMean = finalResults[0].name;
            }
        }

        if (onFinalResult) {
            onFinalResult({
                items: finalResults.slice(0, 10),
                didYouMean: didYouMean
            });
        }
    }

    /**
     * Quản lý Lịch sử tìm kiếm gần nhất trong LocalStorage
     */
    loadRecentSearches() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_RECENT);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    saveRecentSearch(keyword) {
        const clean = (keyword || '').trim();
        if (!clean || clean.length < 2) return;

        let list = this.loadRecentSearches();
        list = list.filter(item => item.toLowerCase() !== clean.toLowerCase());
        list.unshift(clean);
        list = list.slice(0, 6);

        this.recentSearches = list;
        try {
            localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(list));
        } catch (e) {}
    }

    removeRecentSearch(keyword) {
        let list = this.loadRecentSearches();
        list = list.filter(item => item.toLowerCase() !== keyword.toLowerCase());
        this.recentSearches = list;
        try {
            localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(list));
        } catch (e) {}
    }

    clearRecentSearches() {
        this.recentSearches = [];
        try {
            localStorage.removeItem(STORAGE_KEY_RECENT);
        } catch (e) {}
    }
}

export const hybridSearchService = new HybridSearchService();
