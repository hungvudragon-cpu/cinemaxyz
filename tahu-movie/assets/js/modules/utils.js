import { CONFIG } from './config.js';

// Quản lý Lưu trữ LocalStorage
export const storage = {
    get(key, defaultValue = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error("Storage set error:", e);
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {}
    }
};

// Quản lý Cache có hạn sử dụng (TTL)
export const cacheManager = {
    get(key) {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.CACHE_PREFIX + key);
            if (!raw) return null;
            const item = JSON.parse(raw);
            if (Date.now() - item.ts > CONFIG.CACHE_TTL) {
                localStorage.removeItem(CONFIG.STORAGE_KEYS.CACHE_PREFIX + key);
                return null;
            }
            return item.data;
        } catch (e) {
            return null;
        }
    },
    set(key, data) {
        try {
            localStorage.setItem(
                CONFIG.STORAGE_KEYS.CACHE_PREFIX + key,
                JSON.stringify({ ts: Date.now(), data })
            );
        } catch (e) {}
    }
};

// Toast notification
let toastTimeout;
export function showToast(message) {
    const toast = document.getElementById('appToast');
    const msgEl = document.getElementById('toastMsg');
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2600);
}

// Chuyển cảnh mượt mà
export function startTransition() {
    const overlay = document.getElementById('transitionOverlay');
    if (overlay) overlay.classList.add('active');
}

export function endTransition() {
    const overlay = document.getElementById('transitionOverlay');
    if (overlay) overlay.classList.remove('active');
}

// Xử lý link ảnh an toàn
export function getSafeImageUrl(movie) {
    return movie.thumb_url || movie.poster_url || CONFIG.DEFAULT_THUMB;
}

// Tách tên mảng danh mục / diễn viên / quốc gia
export function extractNames(data) {
    if (!data || data.length === 0) return "Đang cập nhật";
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(i => typeof i === 'object' ? i.name : i).join(', ');
    return "Đang cập nhật";
}

// Cập nhật query parameters trên URL
export function updateURLParams(params = {}) {
    const url = new URL(window.location.href);
    const currentParams = new URLSearchParams(url.search);
    
    if (params.clear) {
        url.search = '';
    } else {
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
                currentParams.set(key, params[key]);
            } else {
                currentParams.delete(key);
            }
        });
        url.search = currentParams.toString();
    }
    window.history.pushState({}, '', url.toString());
}
