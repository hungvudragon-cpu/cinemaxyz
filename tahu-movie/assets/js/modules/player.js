import { CONFIG } from './config.js';
import { storage, showToast, startTransition, endTransition, getSafeImageUrl, extractNames, updateURLParams } from './utils.js';
import { isFavorite, toggleFavorite, saveToHistory } from './storage.js';
import { fetchMovieDetail } from './api.js';
import { getTMDBDetails } from './tmdb.js';

let player = null;
let hlsInstance = null;
let currentMovieData = null;
let currentServerIndex = 0;
let currentEpIndex = 0;
let globalMovieEpisodes = [];

const videoPlayer = document.getElementById('videoPlayer');
const plyrWrapper = document.getElementById('plyrWrapper');
const videoIframe = document.getElementById('videoIframe');

export function initPlayer() {
    if (!player && typeof Plyr !== 'undefined' && videoPlayer) {
        player = new Plyr(videoPlayer, {
            controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
            settings: ['quality', 'speed', 'loop']
        });
    }
}

export function showModal() {
    const modal = document.getElementById('videoModal');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    document.body.style.overflow = 'hidden';
}

export function hideModal() {
    const modal = document.getElementById('videoModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }, 300);
}

export function closeVideo() {
    hideModal();
    storage.remove(CONFIG.STORAGE_KEYS.CURRENT_WATCH);
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (player) { player.stop(); }
    if (videoIframe) videoIframe.src = "";
    updateURLParams({ watch: null, sv: null, ep: null });
}

export function toggleDescription() {
    const desc = document.getElementById('detailDescription');
    const btn = document.getElementById('readMoreBtn');
    if (!desc || !btn) return;
    desc.classList.toggle('expanded');
    btn.innerText = desc.classList.contains('expanded') ? 'Thu gọn ⌃' : 'Xem thêm ⌄';
}

export function updateModalFavBtn(isFav) {
    const icon = document.getElementById('modalFavIcon');
    const btn = document.getElementById('modalFavBtn');
    if (icon && btn) {
        icon.innerText = isFav ? '❤️' : '🤍';
        btn.style.color = isFav ? '#ff3b5c' : '#fff';
    }
}

export function toggleCurrentModalFav() {
    if (!currentMovieData) return;
    toggleFavorite(currentMovieData, null, (isFav) => {
        updateModalFavBtn(isFav);
    });
}

export function shareCurrentEpisode() {
    if (!currentMovieData || !currentMovieData.slug) return;
    const shareUrl = new URL(window.location.origin + window.location.pathname);
    shareUrl.searchParams.set('watch', currentMovieData.slug);
    if (currentServerIndex > 0) shareUrl.searchParams.set('sv', currentServerIndex);
    if (currentEpIndex > 0) shareUrl.searchParams.set('ep', currentEpIndex);

    const finalUrl = shareUrl.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(finalUrl).then(() => {
            showToast('📋 Đã sao chép link tập phim vào bộ nhớ tạm!');
        }).catch(() => {
            prompt('Link tập phim của bạn:', finalUrl);
        });
    } else {
        prompt('Link tập phim của bạn:', finalUrl);
    }
}

