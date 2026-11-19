/**
 * Smart Search Normalization, Fuzzy String Matching, Typo Correction & Aliases Module
 * Thiết kế hiệu năng cao (< 1ms), không phụ thuộc thư viện ngoài.
 */

// Bảng stop-words tiếng Việt & tiếng Anh phổ biến trong tìm kiếm phim
const STOP_WORDS = new Set([
    'phim', 'bo', 'le', 'tap', 'season', 'movie', 'the', 'a', 'an', 'and', 'or', 'of',
    'la', 'va', 'cua', 'trong', 'cac', 'nhung', 'mot', 'phan', 'full', 'vietsub', 'thuyet', 'minh'
]);

// Bảng từ điển sửa lỗi chính tả phổ biến khi gõ nhanh / sai âm
const TYPO_DICTIONARY = {
    'drangon': 'dragon',
    'drangonball': 'dragon ball',
    'dragonball': 'dragon ball',
    'bal': 'ball',
    'supper': 'super',
    'peice': 'piece',
    'onepiece': 'one piece',
    'avater': 'avatar',
    'doremon': 'doraemon',
    'narutoo': 'naruto',
    'spiderman': 'spider-man',
    'batman': 'batman',
    'ironman': 'iron man',
    'jujusu': 'jujutsu',
    'jujitsu': 'jujutsu',
    'kaizen': 'kaisen',
    'oppenheime': 'oppenheimer',
    'interstella': 'interstellar',
    'transfomer': 'transformers',
    'transformer': 'transformers',
    'conann': 'conan',
    'pokemom': 'pokemon',
    'pokeman': 'pokemon',
    'kimetsu': 'kimetsu no yaiba',
    'titans': 'titan',
    'movi': 'movie',
    'seasion': 'season',
    'sieu cap': 'super',
    'huyen thoai': 'broly'
};

// Bảng ánh xạ từ đồng nghĩa / Tên tiếng Việt <-> Tên quốc tế của các series kinh điển
const ALIAS_MAP = [
    {
        patterns: [/dragon\s*ball\s*super/i, /bay\s*vien\s*ngoc\s*rong\s*sieu\s*cap/i, /ngoc\s*rong\s*sieu\s*cap/i],
        primary: 'Dragon Ball Super',
        queries: ['Dragon Ball Super', 'Bảy Viên Ngọc Rồng Siêu Cấp', 'Dragon Ball']
    },
    {
        patterns: [/dragon\s*ball/i, /bay\s*vien\s*ngoc\s*rong/i, /ngoc\s*rong/i, /7\s*vien\s*ngoc\s*rong/i],
        primary: 'Dragon Ball',
        queries: ['Dragon Ball', 'Bảy Viên Ngọc Rồng']
    },
    {
        patterns: [/one\s*piece/i, /dao\s*hai\s*tac/i, /vua\s*hai\s*tac/i],
        primary: 'One Piece',
        queries: ['One Piece', 'Đảo Hải Tặc', 'Vua Hải Tặc']
    },
    {
        patterns: [/conan/i, /tham\s*tu\s*lung\s*danh\s*conan/i],
        primary: 'Thám Tử Lừng Danh Conan',
        queries: ['Conan', 'Thám Tử Lừng Danh Conan']
    },
    {
        patterns: [/doraemon/i, /doremon/i],
        primary: 'Doraemon',
        queries: ['Doraemon', 'Doremon']
    },
    {
        patterns: [/naruto/i],
        primary: 'Naruto',
        queries: ['Naruto', 'Naruto Shippuden']
    },
    {
        patterns: [/jujutsu\s*kaisen/i, /chu\s*thuat\s*hoi\s*chien/i],
        primary: 'Jujutsu Kaisen',
        queries: ['Jujutsu Kaisen', 'Chú Thuật Hồi Chiến']
    },
    {
        patterns: [/kimetsu\s*no\s*yaiba/i, /demon\s*slayer/i, /thanh\s*guom\s*diet\s*quy/i],
        primary: 'Kimetsu no Yaiba',
        queries: ['Kimetsu no Yaiba', 'Demon Slayer', 'Thanh Gươm Diệt Quỷ']
    },
    {
        patterns: [/attack\s*on\s*titan/i, /dai\s*chien\s*titan/i, /shingeki\s*no\s*kyojin/i],
        primary: 'Attack on Titan',
        queries: ['Attack on Titan', 'Đại Chiến Titan']
    },
    {
        patterns: [/spider\s*-?\s*man/i, /nguoi\s*nhen/i],
        primary: 'Spider-Man',
        queries: ['Spider-Man', 'Người Nhện']
    },
    {
        patterns: [/batman/i, /nguoi\s*doi/i],
        primary: 'Batman',
        queries: ['Batman', 'Người Dơi']
    },
    {
        patterns: [/iron\s*man/i, /nguoi\s*sat/i],
        primary: 'Iron Man',
        queries: ['Iron Man', 'Người Sắt']
    },
    {
        patterns: [/avengers/i, /biet\s*doi\s*sieu\s*anh\s*hung/i],
        primary: 'Avengers',
        queries: ['Avengers', 'Biệt Đội Siêu Anh Hùng']
    },
    {
        patterns: [/avatar/i],
        primary: 'Avatar',
        queries: ['Avatar']
    },
    {
        patterns: [/soul\s*land/i, /dau\s*la\s*dai\s*luc/i],
        primary: 'Đấu La Đại Lục',
        queries: ['Đấu La Đại Lục', 'Soul Land']
    },
    {
        patterns: [/battle\s*through\s*the\s*heavens/i, /dau\s*pha\s*thuong\s*khung/i],
        primary: 'Đấu Phá Thương Khung',
        queries: ['Đấu Phá Thương Khung', 'Battle Through the Heavens']
    }
];

