import { CONFIG } from './config.js';
import { cacheManager } from './utils.js';
import { generateSearchQueries, correctQueryTypos, scoreMovie } from './smartSearch.js';

// Hàm fetch kèm timeout
export async function fetchWithTimeout(url, timeoutMs = CONFIG.FETCH_TIMEOUT) {
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

// Prefetch cache bộ nhớ tạm khi rê chuột vào phim
const prefetchCache = new Map();
export async function prefetchMovie(slug, source = CONFIG.SOURCE_NAME) {
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

// API tìm kiếm phim thông minh hỗ trợ sửa lỗi chính tả và Fallback
export async function searchMovies(keyword, page = 1, limit = null) {
    const cleanKeyword = (keyword || '').trim();
    if (!cleanKeyword) return [];

    const limitQuery = limit ? `&limit=${limit}` : '';
    const searchQueries = generateSearchQueries(cleanKeyword);

    const fetchQuery = async (q) => {
        try {
            const res = await fetchWithTimeout(`${CONFIG.API_BASE}/films/search?keyword=${encodeURIComponent(q)}&page=${page}${limitQuery}`);
            const data = await res.json();
            return Array.isArray(data.items) ? data.items : [];
        } catch (e) {
            return [];
        }
    };

    // 1. Thử tìm với từ khóa gốc trước
    let items = await fetchQuery(searchQueries[0]);

    // 2. Nếu từ khóa gốc có ít hơn 2 kết quả và có các biến thể (typo/alias/sub-query)
    if (items.length < 2 && searchQueries.length > 1) {
        const fallbackQueries = searchQueries.slice(1, 4);
        const fallbackResults = await Promise.all(fallbackQueries.map(q => fetchQuery(q)));

        const seenSlugs = new Set(items.map(m => m.slug));
        fallbackResults.forEach(subItems => {
            subItems.forEach(item => {
                if (item?.slug && !seenSlugs.has(item.slug)) {
                    seenSlugs.add(item.slug);
                    items.push(item);
                }
            });
        });
    }

    // Sắp xếp lại theo điểm tương đồng với từ khóa tìm kiếm
    if (items.length > 1) {
        items.sort((a, b) => {
            const scoreA = scoreMovie(cleanKeyword, a).score;
            const scoreB = scoreMovie(cleanKeyword, b).score;
            return scoreB - scoreA;
        });
    }

    items.forEach(m => {
        m.source = CONFIG.SOURCE_NAME;
        m.imgDomain = '';
    });

    return items;
}

// API lấy danh sách phim phân trang theo loại/thể loại/mới nhất
export async function fetchMovieList({ type = '', category = '', page = 1 }) {
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

// API chi tiết phim và danh sách tập
export async function fetchMovieDetail(slug) {
    const res = await fetchWithTimeout(`${CONFIG.API_BASE}/film/${slug}?_t=${Date.now()}`, 10000);
    const data = await res.json();
    return data;
}
