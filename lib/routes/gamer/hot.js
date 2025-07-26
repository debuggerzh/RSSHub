/*
 * @FilePath: \RSSHub\lib\routes\gamer\hot.js
 */
const got = require('@/utils/got');
const cheerio = require('cheerio');
const url = require('url');

const host = 'https://forum.gamer.com.tw';

const map = {
    anime: 60037,
}

module.exports = async (ctx) => {
    const type = ctx.params.type || 60037;
    const link = host + `/B.php?bsn=${map[type] || type}`;
    // 获取列表页，也就是发出请求，来获得这个文章列表页
    const response = await got({
        method: 'get',    // 请求的方法是 get，这里一般都是 get
        url: link,        // 请求的链接，也就是文章列表页
    });
    // 用 cheerio 来把请求回来的数据转成 DOM，方便操作
    const $ = cheerio.load(response.data);
    // 提取列表项
    const urlList = $('.b-list__main__title')    // 类选择器
        // 去掉前4个，因为前面4个是置顶的帖子
        .slice(4, 30)      // 获取若干个，也可以把它调大一点，比如 15 个。最大的个数要看这个网页中有多少条
        // 作为键值对来存储 <a> 标签的 href 属性
        // 需要特别注意的是，这里的 href 属性是相对路径，所以需要用 url.resolve?
        .map((i, e) => $(e).attr('href'))
        .get();
    console.log(urlList[0]);
    const out = await Promise.all(
        // 抓取操作
        urlList.map(async (itemUrl) => {
            // 获取文章的完整链接
            itemUrl = url.resolve(host, itemUrl);
            // 这里是使用 RSSHub 的缓存机制
            const cache = await ctx.cache.get(itemUrl);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }
            // 获取列表项中的网页
            // console.error(`正在抓取 ${itemUrl}`);
            
            const response = await got.get(itemUrl);
            const $ = cheerio.load(response.data);
            // single 就是一篇文章了，里面包括了标题、链接、内容和时间
            const single = {
                title: $('TITLE').text(),      // 提取标题
                link: itemUrl,                 // 文章链接
                // 暂时只做楼主1楼
                description: $('.c-article__content').first()         
                // 文章内容，并且用了个将文章的链接和图片转成完整路径的 replace() 方法
                    .html()
                    // .replace(/src="\//g, `src="${url.resolve(host, '.')}`)
                    // .replace(/href="\//g, `href="${url.resolve(host, '.')}`)
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
    let info = '動漫相關綜合';

    // 访问 RSS 链接时会输出的信息
    ctx.state.data = {
        title: '哈拉板 - ' + info,
        link: link,
        description: '哈拉板 - ' + info + host,
        item: out,
    };
}