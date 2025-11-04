// Scrape From : DiiOfc

const axios = require('axios');
const cheerio = require('cheerio');

async function webtoons() {
    try {
        const response = await axios.get('https://www.webtoons.com/id/');
        const html = response.data;
        const $ = cheerio.load(html);

        const result = {
            trending: [],
            popular: []
        };

        $('._trending_title_a').each((index, element) => {
            const $el = $(element);
            const rank = parseInt($el.attr('data-rank'));
            const title = $el.find('.title').text().trim();
            const title_no = parseInt($el.attr('data-title-no'));
            const genre = $el.find('.genre').text().trim();
            const url = $el.attr('href');
            const thumbnail = $el.find('img').attr('src');

            if (rank && title) {
                result.trending.push({
                    rank,
                    title,
                    title_no,
                    genre,
                    url,
                    thumbnail
                });
            }
        });

        $('._popular_title_a').each((index, element) => {
            const $el = $(element);
            const rank = parseInt($el.attr('data-rank'));
            const title = $el.find('.title').text().trim();
            const title_no = parseInt($el.attr('data-title-no'));
            const genre = $el.find('.genre').text().trim();
            const url = $el.attr('href');
            const thumbnail = $el.find('img').attr('src');

            if (rank && title) {
                result.popular.push({
                    rank,
                    title,
                    title_no,
                    genre,
                    url,
                    thumbnail
                });
            }
        });

        result.trending.sort((a, b) => a.rank - b.rank);
        result.popular.sort((a, b) => a.rank - b.rank);

        return result;

    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

// Contoh penggunaan
webtoons()
