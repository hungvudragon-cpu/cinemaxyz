import { CONFIG } from './config.js';
import { cacheManager } from './utils.js';

/**
 * Chuẩn hóa chuỗi văn bản để so sánh chính xác tên phim
 */
function normalizeString(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Loại bỏ các hậu tố nhiễu thường gặp trong dữ liệu phim (Phần X, Season X, Vietsub, Thuyết minh, v.v.)
 */
function cleanMovieTitle(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*[\(\[\{【](?:Phần|Season|SS|Part|Tập|Vol\.?|Chapter)\s*\d+[^\)\]\}】]*[\)\]\}】]/gi, '')
        .replace(/\s*[\(\[\{【](?:Vietsub|Thuyết Minh|Lồng Tiếng|Bản Rạp|Chiếu Rạp|Full HD|HD|FHD|4K|UHD|Remastered|OVA|Special|Đang Cập Nhật)[^\)\]\}】]*[\)\]\}】]/gi, '')
        .replace(/\s*-\s*(?:Phần|Season|Part)\s*\d+.*$/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tạo danh sách các từ khóa tìm kiếm theo thứ tự ưu tiên
 */
function generateTMDBQueries(title, originalTitle) {
    const queries = [];
    const seen = new Set();

    const addQuery = (q) => {
        const cleaned = (q || '').trim();
        if (cleaned && cleaned.length >= 2 && !seen.has(cleaned.toLowerCase())) {
            seen.add(cleaned.toLowerCase());
            queries.push(cleaned);
        }
    };

    const cleanOrig = cleanMovieTitle(originalTitle);
    const cleanMain = cleanMovieTitle(title);

    // 1. Nếu tên gốc có dấu gạch chéo '/' (thường là Tên Nhật/Tên Anh hoặc Tên Gốc/Tên Phụ)
    if (cleanOrig.includes('/')) {
        cleanOrig.split('/').forEach(part => addQuery(part));
    }
    // 2. Nếu tên gốc có dấu phẩy ',' (Pinyin, Tên Tiếng Anh)
    if (cleanOrig.includes(',')) {
        cleanOrig.split(',').forEach(part => addQuery(part));
    }

    addQuery(cleanOrig);
    addQuery(cleanMain);
    addQuery(originalTitle);
    addQuery(title);

    return queries;
}

/**
 * Chấm điểm độ khớp giữa phim mục tiêu và kết quả TMDB (Candidate Scoring)
 * Ngăn chặn tuyệt đối tình trạng lấy nhầm phim khác tên, khác năm hoặc phim cổ 1950
 */
function scoreCandidate(candidate, { targetYear, targetType, targetTitles }) {
    if (!candidate || candidate.media_type === 'person') return -999;

    let score = 0;
    const candYear = parseInt((candidate.release_date || candidate.first_air_date || '').slice(0, 4), 10);
    const candTitle = candidate.title || candidate.name || '';
    const candOrigTitle = candidate.original_title || candidate.original_name || '';

    const normCandTitle = normalizeString(candTitle);
    const normCandOrig = normalizeString(candOrigTitle);

    // 1. Chấm điểm Năm phát hành
    if (targetYear && !isNaN(targetYear)) {
        if (candYear === targetYear) {
            score += 50; // Khớp chính xác năm
        } else if (Math.abs(candYear - targetYear) === 1) {
            score += 25; // Chênh lệch 1 năm (do lịch chiếu rạp/online khác nhau)
        } else if (Math.abs(candYear - targetYear) <= 2) {
            score += 10;
        } else if (candYear && Math.abs(candYear - targetYear) > 5) {
            // Nếu là TV series thì first_air_date có thể cũ hơn mùa hiện tại, giảm nhẹ
            if (candidate.media_type === 'tv' && targetType === 'tv') {
                score -= 15;
            } else {
                score -= 45; // Khác biệt năm quá xa -> trừ điểm nặng (tránh Marilyn Monroe 1954 vs 2026)
            }
        }
    }

    // 2. Chấm điểm Thể loại (TV series vs Phim lẻ Movie)
    if (targetType) {
        if (candidate.media_type === targetType) {
            score += 30;
        } else {
            score -= 25;
        }
    }

    // 3. Chấm điểm Độ tương đồng tên
    let titleBonus = 0;
    for (const t of targetTitles) {
        const normTarget = normalizeString(t);
        if (!normTarget) continue;

        if (normCandTitle === normTarget || normCandOrig === normTarget) {
            titleBonus = Math.max(titleBonus, 60); // Khớp hoàn toàn
        } else if (normCandTitle.startsWith(normTarget) || normCandOrig.startsWith(normTarget)) {
            titleBonus = Math.max(titleBonus, 35);
        } else if (normCandTitle.includes(normTarget) || normCandOrig.includes(normTarget)) {
            titleBonus = Math.max(titleBonus, 25);
        } else if (normTarget.includes(normCandTitle) || normTarget.includes(normCandOrig)) {
            titleBonus = Math.max(titleBonus, 20);
        }
    }
    score += titleBonus;

    // 4. Điểm tín hiệu phổ biến & hình ảnh
    if (candidate.vote_count > 100) score += 10;
    else if (candidate.vote_count > 10) score += 5;

    if (candidate.poster_path || candidate.backdrop_path) score += 5;

    return score;
}

/**
 * Tìm kiếm và lấy dữ liệu mở rộng từ The Movie Database (TMDB)
 * Hỗ trợ backdrop 4K, TMDB rating, danh sách diễn viên kèm ảnh, trailer YouTube, và gợi ý phim tương tự.
 * Hỗ trợ tra cứu trực tiếp theo TMDB ID, IMDb ID, hoặc thuật toán chấm điểm khớp thông minh (Candidate Scoring).
 */
export async function getTMDBDetails(param1, param2 = "", param3 = "", extraOptions = {}) {
    if (!CONFIG.TMDB?.API_KEY) return null;

    let title = "";
    let originalTitle = "";
    let year = "";
    let tmdbId = null;
    let tmdbType = null;
    let imdbId = null;
    let typeHint = null;

    // Hỗ trợ truyền dạng Object { title, originalTitle, year, tmdb, imdb, type, episodes } hoặc tham số rời
    if (typeof param1 === 'object' && param1 !== null) {
        title = param1.title || param1.name || "";
        originalTitle = param1.originalTitle || param1.original_name || param1.origin_name || "";
        year = param1.year || "";
        tmdbId = param1.tmdb?.id || param1.tmdbId || null;
        tmdbType = param1.tmdb?.type || null;
        imdbId = param1.imdb?.id || param1.imdbId || null;
        typeHint = param1.type || param1.mediaType || (param1.episodes?.length > 1 ? 'tv' : null);
    } else {
        title = param1 || "";
        originalTitle = param2 || "";
        year = param3 || "";
        tmdbId = extraOptions.tmdb?.id || extraOptions.tmdbId || null;
        tmdbType = extraOptions.tmdb?.type || null;
        imdbId = extraOptions.imdb?.id || extraOptions.imdbId || null;
        typeHint = extraOptions.type || extraOptions.mediaType || null;
    }

    const cleanYear = year ? String(year).match(/\d{4}/)?.[0] : "";
    const targetYearNum = cleanYear ? parseInt(cleanYear, 10) : null;
    const targetType = tmdbType || (typeHint === 'series' || typeHint === 'hoathinh' ? 'tv' : (typeHint === 'single' ? 'movie' : null));

    const cacheKey = `tmdb_v2_${tmdbId || ''}_${imdbId || ''}_${encodeURIComponent((originalTitle || title).toLowerCase())}_${cleanYear || ''}`;
    const cached = cacheManager.get(cacheKey);
    if (cached) return cached;

    const apiKey = CONFIG.TMDB.API_KEY;

    try {
        let matchedItem = null;

        // =========================================================================
        // ƯU TIÊN 1: Tra cứu trực tiếp theo TMDB ID (Chính xác tuyệt đối 100%)
        // =========================================================================
        if (tmdbId) {
            const typesToTry = targetType ? [targetType, targetType === 'tv' ? 'movie' : 'tv'] : ['tv', 'movie'];
            for (const mType of typesToTry) {
                try {
                    const checkUrl = `${CONFIG.TMDB.BASE_URL}/${mType}/${tmdbId}?api_key=${apiKey}&language=vi-VN`;
                    const res = await fetch(checkUrl);
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.id) {
                            matchedItem = {
                                id: data.id,
                                media_type: mType,
                                initialData: data
                            };
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        // =========================================================================
        // ƯU TIÊN 2: Tra cứu theo IMDb ID (Chính xác tuyệt đối 100%)
        // =========================================================================
        if (!matchedItem && imdbId && typeof imdbId === 'string' && imdbId.startsWith('tt')) {
            try {
                const findUrl = `${CONFIG.TMDB.BASE_URL}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id&language=vi-VN`;
                const findRes = await fetch(findUrl);
                if (findRes.ok) {
                    const findData = await findRes.json();
                    const movieMatch = findData.movie_results?.[0];
                    const tvMatch = findData.tv_results?.[0];
                    if (tvMatch && targetType === 'tv') {
                        matchedItem = { id: tvMatch.id, media_type: 'tv' };
                    } else if (movieMatch && targetType === 'movie') {
                        matchedItem = { id: movieMatch.id, media_type: 'movie' };
                    } else if (tvMatch || movieMatch) {
                        const picked = tvMatch || movieMatch;
                        matchedItem = { id: picked.id, media_type: tvMatch ? 'tv' : 'movie' };
                    }
                }
            } catch (e) {}
        }

        // =========================================================================
        // ƯU TIÊN 3: Tìm kiếm theo từ khóa có lọc và chấm điểm (Candidate Scoring)
        // =========================================================================
        if (!matchedItem) {
            const searchQueries = generateTMDBQueries(title, originalTitle);
            if (searchQueries.length === 0) return null;

            const targetTitles = [originalTitle, title, cleanMovieTitle(originalTitle), cleanMovieTitle(title)].filter(Boolean);
            let candidates = [];

            for (const q of searchQueries) {
                // 3.1. Nếu biết trước thể loại TV/Movie, ưu tiên endpoint chuyên biệt có lọc năm
                if (targetType === 'tv') {
                    try {
                        const tvUrl = `${CONFIG.TMDB.BASE_URL}/search/tv?api_key=${apiKey}&language=vi-VN&query=${encodeURIComponent(q)}${cleanYear ? `&first_air_date_year=${cleanYear}` : ''}`;
                        const res = await fetch(tvUrl);
                        if (res.ok) {
                            const data = await res.json();
                            if (Array.isArray(data.results)) {
                                data.results.forEach(r => { r.media_type = 'tv'; candidates.push(r); });
                            }
                        }
                    } catch (e) {}
                } else if (targetType === 'movie') {
                    try {
                        const movieUrl = `${CONFIG.TMDB.BASE_URL}/search/movie?api_key=${apiKey}&language=vi-VN&query=${encodeURIComponent(q)}${cleanYear ? `&primary_release_year=${cleanYear}` : ''}`;
                        const res = await fetch(movieUrl);
                        if (res.ok) {
                            const data = await res.json();
                            if (Array.isArray(data.results)) {
                                data.results.forEach(r => { r.media_type = 'movie'; candidates.push(r); });
                            }
                        }
                    } catch (e) {}
                }

                // 3.2. Tìm kiếm đa phương thức (Multi Search)
                try {
                    const multiUrl = `${CONFIG.TMDB.BASE_URL}/search/multi?api_key=${apiKey}&language=vi-VN&query=${encodeURIComponent(q)}`;
                    const res = await fetch(multiUrl);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data.results)) {
                            candidates.push(...data.results);
                        }
                    }
                } catch (e) {}

                // 3.3. Nếu tiếng Việt không có kết quả, thử lại bằng tiếng Anh (en-US)
                if (candidates.length === 0) {
                    try {
                        const enMultiUrl = `${CONFIG.TMDB.BASE_URL}/search/multi?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(q)}`;
                        const res = await fetch(enMultiUrl);
                        if (res.ok) {
                            const data = await res.json();
                            if (Array.isArray(data.results)) {
                                candidates.push(...data.results);
                            }
                        }
                    } catch (e) {}
                }

                // Nếu đã tìm thấy ứng viên tiềm năng thì dừng lặp từ khóa
                if (candidates.length > 0) break;
            }

            // Loại bỏ ứng viên trùng ID hoặc người đóng (person)
            const uniqueCandidates = [];
            const seenIds = new Set();
            for (const c of candidates) {
                if (!c || c.media_type === 'person') continue;
                const uniqueKey = `${c.media_type}_${c.id}`;
                if (!seenIds.has(uniqueKey)) {
                    seenIds.add(uniqueKey);
                    uniqueCandidates.push(c);
                }
            }

            // Chấm điểm từng ứng viên
            const scoredCandidates = uniqueCandidates.map(cand => ({
                candidate: cand,
                score: scoreCandidate(cand, {
                    targetYear: targetYearNum,
                    targetType: targetType,
                    targetTitles: targetTitles
                })
            }));

            // Sắp xếp điểm giảm dần
            scoredCandidates.sort((a, b) => b.score - a.score);

            // Chỉ chấp nhận ứng viên đạt điểm sàn an toàn (>= 20 điểm)
            const bestMatch = scoredCandidates[0];
            if (bestMatch && bestMatch.score >= 20) {
                matchedItem = bestMatch.candidate;
            }
        }

        if (!matchedItem || !matchedItem.id) return null;

        const mediaType = matchedItem.media_type === 'tv' ? 'tv' : 'movie';
        const mediaId = matchedItem.id;

        // =========================================================================
        // Lấy chi tiết đầy đủ kèm videos (trailer), credits (diễn viên), similar (phim tương tự)
        // =========================================================================
        const detailUrl = `${CONFIG.TMDB.BASE_URL}/${mediaType}/${mediaId}?api_key=${apiKey}&language=vi-VN&append_to_response=credits,videos,similar`;
        let detailRes = await fetch(detailUrl);
        let detailData = detailRes.ok ? await detailRes.json() : (matchedItem.initialData || matchedItem);

        // Xử lý trailer YouTube: Thử tìm tiếng Việt trước, nếu không có lấy trailer quốc tế (en-US)
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

        // Danh sách diễn viên kèm ảnh đại diện profile (lấy tối đa 12 người)
        const castList = (detailData.credits?.cast || []).slice(0, 12).map(c => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profileUrl: c.profile_path ? `${CONFIG.TMDB.IMAGE_BASE_PROFILE}${c.profile_path}` : null
        }));

        // Danh sách phim tương tự (lấy tối đa 8 phim)
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
            voteAverage: (detailData.vote_average && detailData.vote_count > 0) ? detailData.vote_average.toFixed(1) : null,
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
