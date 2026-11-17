import { CONFIG } from './config.js';
import { storage, showToast } from './utils.js';

// Lấy danh sách yêu thích
export function getFavorites() {
    return storage.get(CONFIG.STORAGE_KEYS.FAVORITES, []);
}

// Kiểm tra xem phim đã yêu thích chưa
export function isFavorite(slug, source = CONFIG.SOURCE_NAME) {
    const favs = getFavorites();
    return favs.some(f => f.slug === slug && f.source === source);
}

// Thêm / gỡ yêu thích
export function toggleFavorite(movieData, btnEl = null, onStateChange = null) {
    let favs = getFavorites();
    const index = favs.findIndex(f => f.slug === movieData.slug && f.source === movieData.source);
    let isFavNow = false;

    if (index > -1) {
        favs.splice(index, 1);
        showToast(`Đã xóa "${movieData.name}" khỏi danh sách yêu thích`);
    } else {
        favs.unshift(movieData);
        isFavNow = true;
        showToast(`Đã thêm "${movieData.name}" vào danh sách yêu thích`);
    }

    storage.set(CONFIG.STORAGE_KEYS.FAVORITES, favs);

    if (btnEl) {
        btnEl.classList.toggle('active', isFavNow);
        btnEl.innerText = isFavNow ? '❤' : '🤍';
    }

    if (onStateChange) {
        onStateChange(isFavNow);
    }

    return isFavNow;
}

// Ưu tiên kết quả tìm kiếm theo gu phim yêu thích
export function prioritizeSearchResults(movies) {
    const favs = getFavorites();
    if (favs.length === 0) return movies;
    
    const favWords = new Set();
    favs.forEach(f => {
        const words = (f.name + " " + (f.originalName || "")).toLowerCase().split(/[\s\-_:]+/);
        words.forEach(w => { if (w.length > 2) favWords.add(w); });
    });

    movies.forEach(m => {
        m.score = 0;
        const originalName = m.original_name || m.origin_name || "";
        if (favs.some(f => f.slug === m.slug && f.source === m.source)) { 
            m.score += 1000; 
        }
        const mWords = (m.name + " " + originalName).toLowerCase().split(/[\s\-_:]+/);
        mWords.forEach(w => { if (favWords.has(w)) m.score += 10; });
    });

    return movies.sort((a, b) => b.score - a.score);
}

// Lịch sử xem phim
export function getHistory() {
    return storage.get(CONFIG.STORAGE_KEYS.HISTORY, []);
}

export function saveToHistory(movieData) {
    let history = getHistory();
    history = history.filter(item => item.slug !== movieData.slug);
    history.unshift(movieData);
    if (history.length > 50) history.pop();
    storage.set(CONFIG.STORAGE_KEYS.HISTORY, history);
}

export function clearHistory() {
    storage.remove(CONFIG.STORAGE_KEYS.HISTORY);
}

export function clearHistoryStorage() {
    clearHistory();
}

export function removeHistoryItem(slug) {
    let history = getHistory().filter(item => item.slug !== slug);
    storage.set(CONFIG.STORAGE_KEYS.HISTORY, history);
}

export function clearFavoritesStorage() {
    storage.remove(CONFIG.STORAGE_KEYS.FAVORITES);
}
