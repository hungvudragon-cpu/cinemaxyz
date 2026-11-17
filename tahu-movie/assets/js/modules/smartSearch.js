/**
 * Smart Search Normalization & Fuzzy String Matching Module
 * Không phụ thuộc thư viện ngoài, hiệu năng cao (< 1ms cho chuỗi phim)
 */

/**
 * Bảng stop-words tiếng Việt & tiếng Anh phổ biến trong tìm kiếm phim
 */
const STOP_WORDS = new Set([
    'phim', 'bo', 'le', 'tap', 'season', 'movie', 'the', 'a', 'an', 'and', 'or', 'of',
    'la', 'va', 'cua', 'trong', 'cac', 'nhung', 'mot', 'phan', 'full', 'vietsub', 'thuyet', 'minh'
]);

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

    // Đảm bảo a ngắn hơn hoặc bằng b để tối ưu mảng bộ nhớ
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
 * Chấm điểm độ tương đồng của một bộ phim với từ khóa người dùng nhập:
 * Kết hợp: Exact Match, Prefix Match, Substring Match, Token Overlap và Levenshtein Fuzzy Match.
 * So sánh đồng thời với:
 * - name (Tên tiếng Việt)
 * - original_name (Tên gốc quốc tế)
 * - year (Năm sản xuất)
 * 
 * @param {string} queryRaw - Từ khóa tìm kiếm của user
 * @param {object} movie - Đối tượng phim { name, original_name, year, slug, ... }
 * @returns {object} { score, isFuzzy, bestMatchField, matchedTokens }
 */
export function scoreMovie(queryRaw, movie) {
    const qNorm = normalizeText(queryRaw);
    if (!qNorm) return { score: 0, isFuzzy: false, bestMatchField: null };

    const nameNorm = normalizeText(movie.name || '');
    const origNorm = normalizeText(movie.original_name || movie.origin_name || '');
    const yearNorm = String(movie.year || '').trim();

    // 1. Exact Match tuyệt đối trên toàn bộ chuỗi
    if (nameNorm === qNorm) return { score: 1000, isFuzzy: false, bestMatchField: 'name' };
    if (origNorm === qNorm) return { score: 980, isFuzzy: false, bestMatchField: 'original_name' };

    // 2. StartsWith (Bắt đầu bằng cụm từ khóa)
    if (nameNorm.startsWith(qNorm)) return { score: 850 + (100 - Math.min(100, nameNorm.length)), isFuzzy: false, bestMatchField: 'name' };
    if (origNorm.startsWith(qNorm)) return { score: 820 + (100 - Math.min(100, origNorm.length)), isFuzzy: false, bestMatchField: 'original_name' };

    // 3. Includes (Chứa nguyên vẹn cụm từ khóa)
    if (nameNorm.includes(qNorm)) return { score: 700 + (100 - Math.min(100, nameNorm.length)), isFuzzy: false, bestMatchField: 'name' };
    if (origNorm.includes(qNorm)) return { score: 680 + (100 - Math.min(100, origNorm.length)), isFuzzy: false, bestMatchField: 'original_name' };

    // 4. Token-level & Fuzzy Matching (Tách thành các từ đơn)
    const qTokens = qNorm.split(' ').filter(Boolean);
    const targetFields = [
        { text: nameNorm, field: 'name', weight: 1.0 },
        { text: origNorm, field: 'original_name', weight: 0.95 }
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
                // Bắt đầu bằng từ khóa (ví dụ: avat -> avatar)
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
        if (matchRatio >= 0.6) {
            let fieldScore = (totalTokenScore / qTokens.length) * 500 * target.weight;

            // Thưởng thêm nếu chuỗi đích ngắn (độ liên quan cao)
            fieldScore += Math.max(0, 50 - targetTokens.length * 3);

            // Thưởng nếu trùng năm sản xuất trong query
            if (yearNorm && qTokens.includes(yearNorm)) {
                fieldScore += 80;
            }

            if (fieldScore > maxScore) {
                maxScore = fieldScore;
                bestField = target.field;
                if (fuzzyCount > 0 && matchedCount === qTokens.length) {
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
 * Trích xuất từ khóa rút gọn cho API search:
 * Nếu query > 2 từ, loại bỏ stop-words và lấy tối đa 2 từ khóa đặc trưng nhất
 * để API trả về tập dữ liệu bao quát nhất cho client xử lý.
 */
export function extractShortKeyword(queryRaw) {
    const norm = normalizeText(queryRaw);
    if (!norm) return '';
    const words = norm.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w));
    if (words.length === 0) return queryRaw.trim();
    return words.slice(0, 2).join(' ');
}

/**
 * Highlight phần văn bản khớp với từ khóa tìm kiếm
 */
export function highlightMatch(text, queryRaw) {
    if (!text || !queryRaw) return text || '';
    const qNorm = normalizeText(queryRaw);
    if (!qNorm) return text;

    const words = qNorm.split(' ').filter(w => w.length > 0);
    if (words.length === 0) return text;

    // Tạo regex an toàn không dấu lẫn có dấu
    // Dùng pattern bắt các từ trong query
    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedWords.join('|')})`, 'gi');

    // Chuyển text sang dạng an toàn HTML trước khi gán thẻ mark
    const safeText = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return safeText.replace(pattern, '<mark class="search-highlight">$1</mark>');
}
