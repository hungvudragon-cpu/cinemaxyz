import { CONFIG } from './config.js';
import { storage, showToast, startTransition, endTransition, getSafeImageUrl, extractNames, updateURLParams } from './utils.js';
import { isFavorite, toggleFavorite, saveToHistory, getWatchedEpisodes, addWatchedEpisode } from './storage.js';
import { fetchMovieDetail } from './api.js';
import { getTMDBDetails } from './tmdb.js';

let player = null;
let hlsInstance = null;
let currentMovieData = null;
let currentServerIndex = 0;
let currentEpIndex = 0;
let globalMovieEpisodes = [];
let currentServerEpisodes = [];
let activeChunkIndex = 0;
const EPISODES_PER_CHUNK = 40;

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
    const btn = document.getElementById('modalFavBtn');
    const svg = document.getElementById('modalFavSvg');
    const label = document.getElementById('modalFavLabel');
    if (btn) btn.classList.toggle('active', isFav);
    if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
    if (label) label.innerText = isFav ? 'Đã thích' : 'Yêu thích';
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
            showToast('Đã sao chép link tập phim vào bộ nhớ tạm!');
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
        const movieImg = getSafeImageUrl(movieDetail);

        currentMovieData = {
            slug: slug,
            source: source,
            name: movieDetail.name || "Đang cập nhật",
            originalName: originalName,
            image: movieImg,
            episode_current: movieDetail.episode_current || "FHD"
        };

        // Ambient theater glow backdrop
        const theaterGlow = document.getElementById('theaterAmbientGlow');
        if (theaterGlow && movieImg) {
            theaterGlow.style.backgroundImage = `url('${movieImg}')`;
            theaterGlow.style.backgroundSize = 'cover';
            theaterGlow.style.backgroundPosition = 'center';
        }

        saveToHistory(currentMovieData);
        updateModalFavBtn(isFavorite(slug, source));

        document.getElementById('detailTitle').innerText = movieDetail.name || "Đang cập nhật...";
        document.getElementById('detailOriginalTitle').innerText = originalName;
        document.getElementById('detailYear').innerText = movieDetail.year || "2026";
        document.getElementById('detailQuality').innerText = movieDetail.quality || movieDetail.episode_current || "FHD";
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
        content.style.display = 'grid';

        // Gọi dữ liệu từ TMDB để bổ sung Backdrop 4K, Điểm TMDB, Trailer YouTube, Diễn viên kèm ảnh và Phim tương tự
        loadTMDBEnrichment(movieDetail.name, originalName, movieDetail.year);

        const serverContainer = document.getElementById('serverContainer');
        if (globalMovieEpisodes.length > 0) {
            serverContainer.style.display = 'block';
            globalMovieEpisodes.forEach((server, index) => {
                const btn = document.createElement('button');
                btn.className = 'server-btn' + (index === 0 ? ' active' : '');
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
        if (content) content.style.display = 'grid';
        endTransition();
    }
}

function selectServer(serverIndex, targetEpIndex = 0) {
    currentServerIndex = serverIndex;
    document.querySelectorAll('.server-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === serverIndex);
    });

    currentServerEpisodes = globalMovieEpisodes[serverIndex]?.server_data || globalMovieEpisodes[serverIndex]?.items || [];
    const epContainer = document.getElementById('episodeContainer');
    const epBadge = document.getElementById('episodeCountBadge');

    if (currentServerEpisodes.length <= 1) {
        epContainer.style.display = 'none';
    } else {
        epContainer.style.display = 'block';
        epBadge.innerText = `${currentServerEpisodes.length} Tập`;
    }

    // Xác định chunk ban đầu dựa vào targetEpIndex
    activeChunkIndex = Math.floor(targetEpIndex / EPISODES_PER_CHUNK);
    renderEpisodeControls(currentServerEpisodes, targetEpIndex);

    if (currentServerEpisodes[targetEpIndex]) {
        playEpisode(targetEpIndex, currentServerEpisodes);
    } else if (currentServerEpisodes.length > 0) {
        playEpisode(0, currentServerEpisodes);
    }
}

/**
 * Render thanh điều khiển phân đoạn tập (Chunks/Pagination) và danh sách nút tập
 */