// Danh sách các từ khóa chuẩn cho gợi ý fuzzy typo
const CANONICAL_KEYWORDS = [
    'dragon ball', 'dragon ball super', 'dragon ball z', 'dragon ball gt',
    'one piece', 'naruto', 'doraemon', 'conan', 'avatar',
    'spider-man', 'batman', 'iron man', 'avengers',
    'jujutsu kaisen', 'demon slayer', 'kimetsu no yaiba', 'attack on titan',
    'harry potter', 'oppenheimer', 'interstellar', 'transformers',
    'fast and furious', 'bay vien ngoc rong', 'dao hai tac',
    'tham tu lung danh conan', 'thanh guom diet quy', 'chu thuat hoi chien',
    'dau la dai luc', 'dau pha thuong khung', 'the gioi hoan my'
];

/**
 * Chuẩn hóa chuỗi văn bản:
 * - Khử dấu tiếng Việt
 * - Chuyển sang chữ thường
 * - Thay đ/Đ thành d
 * - Loại bỏ ký tự đặc biệt, chuẩn hóa khoảng trắng đơn
 */
export function normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Khử dấu kết hợp unicode
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .replace(/[^a-z0-9\s]/g, ' ')   // Bỏ ký tự đặc biệt
        .replace(/\s+/g, ' ')           // Gộp nhiều khoảng trắng
        .trim();
}

/**
 * Tính Levenshtein Distance tối ưu bộ nhớ O(min(m, n))
 */
export function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    if (a.length > b.length) {
        const tmp = a;
        a = b;
        b = tmp;
    }

    const aLen = a.length;
    const bLen = b.length;
    let prevRow = new Array(aLen + 1);
    let currRow = new Array(aLen + 1);

    for (let i = 0; i <= aLen; i++) {
        prevRow[i] = i;
    }

    for (let j = 1; j <= bLen; j++) {
        currRow[0] = j;
        const bChar = b.charCodeAt(j - 1);

        for (let i = 1; i <= aLen; i++) {
            const cost = a.charCodeAt(i - 1) === bChar ? 0 : 1;
            currRow[i] = Math.min(
                currRow[i - 1] + 1,       // Insertion
                prevRow[i] + 1,           // Deletion
                prevRow[i - 1] + cost     // Substitution
            );
        }

        for (let i = 0; i <= aLen; i++) {
            prevRow[i] = currRow[i];
        }
    }

    return currRow[aLen];
}

