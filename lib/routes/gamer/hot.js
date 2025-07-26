/*
 * @FilePath: \RSSHub\lib\routes\gamer\hot.js
 */
const got = require('@/utils/got');
const cheerio = require('cheerio');
const url = require('url');
const logger = require('@/utils/logger');

const host = 'https://forum.gamer.com.tw';
const map = {
    anime: 60037,
}

module.exports = async (ctx) => {
    const type = ctx.params.type || 60037;
    const link = host + `/B.php?bsn=${map[type] || type}`;

    // 导入 puppeteer 工具类并初始化浏览器实例
    const browser = await require('@/utils/puppeteer')();
    // 打开一个新标签页
    const page = await browser.newPage();
    // 拦截所有请求
    await page.setRequestInterception(true);
    // 仅允许某些类型的请求
    page.on('request', (request) => {
        // 在这次例子，我们只允许 HTML 请求
        request.resourceType() === 'document' ? request.continue() : request.abort();
    });
    // 访问目标链接
    // got 请求会被自动记录，
    // 但 puppeteer 请求不会
    // 所以我们需要手动记录它们
    logger.debug(`Requesting ${link}...`);
    await page.goto(link, {
        // 指定页面等待载入的时间
        waitUntil: 'domcontentloaded',
    });
    // 获取页面的 HTML 内容
    const response = await page.content();
    // 关闭标签页
    page.close();

    const $ = cheerio.load(response);
    const urlList = $('.b-list__main__title')    // 类选择器
        // 去掉前4个，因为前面4个是置顶的帖子
        .slice(4, 30)      // 获取若干个，也可以把它调大一点，比如 15 个。最大的个数要看这个网页中有多少条
        // 作为键值对来存储 <a> 标签的 href 属性
        // 需要特别注意的是，这里的 href 属性是相对路径，所以需要用 url.resolve
        .map((i, e) => $(e).attr('href'))
        .get();
    logger.debug(urlList[0]);
    const out = await Promise.all(
        // 抓取操作
        urlList.map(async (itemUrl) => {
            // 获取文章的完整链接
            itemUrl = url.resolve(host, itemUrl);

            const page = await browser.newPage();
            // 设置请求拦截，仅允许 HTML 请求
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                request.resourceType() === 'document' ? request.continue() : request.abort();
            });

            logger.debug(`Requesting ${itemUrl}...`);
            await page.goto(itemUrl, {
                waitUntil: 'domcontentloaded',
            });
            // 这里是使用 RSSHub 的缓存机制
            const cache = await ctx.cache.get(itemUrl);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }
            const response = await page.content();
            // 获取 HTML 内容后关闭标签页
            page.close();

            const $ = cheerio.load(response);
            
            // single 就是一篇文章了，里面包括了标题、链接、内容和时间
            const single = {
                title: $('TITLE').text(),      // 提取标题
                link: itemUrl,                 // 文章链接
                // 暂时只做楼主1楼
                description: $('.c-article__content').first()         
                    .html()
                    .trim(),
                pubDate: new Date(
                    $('.c-post__header__info').first()
                        .find('a')
                        .attr('data-mtime')
                ).toUTCString(),                // 将时间的文本文字转换成 Date 对象
            };
            // 设置缓存及时间
            ctx.cache.set(itemUrl, JSON.stringify(single), 24 * 60 * 60);
            // 输出一篇文章的所有信息
            return Promise.resolve(single);
        })
    );
    // const item = ...;
    // 不要忘记关闭浏览器实例
    browser.close();
    
    let info = '動漫相關綜合';
    // 访问 RSS 链接时会输出的信息
    ctx.state.data = {
        title: '哈拉板 - ' + info,
        link: link,
        description: '哈拉板 - ' + info + host,
        item: out,
    };
}