export async function playMovie(slug, source = CONFIG.SOURCE_NAME, resumeEp = null) {
    initPlayer();
    showModal();

    const loading = document.getElementById('modalLoading');
    const content = document.getElementById('modalContent');
    const loadingStatus = document.getElementById('loadingStatus');

    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';
    if (loadingStatus) loadingStatus.innerText = 'Đang tải thông tin & máy chủ phim...';

    const serverListEl = document.getElementById('serverList');
    const epListEl = document.getElementById('episodeList');
    if (serverListEl) serverListEl.innerHTML = '';
    if (epListEl) epListEl.innerHTML = '';

    try {
        const data = await fetchMovieDetail(slug);
        const movieDetail = data.movie || data.item || {};
        globalMovieEpisodes = movieDetail.episodes || data.episodes || [];

        const originalName = movieDetail.original_name || movieDetail.origin_name || "";
        currentMovieData = {
            slug: slug,
            source: source,
            name: movieDetail.name || "Đang cập nhật",
            originalName: originalName,
            image: getSafeImageUrl(movieDetail),
            episode_current: movieDetail.episode_current || "HD"
        };

        saveToHistory(currentMovieData);
        updateModalFavBtn(isFavorite(slug, source));

        document.getElementById('detailTitle').innerText = movieDetail.name || "Đang cập nhật...";
        document.getElementById('detailOriginalTitle').innerText = originalName;
        document.getElementById('detailYear').innerText = movieDetail.year || "2024";
        document.getElementById('detailQuality').innerText = movieDetail.quality || movieDetail.episode_current || "HD";
        document.getElementById('detailLang').innerText = movieDetail.lang || movieDetail.language || "Vietsub";
        document.getElementById('detailTime').innerText = movieDetail.time || "Đang cập nhật";

        const tmpDiv = document.createElement("div");
        const descContent = movieDetail.description || movieDetail.content || "Chưa có thông tin mô tả chi tiết cho bộ phim này.";
        tmpDiv.innerHTML = descContent;
        const descEl = document.getElementById('detailDescription');
        descEl.innerText = tmpDiv.textContent || tmpDiv.innerText || descContent;
        descEl.classList.remove('expanded');
        document.getElementById('readMoreBtn').innerText = "Xem thêm ⌄";

        document.getElementById('detailCategory').innerText = extractNames(movieDetail.category || movieDetail.categories);
        document.getElementById('detailCountry').innerText = extractNames(movieDetail.country || movieDetail.countries);
        document.getElementById('detailDirector').innerText = extractNames(movieDetail.director || movieDetail.directors);
        document.getElementById('detailCast').innerText = extractNames(movieDetail.actor || movieDetail.casts || movieDetail.cast);

        loading.style.display = 'none';
        content.style.display = 'flex';

        // Gọi dữ liệu từ TMDB để bổ sung Backdrop 4K, Điểm TMDB, Trailer YouTube, Diễn viên kèm ảnh và Phim tương tự
        loadTMDBEnrichment(movieDetail.name, originalName, movieDetail.year);

        const serverContainer = document.getElementById('serverContainer');
        if (globalMovieEpisodes.length > 0) {
            serverContainer.style.display = 'block';
            globalMovieEpisodes.forEach((server, index) => {
                const btn = document.createElement('button');
                btn.className = 'server-btn';
                btn.innerText = server.server_name || `Server ${index + 1}`;
                btn.onclick = () => selectServer(index);
                serverListEl.appendChild(btn);
            });

            const targetServer = resumeEp?.serverIndex || 0;
            const targetEpisode = resumeEp?.episodeIndex || 0;
            selectServer(targetServer, targetEpisode);
        } else {
            serverContainer.style.display = 'none';
            document.getElementById('episodeContainer').style.display = 'none';
        }

        endTransition();
    } catch (err) {
        console.error(err);
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'flex';
        endTransition();
    }
}

function selectServer(serverIndex, targetEpIndex = 0) {
    currentServerIndex = serverIndex;
    document.querySelectorAll('.server-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === serverIndex);
    });

    const serverData = globalMovieEpisodes[serverIndex]?.server_data || globalMovieEpisodes[serverIndex]?.items || [];
    const episodeList = document.getElementById('episodeList');
    const epContainer = document.getElementById('episodeContainer');
    const epBadge = document.getElementById('episodeCountBadge');

    episodeList.innerHTML = '';
    
    if (serverData.length <= 1) {
        epContainer.style.display = 'none';
    } else {
        epContainer.style.display = 'block';
        epBadge.innerText = `Tổng cộng ${serverData.length} tập`;
    }

    serverData.forEach((tap, idx) => {
        const btn = document.createElement('button');
        btn.className = 'ep-btn';
        btn.innerText = tap.name || `Tập ${idx + 1}`;
        btn.onclick = () => playEpisode(idx, serverData);
        episodeList.appendChild(btn);
    });

    if (serverData[targetEpIndex]) {
        playEpisode(targetEpIndex, serverData);
    } else if (serverData.length > 0) {
        playEpisode(0, serverData);
    }
}

