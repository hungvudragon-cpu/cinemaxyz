import { CONFIG } from './config.js';
import { scoreMovie, extractShortKeyword, normalizeText } from './smartSearch.js';
import { fetchMovieList } from './api.js';

/**
 * Service Tìm kiếm Lai 2 Tầng (Hybrid 2-Tier Search Service)
 * 
 * - Pre-fetch Local Pool từ API (page 1 & 2) lưu vào sessionStorage
 * - Tầng 1: Lọc tức thì trên Local Pool (< 10ms)
 * - Tầng 2: Debounced 400ms gọi API NguonC với từ khóa rút gọn, AbortController hủy request thừa
 * - Cache kết quả API theo query trong sessionStorage
 * - Quản lý 5 lịch sử tìm kiếm gần nhất trong localStorage
 */

const STORAGE_KEY_RECENT = 'cinemax_recent_searches';
const SESSION_KEY_LOCAL_POOL = 'cinemax_search_local_pool';
const SESSION_KEY_API_PREFIX = 'cinemax_api_search_';

class HybridSearchService {
    constructor() {
        this.localPool = [];
        this.isPoolLoaded = false;
        this.activeAbortController = null;
        this.recentSearches = this.loadRecentSearches();
    }

    /**
     * Khởi tạo và nạp trước Local Movie Pool (Page 1 & 2 phim mới cập nhật)
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
     * Tầng 1: Instant Local Search (< 10ms)
     * Lọc và xếp hạng trực tiếp trên Local Pool
     */
    searchLocal(query) {
        if (!query || !query.trim()) return [];
        const results = [];

        for (const movie of this.localPool) {
            const match = scoreMovie(query, movie);
            if (match.score > 80) {
                results.push({
                    ...movie,
                    searchScore: match.score,
                    isFuzzy: match.isFuzzy,
                    bestMatchField: match.bestMatchField
                });
            }
        }

        // Sắp xếp giảm dần theo điểm số
        results.sort((a, b) => b.searchScore - a.searchScore);
        return results.slice(0, 8);
    }

    /**
     * Tầng 2: Gọi API NguonC với AbortController và Cache sessionStorage
     */
    async searchApi(query) {
        const shortKeyword = extractShortKeyword(query);
        const searchKeyword = shortKeyword || query.trim();
        if (!searchKeyword) return [];

        const cacheKey = SESSION_KEY_API_PREFIX + encodeURIComponent(normalizeText(searchKeyword));

        // Kiểm tra cache sessionStorage
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {}

        // Hủy request API đang bay trước đó nếu có (Bảo vệ API, tránh race condition)
        if (this.activeAbortController) {
            this.activeAbortController.abort();
        }
        this.activeAbortController = new AbortController();
        const signal = this.activeAbortController.signal;

        try {
            const url = `${CONFIG.API_BASE}/films/search?keyword=${encodeURIComponent(searchKeyword)}&page=1`;
            const res = await fetch(url, { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            // Safety guard kiểm tra mảng
            const items = Array.isArray(data?.items) ? data.items : [];

            // Chuẩn hóa cấu trúc movie item
            const normalizedItems = items.map(m => ({
                slug: m.slug,
                name: m.name || '',
                original_name: m.original_name || m.origin_name || '',
                thumb_url: m.thumb_url || m.poster_url || '',
                year: m.year || '',
                quality: m.quality || m.episode_current || 'HD',
                source: CONFIG.SOURCE_NAME
            }));

            // Thêm các phim mới tìm được vào Local Pool động để làm giàu tập dữ liệu client
            this.enrichLocalPool(normalizedItems);

            // Lưu cache sessionStorage
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify(normalizedItems));
            } catch (e) {}

            return normalizedItems;
        } catch (err) {
            if (err.name === 'AbortError') {
                return null; // Bị hủy bởi request mới hơn
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
     * Thực hiện tìm kiếm lai hoàn chỉnh:
     * 1. Gọi searchLocal ngay tức thì.
     * 2. Gọi onInstantResult callback trả về kết quả Tầng 1 ngay.
     * 3. Nếu kết quả < 5, thực hiện Tầng 2 (API Fallback) và merge lại, xếp hạng lại.
     */
    async executeHybridSearch(query, { onInstantResult, onFinalResult }) {
        const trimmed = query.trim();
        if (!trimmed) {
            if (onFinalResult) onFinalResult({ items: [], didYouMean: null });
            return;
        }

        // --- TẦNG 1: Instant Local Search ---
        const localMatches = this.searchLocal(trimmed);
        if (onInstantResult) {
            const topFuzzy = localMatches.length > 0 && localMatches[0].isFuzzy ? localMatches[0].name : null;
            onInstantResult({
                items: localMatches,
                didYouMean: topFuzzy,
                isPendingApi: localMatches.length < 5
            });
        }

        // Nếu Tầng 1 đã có từ 5 kết quả chuẩn (điểm > 400), không cần spam API
        const highQualityMatches = localMatches.filter(m => m.searchScore >= 400);
        if (highQualityMatches.length >= 5) {
            if (onFinalResult) {
                onFinalResult({
                    items: localMatches,
                    didYouMean: localMatches[0]?.isFuzzy ? localMatches[0].name : null
                });
            }
            return;
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
                if (match.score > 60) {
                    mergedMap.set(item.slug, {
                        ...item,
                        searchScore: match.score,
                        isFuzzy: match.isFuzzy,
                        bestMatchField: match.bestMatchField
                    });
                }
            }
        }

        const finalResults = Array.from(mergedMap.values());
        finalResults.sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));

        // Kiểm tra xem có gợi ý "Có phải bạn muốn tìm..." (Fuzzy typo check)
        let didYouMean = null;
        if (finalResults.length > 0) {
            const top = finalResults[0];
            const qNorm = normalizeText(trimmed);
            const topNorm = normalizeText(top.name);
            if (top.isFuzzy && topNorm !== qNorm && top.searchScore >= 200) {
                didYouMean = top.name;
            }
        }

        if (onFinalResult) {
            onFinalResult({
                items: finalResults.slice(0, 8),
                didYouMean: didYouMean
            });
        }
    }

    /**
     * Quản lý 5 Lịch sử tìm kiếm gần nhất trong LocalStorage
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
        const clean = keyword?.trim();
        if (!clean || clean.length < 2) return;

        let list = this.loadRecentSearches();
        list = list.filter(item => item.toLowerCase() !== clean.toLowerCase());
        list.unshift(clean);
        list = list.slice(0, 5); // Lưu tối đa 5 lịch sử gần nhất

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
