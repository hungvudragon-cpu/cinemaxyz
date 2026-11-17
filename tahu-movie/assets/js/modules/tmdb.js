import { CONFIG } from './config.js';
import { cacheManager } from './utils.js';

/**
 * Tìm kiếm và lấy dữ liệu mở rộng từ The Movie Database (TMDB)
 * Hỗ trợ backdrop 4K, IMDb/TMDB rating, danh sách diễn viên kèm ảnh, trailer YouTube, và gợi ý phim tương tự.
 */
export async function getTMDBDetails(title, originalTitle = "", year = "") {
    if (!CONFIG.TMDB?.API_KEY) return null;

    const query = (originalTitle || title || "").trim();
    if (!query) return null;

    const cleanYear = year ? String(year).match(/\d{4}/)?.[0] : "";
    const cacheKey = `tmdb_${encodeURIComponent(query.toLowerCase())}_${cleanYear || ''}`;
    const cached = cacheManager.get(cacheKey);
    if (cached) return cached;

    try {
        const apiKey = CONFIG.TMDB.API_KEY;
        const searchBase = `${CONFIG.TMDB.BASE_URL}/search/multi?api_key=${apiKey}&language=vi-VN&query=${encodeURIComponent(query)}`;
        const searchUrl = cleanYear ? `${searchBase}&year=${cleanYear}` : searchBase;

        let res = await fetch(searchUrl);
        if (!res.ok) throw new Error(`TMDB Search failed: ${res.status}`);
        let searchData = await res.json();

        // Nếu tiếng Việt không có hoặc ít kết quả, thử lại với ngôn ngữ en-US
        if (!searchData.results || searchData.results.length === 0) {
            const enUrl = `${CONFIG.TMDB.BASE_URL}/search/multi?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(query)}`;
            const enRes = await fetch(cleanYear ? `${enUrl}&year=${cleanYear}` : enUrl);
            if (enRes.ok) {
                searchData = await enRes.json();
            }
        }

        // Nếu vẫn không có và có title khác originalTitle, thử tìm với title phụ
        if ((!searchData.results || searchData.results.length === 0) && title && title !== query) {
            const fallbackRes = await fetch(`${CONFIG.TMDB.BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(title)}`);
            if (fallbackRes.ok) {
                searchData = await fallbackRes.json();
            }
        }

        const match = searchData.results?.find(item => item.media_type === 'movie' || item.media_type === 'tv') || searchData.results?.[0];
        if (!match) return null;

        const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
        const mediaId = match.id;

        // Lấy chi tiết đầy đủ kèm videos (trailer), credits (diễn viên), similar (phim tương tự)
        const detailUrl = `${CONFIG.TMDB.BASE_URL}/${mediaType}/${mediaId}?api_key=${apiKey}&language=vi-VN&append_to_response=credits,videos,similar`;
        let detailRes = await fetch(detailUrl);
        let detailData = detailRes.ok ? await detailRes.json() : match;

        // Nếu danh sách video trailer trống, gọi videos en-US để chắc chắn có trailer YouTube
        let trailerYoutubeKey = null;
        const videos = detailData.videos?.results || [];
        const officialTrailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (officialTrailer) {
            trailerYoutubeKey = officialTrailer.key;
        } else {
            try {
                const vidEnRes = await fetch(`${CONFIG.TMDB.BASE_URL}/${mediaType}/${mediaId}/videos?api_key=${apiKey}&language=en-US`);
                if (vidEnRes.ok) {
                    const vidEnData = await vidEnRes.json();
                    const enTrailer = vidEnData.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
                    if (enTrailer) trailerYoutubeKey = enTrailer.key;
                }
            } catch (e) {}
        }

        // Format diễn viên kèm ảnh đại diện profile
        const castList = (detailData.credits?.cast || []).slice(0, 10).map(c => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profileUrl: c.profile_path ? `${CONFIG.TMDB.IMAGE_BASE_PROFILE}${c.profile_path}` : null
        }));

        // Format phim tương tự
        const similarList = (detailData.similar?.results || []).slice(0, 8).map(s => ({
            id: s.id,
            title: s.title || s.name,
            posterUrl: s.poster_path ? `${CONFIG.TMDB.IMAGE_BASE_POSTER}${s.poster_path}` : null,
            rating: s.vote_average ? s.vote_average.toFixed(1) : null,
            year: (s.release_date || s.first_air_date || "").substring(0, 4)
        }));

        const result = {
            id: mediaId,
            mediaType: mediaType,
            voteAverage: detailData.vote_average ? detailData.vote_average.toFixed(1) : null,
            voteCount: detailData.vote_count || 0,
            backdrop4k: detailData.backdrop_path ? `${CONFIG.TMDB.IMAGE_BASE_BACKDROP}${detailData.backdrop_path}` : null,
            posterHd: detailData.poster_path ? `${CONFIG.TMDB.IMAGE_BASE_POSTER}${detailData.poster_path}` : null,
            trailerYoutubeKey: trailerYoutubeKey,
            trailerUrl: trailerYoutubeKey ? `https://www.youtube.com/watch?v=${trailerYoutubeKey}` : null,
            cast: castList,
            similar: similarList,
            overview: detailData.overview || ""
        };

        cacheManager.set(cacheKey, result);
        return result;
    } catch (err) {
        console.warn('TMDB Fetch Warning:', err.message);
        return null;
    }
}