function playEpisode(index, serverData) {
    currentEpIndex = index;
    const tapPhim = serverData[index];
    document.querySelectorAll('.ep-btn').forEach((b, i) => b.classList.toggle('active', i === index));

    if (currentMovieData && currentMovieData.slug) {
        storage.set(CONFIG.STORAGE_KEYS.CURRENT_WATCH, {
            slug: currentMovieData.slug,
            source: currentMovieData.source || CONFIG.SOURCE_NAME,
            serverIndex: currentServerIndex || 0,
            episodeIndex: index
        });

        updateURLParams({
            watch: currentMovieData.slug,
            sv: currentServerIndex || 0,
            ep: index
        });
    }

    const m3u8Link = tapPhim.link_m3u8 || tapPhim.m3u8 || tapPhim.hls || tapPhim.link || "";
    const embedLink = tapPhim.link_embed || tapPhim.embed || tapPhim.url_embed || tapPhim.iframe || "";

    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (player) { player.stop(); }
    if (videoIframe) videoIframe.src = "";

    const playerMode = document.getElementById('playerModeSelect')?.value || 'iframe';

    const useIframe = (url) => {
        if (plyrWrapper) plyrWrapper.style.display = 'none';
        if (videoIframe) {
            videoIframe.style.display = 'block';
            videoIframe.src = url;
        }
    };

    const useHls = (url) => {
        if (plyrWrapper) plyrWrapper.style.display = 'block';
        if (videoIframe) videoIframe.style.display = 'none';
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls({
                maxBufferLength: 10,
                maxMaxBufferLength: 20,
                enableWorker: true,
                capLevelToPlayerSize: true,
                fragLoadingTimeOut: 6000,
                manifestLoadingTimeOut: 6000
            });
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(videoPlayer);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                player.play().catch(() => {});
            });
        } else if (videoPlayer && videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            videoPlayer.src = url;
        }
    };

    if (playerMode === 'hls') {
        if (m3u8Link) useHls(m3u8Link);
        else if (embedLink) useIframe(embedLink);
    } else {
        if (embedLink) useIframe(embedLink);
        else if (m3u8Link) useIframe(`https://player.phimapi.com/v1/?url=${encodeURIComponent(m3u8Link)}`);
    }
}

// Làm giàu dữ liệu thông tin phim từ TMDB
async function loadTMDBEnrichment(title, originalTitle, year) {
    const tmdbPill = document.getElementById('detailTmdbRating');
    const trailerBtn = document.getElementById('modalTrailerBtn');
    const castSection = document.getElementById('tmdbCastSection');
    const castList = document.getElementById('tmdbCastList');
    const similarSection = document.getElementById('tmdbSimilarSection');
    const similarList = document.getElementById('tmdbSimilarList');

    // Reset giao diện TMDB trước khi tải
    if (tmdbPill) tmdbPill.style.display = 'none';
    if (trailerBtn) trailerBtn.style.display = 'none';
    if (castSection) castSection.style.display = 'none';
    if (similarSection) similarSection.style.display = 'none';

    try {
        const tmdb = await getTMDBDetails(title, originalTitle, year);
        if (!tmdb) return;

        // Điểm đánh giá TMDB
        if (tmdb.voteAverage && tmdbPill) {
            tmdbPill.innerHTML = `⭐ <strong>${tmdb.voteAverage}</strong>/10 TMDB`;
            tmdbPill.title = `Dựa trên ${tmdb.voteCount} lượt đánh giá từ người dùng quốc tế TMDB`;
            tmdbPill.style.display = 'inline-flex';
        }

        // Trailer YouTube
        if (tmdb.trailerYoutubeKey && trailerBtn) {
            trailerBtn.style.display = 'inline-flex';
            trailerBtn.onclick = () => {
                window.open(`https://www.youtube.com/watch?v=${tmdb.trailerYoutubeKey}`, '_blank');
            };
        }

        // Danh sách diễn viên có Avatar hình ảnh
        if (tmdb.cast && tmdb.cast.length > 0 && castSection && castList) {
            castList.innerHTML = tmdb.cast.map(c => `
                <div class="tmdb-cast-item">
                    <img class="tmdb-cast-avatar" 
                         src="${c.profileUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60'}" 
                         alt="${c.name}" 
                         loading="lazy" 
                         onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60'">
                    <span class="tmdb-cast-name">${c.name}</span>
                    <span class="tmdb-cast-role">${c.character || 'Diễn viên'}</span>
                </div>
            `).join('');
            castSection.style.display = 'block';
        }

        // Danh sách phim tương tự
        if (tmdb.similar && tmdb.similar.length > 0 && similarSection && similarList) {
            similarList.innerHTML = tmdb.similar.map(s => `
                <div class="tmdb-similar-card" title="Tìm: ${s.title}" onclick="window.triggerSearchMovie('${s.title.replace(/'/g, "\\'")}')">
                    <img class="tmdb-similar-thumb" 
                         src="${s.posterUrl || CONFIG.DEFAULT_THUMB}" 
                         alt="${s.title}" 
                         loading="lazy"
                         onerror="this.src='${CONFIG.DEFAULT_THUMB}'">
                    <div class="tmdb-similar-info">
                        <span class="tmdb-similar-title">${s.title}</span>
                        <div class="tmdb-similar-meta">
                            <span>${s.year || ''}</span>
                            ${s.rating ? `<span>⭐ ${s.rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
            similarSection.style.display = 'block';
        }

    } catch (e) {
        console.warn('Lỗi hiển thị dữ liệu TMDB:', e);
    }
}