function renderEpisodeControls(serverData, activeIndex = 0) {
    const epContainer = document.getElementById('episodeContainer');
    if (!epContainer) return;

    let chunkContainer = document.getElementById('episodeChunkBar');
    if (!chunkContainer) {
        chunkContainer = document.createElement('div');
        chunkContainer.id = 'episodeChunkBar';
        chunkContainer.className = 'episode-chunk-bar';
        const epHeader = epContainer.querySelector('.controls-header');
        if (epHeader && epHeader.nextSibling) {
            epContainer.insertBefore(chunkContainer, epHeader.nextSibling);
        } else {
            epContainer.prepend(chunkContainer);
        }
    }

    const totalEps = serverData.length;
    const numChunks = Math.ceil(totalEps / EPISODES_PER_CHUNK);

    // Nếu số tập > EPISODES_PER_CHUNK (vd: 50, 100, 131 tập như Dragon Ball Super): hiện tab phân nhóm
    if (numChunks > 1) {
        chunkContainer.style.display = 'flex';
        chunkContainer.innerHTML = '';
        for (let i = 0; i < numChunks; i++) {
            const startEp = i * EPISODES_PER_CHUNK + 1;
            const endEp = Math.min((i + 1) * EPISODES_PER_CHUNK, totalEps);
            const tab = document.createElement('button');
            tab.className = 'ep-chunk-tab' + (i === activeChunkIndex ? ' active' : '');
            tab.innerText = `Tập ${startEp} - ${endEp}`;
            tab.onclick = () => {
                activeChunkIndex = i;
                document.querySelectorAll('.ep-chunk-tab').forEach((t, idx) => t.classList.toggle('active', idx === i));
                renderEpisodeButtons(serverData, currentEpIndex);
            };
            chunkContainer.appendChild(tab);
        }
    } else {
        chunkContainer.style.display = 'none';
        chunkContainer.innerHTML = '';
    }

    renderEpisodeButtons(serverData, activeIndex);
}

/**
 * Render danh sách các nút tập thuộc nhóm hiện tại
 */
function renderEpisodeButtons(serverData, activeIndex = 0) {
    const episodeList = document.getElementById('episodeList');
    if (!episodeList) return;
    episodeList.innerHTML = '';

    const totalEps = serverData.length;
    const numChunks = Math.ceil(totalEps / EPISODES_PER_CHUNK);

    let start = 0;
    let end = totalEps;
    if (numChunks > 1) {
        start = activeChunkIndex * EPISODES_PER_CHUNK;
        end = Math.min(start + EPISODES_PER_CHUNK, totalEps);
    }

    const watchedEpisodes = currentMovieData?.slug ? getWatchedEpisodes(currentMovieData.slug) : [];

    for (let idx = start; idx < end; idx++) {
        const tap = serverData[idx];
        const btn = document.createElement('button');
        const isWatched = watchedEpisodes.includes(idx);
        const isActive = idx === activeIndex;
        btn.className = 'ep-btn' + (isActive ? ' active' : '') + (isWatched && !isActive ? ' watched' : '');
        btn.setAttribute('data-ep-idx', idx);
        btn.innerText = tap.name || `Tập ${idx + 1}`;
        btn.onclick = () => playEpisode(idx, serverData);
        episodeList.appendChild(btn);

        if (isActive) {
            setTimeout(() => {
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    }
}

/**
 * Phát một tập phim cụ thể và cập nhật giao diện
 */
function playEpisode(index, serverData) {
    currentEpIndex = index;
    const tapPhim = serverData[index];
    if (!tapPhim) return;

    // Đảm bảo activeChunkIndex bao quát tập đang phát
    const chunkOfEp = Math.floor(index / EPISODES_PER_CHUNK);
    if (chunkOfEp !== activeChunkIndex) {
        activeChunkIndex = chunkOfEp;
        document.querySelectorAll('.ep-chunk-tab').forEach((t, idx) => t.classList.toggle('active', idx === chunkOfEp));
        renderEpisodeButtons(serverData, index);
    }

    // Ghi nhận tập đã xem
    if (currentMovieData?.slug) {
        addWatchedEpisode(currentMovieData.slug, index);
    }

    // Cập nhật trạng thái active của nút tập
    document.querySelectorAll('.ep-btn').forEach((b) => {
        const epIdx = parseInt(b.getAttribute('data-ep-idx'), 10);
        b.classList.toggle('active', epIdx === index);
        if (epIdx === index) b.classList.remove('watched');
    });

    // Cập nhật hoặc chèn thanh Quick Nav (Tập trước / Tập tiếp)
    updateQuickEpisodeNav(index, serverData);

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

    // Phát video qua nguồn Embed iFrame chuẩn của nhà cung cấp
    if (embedLink) {
        if (plyrWrapper) plyrWrapper.style.display = 'none';
        videoIframe.style.display = 'block';
        videoIframe.src = embedLink;
    } else if (m3u8Link) {
        if (videoIframe) videoIframe.style.display = 'none';
        if (plyrWrapper) plyrWrapper.style.display = 'block';

        if (Hls.isSupported() && videoPlayer) {
            hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });
            hlsInstance.loadSource(m3u8Link);
            hlsInstance.attachMedia(videoPlayer);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                player?.play()?.catch(() => {});
            });
        } else if (videoIframe) {
            if (plyrWrapper) plyrWrapper.style.display = 'none';
            videoIframe.style.display = 'block';
            videoIframe.src = `https://player.phimapi.com/v1/?url=${encodeURIComponent(m3u8Link)}`;
        }
    }
}