/**
 * Tỷ lệ tương đồng giữa 2 từ dựa trên Levenshtein (0 đến 1.0)
 */
export function wordSimilarity(w1, w2) {
    if (w1 === w2) return 1.0;
    const maxLen = Math.max(w1.length, w2.length);
    if (maxLen === 0) return 1.0;
    const dist = levenshteinDistance(w1, w2);
    return Math.max(0, 1 - dist / maxLen);
}

/**
 * Tự động sửa lỗi chính tả của từ khóa dựa trên từ điển và Levenshtein
 * Trả về { correctedQuery, hasTypo, suggestion }
 */
export function correctQueryTypos(queryRaw) {
    if (!queryRaw || typeof queryRaw !== 'string') {
        return { correctedQuery: '', hasTypo: false, suggestion: null };
    }

    const clean = queryRaw.trim();
    const norm = normalizeText(clean);
    if (!norm) return { correctedQuery: clean, hasTypo: false, suggestion: null };

    // 1. Kiểm tra trực tiếp cả cụm từ với CANONICAL_KEYWORDS
    let bestCanonical = null;
    let minCanonicalDist = Infinity;
    for (const canon of CANONICAL_KEYWORDS) {
        const dist = levenshteinDistance(norm, canon);
        const maxLen = Math.max(norm.length, canon.length);
        const sim = 1 - dist / maxLen;
        if (dist > 0 && dist <= 2 && sim >= 0.75 && dist < minCanonicalDist) {
            minCanonicalDist = dist;
            bestCanonical = canon;
        }
    }

    if (bestCanonical) {
        return {
            correctedQuery: bestCanonical,
            hasTypo: true,
            suggestion: bestCanonical
        };
    }

    // 2. Kiểm tra từng từ với TYPO_DICTIONARY và loại bỏ lặp ký tự (ví dụ: drangon -> dragon, bal -> ball)
    const words = norm.split(' ').filter(Boolean);
    let changed = false;
    const correctedWords = words.map(w => {
        // Khử ký tự lặp >= 3 lần (vd: draagon -> dragon, conann -> conan)
        const deDup = w.replace(/(.)\1{2,}/g, '$1$1');
        if (TYPO_DICTIONARY[deDup]) {
            changed = true;
            return TYPO_DICTIONARY[deDup];
        }
        if (TYPO_DICTIONARY[w]) {
            changed = true;
            return TYPO_DICTIONARY[w];
        }

        // Fuzzy match từ đơn với các từ trong từ điển nếu từ >= 4 ký tự
        if (w.length >= 4) {
            for (const [typo, fixed] of Object.entries(TYPO_DICTIONARY)) {
                if (Math.abs(w.length - typo.length) <= 1) {
                    const d = levenshteinDistance(w, typo);
                    if (d <= 1) {
                        changed = true;
                        return fixed;
                    }
                }
            }
        }
        return w;
    });

    const correctedQuery = correctedWords.join(' ');
    return {
        correctedQuery: changed ? correctedQuery : clean,
        hasTypo: changed,
        suggestion: changed ? correctedQuery : null
    };
}

/**
 * Tìm các từ khóa mở rộng (Aliases / Đồng nghĩa) của từ khóa tìm kiếm
 */
export function getSearchAliases(queryRaw) {
    const norm = normalizeText(queryRaw);
    if (!norm) return [];

    const results = [];
    for (const item of ALIAS_MAP) {
        for (const pattern of item.patterns) {
            if (pattern.test(norm)) {
                item.queries.forEach(q => {
                    if (!results.includes(q)) results.push(q);
                });
                break;
            }
        }
    }
    return results;
}

/**
 * Sinh danh sách các truy vấn thông minh theo thứ tự ưu tiên:
 * 1. Query gốc (giữ nguyên không cắt bớt!)
 * 2. Query đã sửa lỗi chính tả
 * 3. Các từ khóa đồng nghĩa / Alias (Việt <-> Anh)
 * 4. Sub-queries fallback (loại bỏ stop words / lấy các từ khóa chính)
 */
