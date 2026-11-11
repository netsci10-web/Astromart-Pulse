import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const ASTROMART_BASE = 'https://www.astromart.co.kr';
const MARKET_URL = 'https://www.astromart.co.kr/market/?mod=list';

async function generateSnapshot() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(MARKET_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const posts = [];
    const nowIso = new Date().toISOString();

    $('.kboard-list tbody tr').each((_, el) => {
      const $row = $(el);
      const isNotice = $row.hasClass('kboard-list-notice');
      const cat =
        $row.find('td.kboard-list-category1').first().text().trim() ||
        $row.find('.kboard-mobile-contents.kboard-category1').first().text().trim() ||
        (isNotice ? '공지' : '기타');

      const $titleLink = $row.find('td.kboard-list-title a').first();
      const href = $titleLink.attr('href') || '';
      const uidMatch = href.match(/uid=(\d+)/);
      const uid = uidMatch ? uidMatch[1] : '';
      if (!uid) return;

      const commentRaw = $titleLink.find('.kboard-comments-count').text().trim();
      const commentMatch = commentRaw.match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1], 10) : 0;

      const $cutStrings = $titleLink.find('.kboard-default-cut-strings').clone();
      $cutStrings.find('.kboard-comments-count, .kboard-default-new-notify').remove();
      const title = $cutStrings.text().replace(/\s+/g, ' ').trim();

      const author = $row.find('td.kboard-list-user').text().trim() || '익명';
      const dateText = $row.find('td.kboard-list-date').text().trim() || '';
      const votes = parseInt($row.find('td.kboard-list-vote').text().trim() || '0', 10) || 0;
      const views = parseInt($row.find('td.kboard-list-view').text().trim() || '0', 10) || 0;
      const fullUrl = href.startsWith('http')
        ? href
        : `${ASTROMART_BASE}${href.startsWith('/') ? '' : '/market/'}${href}`;

      posts.push({
        uid,
        category: cat,
        title,
        commentCount,
        author,
        dateText,
        votes,
        views,
        url: fullUrl,
        isNotice,
        discoveredAt: nowIso,
      });
    });

    if (posts.length > 0) {
      const outPath = path.resolve(process.cwd(), 'public', 'market-snapshot.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(
        outPath,
        JSON.stringify({ generatedAt: nowIso, posts }, null, 2),
        'utf-8'
      );
      console.log(`Saved ${posts.length} posts to public/market-snapshot.json`);
    }
  } catch (err) {
    console.warn('Snapshot fetch skipped or used existing snapshot:', err.message);
  }
}

generateSnapshot();