/**
 * Cập nhật thanh Quick Nav: Tập trước / Đang phát / Tập kế tiếp
 */
function updateQuickEpisodeNav(index, serverData) {
    let navWrap = document.getElementById('playerQuickNav');
    const playerFrame = document.querySelector('.theater-player-frame');
    if (!playerFrame) return;

    if (!navWrap) {
        navWrap = document.createElement('div');
        navWrap.id = 'playerQuickNav';
        navWrap.className = 'player-quick-nav';
        playerFrame.appendChild(navWrap);
    }

    if (!serverData || serverData.length <= 1) {
        navWrap.style.display = 'none';
        return;
    }

    navWrap.style.display = 'flex';
    const currentName = serverData[index]?.name || `Tập ${index + 1}`;
    const hasPrev = index > 0;
    const hasNext = index < serverData.length - 1;

    navWrap.innerHTML = `
        <button class="quick-ep-btn" id="quickPrevEp" ${hasPrev ? '' : 'disabled'} title="Tập trước">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            <span>Tập trước</span>
        </button>
        <div class="quick-ep-current">
            <span class="quick-ep-indicator"></span>
            <span>Đang phát: <strong>${currentName}</strong></span>
        </div>
        <button class="quick-ep-btn" id="quickNextEp" ${hasNext ? '' : 'disabled'} title="Tập tiếp theo">
            <span>Tập tiếp</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
    `;

    document.getElementById('quickPrevEp')?.addEventListener('click', () => {
        if (hasPrev) playEpisode(index - 1, serverData);
    });

    document.getElementById('quickNextEp')?.addEventListener('click', () => {
        if (hasNext) playEpisode(index + 1, serverData);
    });
}

// Làm giàu dữ liệu thông tin phim từ TMDB
async function loadTMDBEnrichment(title, originalTitle, year) {
    const tmdbPill = document.getElementById('detailTmdbRating');
    const trailerBtn = document.getElementById('modalTrailerBtn');
    const castSection = document.getElementById('tmdbCastSection');
    const castList = document.getElementById('tmdbCastList');
    const similarSection = document.getElementById('tmdbSimilarSection');
    const similarList = document.getElementById('tmdbSimilarList');

    if (tmdbPill) tmdbPill.style.display = 'none';
    if (trailerBtn) trailerBtn.style.display = 'none';
    if (castSection) castSection.style.display = 'none';
    if (similarSection) similarSection.style.display = 'none';

    try {
        const tmdb = await getTMDBDetails(title, originalTitle, year);
        if (!tmdb) return;

        // Điểm đánh giá TMDB
        if (tmdb.voteAverage && tmdbPill) {
            tmdbPill.innerHTML = `
                <svg viewBox="0 0 24 24" width="13" height="13" fill="#f59e0b" style="display:inline-block; vertical-align:-1px;">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <strong>${tmdb.voteAverage}</strong>/10 TMDB
            `;
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
            const fallbackAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60';
            castList.innerHTML = tmdb.cast.map(c => `
                <div class="tmdb-cast-item">
                    <img class="tmdb-cast-avatar" 
                         src="${c.profileUrl || fallbackAvatar}" 
                         alt="${c.name}" 
                         loading="lazy" 
                         onerror="this.onerror=null; this.src='${fallbackAvatar}'">
                    <span class="tmdb-cast-name" title="${c.name}">${c.name}</span>
                    <span class="tmdb-cast-role" title="${c.character || 'Diễn viên'}">${c.character || 'Diễn viên'}</span>
                </div>
            `).join('');
            castSection.style.display = 'block';
        }

        // Danh sách phim tương tự
        if (tmdb.similar && tmdb.similar.length > 0 && similarSection && similarList) {
            similarList.innerHTML = tmdb.similar.map(s => `
                <div class="tmdb-similar-card" title="Tìm kiếm: ${s.title}" onclick="window.triggerSearchMovie('${s.title.replace(/'/g, "\\'")}')">
                    <img class="tmdb-similar-thumb" 
                         src="${s.posterUrl || CONFIG.DEFAULT_THUMB}" 
                         alt="${s.title}" 
                         loading="lazy"
                         onerror="this.onerror=null; this.src='${CONFIG.DEFAULT_THUMB}'">
                    <div class="tmdb-similar-info">
                        <span class="tmdb-similar-title">${s.title}</span>
                        <div class="tmdb-similar-meta">
                            <span>${s.year || ''}</span>
                            ${s.rating ? `
                                <span>•</span>
                                <span>⭐ ${s.rating}</span>
                            ` : ''}
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