export function generateSearchQueries(queryRaw) {
    const raw = (queryRaw || '').trim();
    if (!raw) return [];

    const queryList = [];
    const seen = new Set();

    const addQuery = (q) => {
        const norm = normalizeText(q);
        if (norm && !seen.has(norm)) {
            seen.add(norm);
            queryList.push(q);
        }
    };

    // 1. Query gốc đầy đủ
    addQuery(raw);

    // 2. Query đã sửa lỗi typo
    const typoResult = correctQueryTypos(raw);
    if (typoResult.hasTypo && typoResult.correctedQuery) {
        addQuery(typoResult.correctedQuery);
    }

    // 3. Aliases (tên tiếng Việt <-> tên tiếng Anh tương đương)
    const aliases = getSearchAliases(raw);
    aliases.forEach(a => addQuery(a));

    // 4. Sub-queries dự phòng nếu query dài >= 3 từ
    const norm = normalizeText(raw);
    const words = norm.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w));
    if (words.length >= 3) {
        // Thử bỏ 1 từ cuối hoặc từ đầu
        addQuery(words.slice(0, words.length - 1).join(' '));
        addQuery(words.slice(1).join(' '));
    }

    return queryList;
}

/**
 * Trích xuất từ khóa cho API search:
 * Tuyệt đối KHÔNG cắt cụt từ khóa (như từ 3 từ thành 2 từ)!
 * Chỉ loại bỏ ký tự rác hoặc stop words không cần thiết.
 */
export function extractShortKeyword(queryRaw) {
    const norm = normalizeText(queryRaw);
    if (!norm) return (queryRaw || '').trim();

    // Giữ nguyên query gốc để API tìm kiếm chuẩn xác
    return norm;
}

/**
 * Chấm điểm độ tương đồng của một bộ phim với từ khóa người dùng nhập:
 * Kết hợp: Exact Match, Prefix Match, Substring Match, Token Overlap,
 * Alias Match và Levenshtein Fuzzy Match.
 * 
 * @param {string} queryRaw - Từ khóa tìm kiếm của user
 * @param {object} movie - Đối tượng phim { name, original_name, year, slug, ... }
 * @returns {object} { score, isFuzzy, bestMatchField }
 */
