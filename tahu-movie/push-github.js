/**
 * Script tự động đẩy toàn bộ file của tahu-movie lên GitHub Repository:
 * hungvudragon-cpu/cinemaxyz (nhánh main)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'hungvudragon-cpu';
const REPO_NAME = 'cinemaxyz';
const BRANCH = 'main';
const TOKEN = process.env.GITHUB_TOKEN || process.argv[2];

if (!TOKEN) {
    console.error('LỖI: Chưa cung cấp GitHub Token!');
    console.error('Cách chạy: node push-github.js <TOKEN_CUA_BAN>');
    process.exit(1);
}

function githubRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(`https://api.github.com${endpoint}`);
        const options = {
            method: method,
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: {
                'User-Agent': 'Antigravity-Deployer',
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`GitHub API [${res.statusCode}]: ${parsed.message || body}`));
                    }
                } catch (e) {
                    reject(new Error(`Lỗi phân tích JSON: ${body}`));
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

function getAllFiles(dir, baseDir = '') {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        if (file === 'push-github.js' || file === 'server.js' || file === 'run.bat' || file.startsWith('.')) continue;
        const fullPath = path.join(dir, file);
        const relPath = path.join(baseDir, file).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(getAllFiles(fullPath, relPath));
        } else {
            results.push({ fullPath, relPath });
        }
    }
    return results;
}

async function deploy() {
    try {
        console.log(`1. Lấy thông tin commit mới nhất từ nhánh '${BRANCH}'...`);
        const ref = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`);
        const latestCommitSha = ref.object.sha;
        console.log(`   SHA mới nhất: ${latestCommitSha}`);

        const commit = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${latestCommitSha}`);
        const baseTreeSha = commit.tree.sha;

        console.log(`2. Đọc các file trong thư mục dự án và tạo Blobs...`);
        const projectDir = __dirname;
        const files = getAllFiles(projectDir);
        console.log(`   Tìm thấy ${files.length} file cần tải lên:`);
        files.forEach(f => console.log(`   - ${f.relPath}`));

        const treeEntries = [];
        for (const f of files) {
            const content = fs.readFileSync(f.fullPath, 'utf8');
            const blob = await githubRequest('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
                content: content,
                encoding: 'utf-8'
            });
            treeEntries.push({
                path: f.relPath,
                mode: '100644',
                type: 'blob',
                sha: blob.sha
            });
        }

        console.log(`3. Tạo Git Tree mới...`);
        const newTree = await githubRequest('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
            tree: treeEntries
        });

        console.log(`4. Tạo Commit mới...`);
        const newCommit = await githubRequest('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
            message: 'Cập nhật giao diện mới (tách nhỏ mô-đun, sửa responsive mobile search)',
            tree: newTree.sha,
            parents: [latestCommitSha]
        });

        console.log(`5. Cập nhật nhánh '${BRANCH}' lên commit mới...`);
        await githubRequest('PATCH', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, {
            sha: newCommit.sha,
            force: true
        });

        console.log('\n=======================================================');
        console.log('🎉 THÀNH CÔNG! ĐÃ DEPLOY LÊN GITHUB HOÀN TẤT!');
        console.log(`Link Repo: https://github.com/${REPO_OWNER}/${REPO_NAME}`);
        console.log('Website sẽ tự động cập nhật sau 1-2 phút!');
        console.log('=======================================================');
    } catch (err) {
        console.error('\n❌ Thất bại:', err.message);
    }
}

deploy();
