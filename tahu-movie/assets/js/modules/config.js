// Cấu hình chung cho ứng dụng
export const CONFIG = {
    APP_NAME: "TaHu Cinema",
    API_BASE: "https://phim.nguonc.com/api",
    SOURCE_NAME: "nguonc",
    DEFAULT_THUMB: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=60",
    CACHE_TTL: 5 * 60 * 1000, // 5 phút cache
    FETCH_TIMEOUT: 8000,
    ACCESS_PASSWORD: "123456", // Đổi mật khẩu truy cập tại đây (hoặc để trống "" nếu không muốn đặt mật khẩu)
    STORAGE_KEYS: {
        FAVORITES: "cinemax_favorites",
        HISTORY: "cinemax_history",
        CURRENT_WATCH: "cinemax_current_watch",
        ACCESS_GRANTED: "tahu_access_granted",
        CACHE_PREFIX: "moviecache_"
    }
};