export function scoreMovie(queryRaw, movie) {
    const qNorm = normalizeText(queryRaw);
    if (!qNorm) return { score: 0, isFuzzy: false, bestMatchField: null };

    const nameNorm = normalizeText(movie.name || '');
    const origNorm = normalizeText(movie.original_name || movie.origin_name || '');
    const slugNorm = normalizeText((movie.slug || '').replace(/-/g, ' '));
    const yearNorm = String(movie.year || '').trim();

    // 1. Exact Match tuyệt đối trên toàn bộ chuỗi
    if (nameNorm === qNorm) return { score: 1000, isFuzzy: false, bestMatchField: 'name' };
    if (origNorm === qNorm) return { score: 980, isFuzzy: false, bestMatchField: 'original_name' };
    if (slugNorm === qNorm) return { score: 950, isFuzzy: false, bestMatchField: 'slug' };

    // 2. StartsWith (Bắt đầu bằng cụm từ khóa)
    if (nameNorm.startsWith(qNorm)) return { score: 880 + Math.max(0, 50 - nameNorm.length), isFuzzy: false, bestMatchField: 'name' };
    if (origNorm.startsWith(qNorm)) return { score: 860 + Math.max(0, 50 - origNorm.length), isFuzzy: false, bestMatchField: 'original_name' };

    // 3. Includes (Chứa nguyên vẹn cụm từ khóa)
    if (nameNorm.includes(qNorm)) return { score: 750 + Math.max(0, 50 - nameNorm.length), isFuzzy: false, bestMatchField: 'name' };
    if (origNorm.includes(qNorm)) return { score: 730 + Math.max(0, 50 - origNorm.length), isFuzzy: false, bestMatchField: 'original_name' };
    if (slugNorm.includes(qNorm)) return { score: 700 + Math.max(0, 50 - slugNorm.length), isFuzzy: false, bestMatchField: 'slug' };

    // 4. Token-level & Fuzzy Matching (Tách thành các từ đơn)
    const typoCheck = correctQueryTypos(queryRaw);
    const effectiveQuery = typoCheck.correctedQuery ? normalizeText(typoCheck.correctedQuery) : qNorm;
    const qTokens = effectiveQuery.split(' ').filter(Boolean);

    const targetFields = [
        { text: nameNorm, field: 'name', weight: 1.0 },
        { text: origNorm, field: 'original_name', weight: 0.98 },
        { text: slugNorm, field: 'slug', weight: 0.92 }
    ];

    let maxScore = 0;
    let isFuzzyMatch = false;
    let bestField = 'name';

    for (const target of targetFields) {
        if (!target.text) continue;
        const targetTokens = target.text.split(' ').filter(Boolean);
        if (targetTokens.length === 0) continue;

        let totalTokenScore = 0;
        let matchedCount = 0;
        let fuzzyCount = 0;

        for (const qWord of qTokens) {
            let bestWordScore = 0;

            for (const tWord of targetTokens) {
                // Khớp từ chính xác
                if (qWord === tWord) {
                    bestWordScore = Math.max(bestWordScore, 1.0);
                    break;
                }
                // Bắt đầu bằng từ khóa
                if (tWord.startsWith(qWord) && qWord.length >= 2) {
                    const ratio = qWord.length / tWord.length;
                    bestWordScore = Math.max(bestWordScore, 0.8 + 0.15 * ratio);
                    continue;
                }
                // Chứa từ khóa
                if (tWord.includes(qWord) && qWord.length >= 3) {
                    bestWordScore = Math.max(bestWordScore, 0.7);
                    continue;
                }
                // Fuzzy Levenshtein (cho gõ sai chính tả từ >= 3 ký tự)
                if (qWord.length >= 3 && Math.abs(qWord.length - tWord.length) <= 2) {
                    const sim = wordSimilarity(qWord, tWord);
                    if (sim >= 0.7) {
                        bestWordScore = Math.max(bestWordScore, sim * 0.85);
                        fuzzyCount++;
                    }
                }
            }

            if (bestWordScore > 0) {
                totalTokenScore += bestWordScore;
                matchedCount++;
            }
        }

        // Tỷ lệ khớp token
        const matchRatio = matchedCount / qTokens.length;
        if (matchRatio >= 0.5) {
            let fieldScore = (totalTokenScore / qTokens.length) * 550 * target.weight;

            // Thưởng thêm nếu chuỗi đích ngắn (độ liên quan cao)
            fieldScore += Math.max(0, 50 - targetTokens.length * 2);

            // Thưởng nếu trùng năm sản xuất trong query
            if (yearNorm && qTokens.includes(yearNorm)) {
                fieldScore += 80;
            }

            if (fieldScore > maxScore) {
                maxScore = fieldScore;
                bestField = target.field;
                if (fuzzyCount > 0 || typoCheck.hasTypo) {
                    isFuzzyMatch = true;
                }
            }
        }
    }

    return {
        score: Math.round(maxScore),
        isFuzzy: isFuzzyMatch || (maxScore > 0 && maxScore < 600),
        bestMatchField: bestField
    };
}

/**
 * Highlight phần văn bản khớp với từ khóa tìm kiếm (hỗ trợ cả từ khóa đã sửa typo)
 */
export function highlightMatch(text, queryRaw) {
    if (!text || !queryRaw) return text || '';
    const qNorm = normalizeText(queryRaw);
    if (!qNorm) return text;

    const typo = correctQueryTypos(queryRaw);
    const wordsSet = new Set(qNorm.split(' ').filter(w => w.length > 0));
    if (typo.hasTypo && typo.correctedQuery) {
        normalizeText(typo.correctedQuery).split(' ').forEach(w => {
            if (w.length > 0) wordsSet.add(w);
        });
    }

    const words = Array.from(wordsSet);
    if (words.length === 0) return text;

    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedWords.join('|')})`, 'gi');

    const safeText = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return safeText.replace(pattern, '<mark class="search-highlight">$1</mark>');
}
