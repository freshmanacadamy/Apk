const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');

// Check if BOT_TOKEN is available
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

console.log('🤖 APK Search Bot starting...');

class APKSearch {
  constructor() {
    this.baseURL = 'https://apkpure.com';
  }

  async searchAPK(query) {
    try {
      console.log(`🔍 Searching for: ${query}`);
      
      const response = await axios.get(`${this.baseURL}/search`, {
        params: { 
          page: 1, 
          q: query 
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      // Multiple selector strategies
      $('.search-item, .gd').each((index, element) => {
        if (index >= 5) return false;
        
        const $item = $(element);
        const title = $item.find('.p1, .title').first().text().trim();
        const link = $item.find('a').first().attr('href');
        
        if (title && link) {
          const fullLink = link.startsWith('http') ? link : this.baseURL + link;
          const packageName = fullLink.split('/').pop();
          
          results.push({
            title: title,
            package: packageName,
            link: fullLink
          });
        }
      });

      console.log(`✅ Found ${results.length} results`);
      return results;

    } catch (error) {
      console.error('❌ Search error:', error.message);
      throw new Error('Search failed. Please try again.');
    }
  }

  async getDownloadLink(packageName) {
    try {
      const url = `${this.baseURL}/${packageName}`;
      console.log(`📦 Getting download link for: ${packageName}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Get app title
      const title = $('title').text().replace(' - APKPure.com', '') || packageName;
      
      // Find download link
      let downloadLink = '';
      $('a[href*="/APK/"], a.download-btn').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/APK/')) {
          downloadLink = href;
          return false;
        }
      });

      if (downloadLink && !downloadLink.startsWith('http')) {
        downloadLink = this.baseURL + downloadLink;
      }

      return {
        success: !!downloadLink,
        title: title,
        package: packageName,
        downloadLink: downloadLink || `https://apkpure.com/${packageName}`
      };

    } catch (error) {
      console.error('❌ Download link error:', error);
      return {
        success: false,
        title: packageName,
        package: packageName,
        error: error.message
      };
    }
  }
}

const apkSearch = new APKSearch();

// Bot commands
bot.start((ctx) => {
  ctx.reply(`🤖 APK Search Bot

🔍 Search APK files from APKPure
📱 Get download links instantly

**Commands:**
/search <app name> - Search for apps
/dl <package> - Get download link
/help - Show help

**Example:**
/search whatsapp
/dl com.whatsapp

Bot is working! 🎉`, {
    parse_mode: 'Markdown'
  });
});

bot.help((ctx) => {
  ctx.reply(`Help Guide:

1. Search for apps:
   \`/search whatsapp\`
   \`/search minecraft\`

2. Get download link:
   \`/dl com.whatsapp\`
   \`/dl com.telegram\`

3. Download from the provided link

Note: Always verify APK files before installing.`, {
    parse_mode: 'Markdown'
  });
});

// Search command
bot.command('search', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ').trim();
  
  if (!query) {
    return ctx.reply('Please provide a search query.\nExample: `/search whatsapp`', {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  }

  try {
    const searchMsg = await ctx.reply(`🔍 Searching for "${query}"...`);

    const results = await apkSearch.searchAPK(query);
    
    if (!results || results.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        searchMsg.message_id,
        null,
        `❌ No results found for "${query}"\n\nTry a different search term.`
      );
      return;
    }

    let message = `📱 Results for "${query}":\n\n`;
    
    results.forEach((result, index) => {
      message += `${index + 1}. **${result.title}**\n`;
      message += `   📦 \`${result.package}\`\n`;
      message += `   ⬇️ \`/dl ${result.package}\`\n\n`;
    });

    message += `Use \`/dl <package>\` to get download links.`;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      searchMsg.message_id,
      null,
      message,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Search command error:', error);
    await ctx.reply('❌ Search failed. Please try again later.');
  }
});

// Download command
bot.command('dl', async (ctx) => {
  const packageName = ctx.message.text.split(' ')[1];
  
  if (!packageName) {
    return ctx.reply('Please provide a package name.\nExample: `/dl com.whatsapp`', {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  }

  try {
    const loadingMsg = await ctx.reply(`📦 Getting download link for \`${packageName}\`...`, {
      parse_mode: 'Markdown'
    });

    const result = await apkSearch.getDownloadLink(packageName);
    
    if (result.success) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `📱 **${result.title}**\n\n📦 Package: \`${result.package}\`\n\n⬇️ Download Link:\n${result.downloadLink}\n\n⚠️ Always scan APK files before installing.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `❌ Could not get download link for \`${packageName}\`\n\nTry visiting: https://apkpure.com/${packageName}`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Download command error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Handle text that looks like package names
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Ignore commands
  if (text.startsWith('/')) return;
  
  // If text looks like a package name (contains dots)
  if (text.includes('.') && text.length > 3) {
    ctx.reply(`Use \`/dl ${text}\` to get download link for this package.`, {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('❌ An error occurred. Please try again.');
});

// Webhook setup for production
if (process.env.VERCEL_URL) {
  const webhookUrl = `https://${process.env.VERCEL_URL}/api/bot`;
  bot.telegram.setWebhook(webhookUrl).then(() => {
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  }).catch(console.error);
} else {
  // Development mode
  bot.launch().then(() => {
    console.log('🚀 Bot running in development mode');
  }).catch(console.error);
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      status: 'Bot is running!',
      service: 'APK Search Bot',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production'
    });
    return;
  }

  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body, res);
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(200).send('OK');
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
};

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
