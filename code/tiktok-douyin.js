// Scrape From : Ahzamycode

import axios from 'axios';
import * as cheerio from 'cheerio';

async function savetik(tiktokUrl) {
  try {
    const response = await axios.post(
      'https://savetik.co/api/ajaxSearch',
      new URLSearchParams({
        q: tiktokUrl,
        lang: 'en',
        cftoken: ''
      }),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
          'Accept': '*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://savetik.co',
          'Referer': 'https://savetik.co/en/douyin-downloader'
        }
      }
    );

    if (!response.data || response.data.status !== 'ok') {
      throw new Error('Failed to fetch video info');
    }

    const $ = cheerio.load(response.data.data);

    const thumbnail = $('.thumbnail img').attr('src') || '';
    const title = $('.content h3').text().trim() || '';

    const downloads = [];
    
    $('.dl-action p a').each((i, elem) => {
      const link = $(elem).attr('href');
      const text = $(elem).text().trim();
      
      if (link && link.includes('dl.snapcdn.app')) {
        let type = 'video';
        let quality = 'default';
        
        if (text.includes('MP4 HD')) {
          type = 'video';
          quality = 'hd';
        } else if (text.includes('MP4')) {
          type = 'video';
          quality = 'sd';
        } else if (text.includes('MP3')) {
          type = 'audio';
          quality = 'default';
        }
        
        downloads.push({
          type: type,
          quality: quality,
          url: link,
          label: text.replace(/[\s\u00a0]+/g, ' ').trim()
        });
      }
    });

    const videoId = $('#TikTokId').val() || '';


    const directVideoUrl = $('#vid').attr('data-src') || '';

    return {
      success: true,
      title: title,
      thumbnail: thumbnail,
      videoId: videoId,
      directVideoUrl: directVideoUrl,
      downloads: downloads
    };

  } catch (error) {
    throw new Error(`SaveTik Error: ${error.message}`);
  }
}

// Example usage
const url = 'https://vt.tiktok.com/ZSySMEEE9/';
const result = await savetik(url);
console.log(JSON.stringify(result, null, 2));

export { savetik };
export default savetik;
