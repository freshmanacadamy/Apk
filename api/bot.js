const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');

const bot = new Telegraf(process.env.BOT_TOKEN);

// APKPure scraper with file download capability
class APKPureScraper {
  constructor() {
    this.baseURL = 'https://apkpure.com';
    this.searchURL = 'https://apkpure.com/search';
  }

  async searchAPK(query) {
    try {
      console.log(`🔍 Searching for: ${query}`);
      
      const response = await axios.get(this.searchURL, {
        params: { page: 1, q: query },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.search-list .search-item').each((index, element) => {
        if (index >= 8) return false; // Limit to 8 results
        
        const $item = $(element);
        const title = $item.find('.p1').text().trim();
        const link = $item.find('a').attr('href');
        const icon = $item.find('.lazy').data('src') || $item.find('img').attr('src');
        
        if (title && link) {
          results.push({
            title,
            link: link.startsWith('http') ? link : this.baseURL + link,
            icon: icon ? (icon.startsWith('http') ? icon : this.baseURL + icon) : null,
            package: link.split('/').pop()
          });
        }
      });

      console.log(`✅ Found ${results.length} results for: ${query}`);
      return results;

    } catch (error) {
      console.error('❌ Search error:', error.message);
      throw new Error('Failed to search APK. Please try again later.');
    }
  }

  async getAPKDetails(apkURL) {
    try {
      console.log(`📦 Getting details for: ${apkURL}`);
      
      const response = await axios.get(apkURL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Extract APK details
      const title = $('.title-like h1').text().trim();
      const version = $('.details-sdk .active').first().text().trim();
      const size = $('.details-sdk .size').text().trim();
      const updateDate = $('.details-sdk .update').text().trim();
      const downloads = $('.details-sdk .download').text().trim();
      
      // Find download link
      let downloadLink = '';
      $('.download-btn').each((index, element) => {
        const href = $(element).attr('href');
        if (href && href.includes('/APK/')) {
          downloadLink = href;
          return false;
        }
      });

      if (!downloadLink) {
        // Alternative method to find download link
        const downloadBtn = $('a[href*="/APK/"]').first();
        downloadLink = downloadBtn.attr('href') || '';
      }

      return {
        title: title || 'Unknown',
        version: version || 'Unknown',
        size: size || 'Unknown',
        updateDate: updateDate || 'Unknown',
        downloads: downloads || 'Unknown',
        downloadLink: downloadLink ? (downloadLink.startsWith('http') ? downloadLink : this.baseURL + downloadLink) : null,
        success: !!downloadLink
      };

    } catch (error) {
      console.error('❌ APK details error:', error.message);
      throw new Error('Failed to get APK details. Please try again.');
    }
  }

  async downloadAPKFile(downloadPageURL) {
    try {
      console.log(`⬇️ Getting direct download from: ${downloadPageURL}`);
      
      const response = await axios.get(downloadPageURL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      
      // Find the direct download link
      let directLink = '';
      $('a[href*=".apk?f="]').each((index, element) => {
        const href = $(element).attr('href');
        if (href && href.includes('.apk?')) {
          directLink = href;
          return false;
        }
      });

      if (!directLink) {
        // Alternative selector
        directLink = $('a[data-download-file]').attr('href') || '';
      }

      if (directLink && !directLink.startsWith('http')) {
        directLink = this.baseURL + directLink;
      }

      if (!directLink) {
        throw new Error('No download link found');
      }

      console.log(`✅ Direct link found: ${directLink}`);

      // Download the APK file
      const fileResponse = await axios({
        method: 'GET',
        url: directLink,
        responseType: 'stream',
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*'
        }
      });

      return {
        stream: fileResponse.data,
        contentLength: fileResponse.headers['content-length'],
        contentType: fileResponse.headers['content-type']
      };

    } catch (error) {
      console.error('❌ Download error:', error.message);
      throw new Error('Failed to download APK file. File might be too large or unavailable.');
    }
  }
}

const scraper = new APKPureScraper();

// Bot commands and handlers
bot.start((ctx) => {
  ctx.reply(`🤖 Welcome to APK Search Bot!

🔍 <b>How to use:</b>
/search [app name] - Search for APK files
/download [package] - Download APK file directly

📱 <b>Example:</b>
<code>/search whatsapp</code>
<code>/download com.whatsapp</code>

⚠️ <b>Note:</b> 
- Files are sent directly as Telegram documents
- Max file size: 50MB (Telegram limit)
- Download at your own risk`, {
    parse_mode: 'HTML'
  });
});

bot.help((ctx) => {
  ctx.reply(`📖 <b>APK Bot Help</b>

🔍 <b>Search:</b>
<code>/search telegram</code>
<code>/search minecraft</code>

⬇️ <b>Download:</b>
<code>/download com.telegram</code>

💡 <b>Tips:</b>
- Bot sends APK files directly
- Files up to 50MB supported
- Use specific app names for better results`, {
    parse_mode: 'HTML'
  });
});

// Search command
bot.command('search', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ').trim();
  
  if (!query) {
    return ctx.reply('❌ Please provide a search query.\nExample: <code>/search whatsapp</code>', {
      parse_mode: 'HTML'
    });
  }

  if (query.length < 2) {
    return ctx.reply('❌ Search query too short. Use at least 2 characters.');
  }

  try {
    const searchMsg = await ctx.reply(`🔍 Searching for "<b>${query}</b>"...`, {
      parse_mode: 'HTML'
    });

    const results = await scraper.searchAPK(query);
    
    if (!results || results.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        searchMsg.message_id,
        null,
        `❌ No APK files found for "<b>${query}</b>"\n\nTry a different search term.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    let message = `📱 <b>Search Results for "${query}"</b>\n\n`;
    
    results.forEach((result, index) => {
      message += `${index + 1}. <b>${result.title}</b>\n`;
      message += `   📦 <code>${result.package}</code>\n`;
      message += `   ⬇️ <code>/download ${result.package}</code>\n\n`;
    });

    message += `💡 <i>Use /download [package] to get the APK file</i>`;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      searchMsg.message_id,
      null,
      message,
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    console.error('Search command error:', error);
    ctx.reply('❌ Failed to search APK files. Please try again later.');
  }
});

// Download command - Sends file directly
bot.command('download', async (ctx) => {
  const packageName = ctx.message.text.split(' ')[1];
  
  if (!packageName) {
    return ctx.reply('❌ Please provide a package name.\nExample: <code>/download com.whatsapp</code>', {
      parse_mode: 'HTML'
    });
  }

  try {
    const apkURL = `https://apkpure.com/${packageName}`;
    
    // Show loading message
    const loadingMsg = await ctx.reply(`📦 Getting APK details for <code>${packageName}</code>...`, {
      parse_mode: 'HTML'
    });

    const details = await scraper.getAPKDetails(apkURL);
    
    if (!details.success || !details.downloadLink) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `❌ APK not found for package: <code>${packageName}</code>\n\nTry searching first with /search command.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Update message to show downloading
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      null,
      `📱 <b>${details.title}</b>\n\n📦 Package: <code>${packageName}</code>\n🔄 Version: ${details.version}\n💾 Size: ${details.size}\n\n⏳ Downloading APK file...`,
      { parse_mode: 'HTML' }
    );

    // Download and send the APK file
    const fileData = await scraper.downloadAPKFile(details.downloadLink);
    
    // Check file size (Telegram limit: 50MB for bots)
    const fileSize = parseInt(fileData.contentLength || '0');
    if (fileSize > 50 * 1024 * 1024) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `❌ File too large: ${(fileSize / (1024 * 1024)).toFixed(1)}MB\n\nTelegram limit is 50MB for bots.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Generate filename
    const fileName = `${details.title.replace(/[^a-zA-Z0-9]/g, '_')}_v${details.version}.apk`;
    
    // Update message to show sending file
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      null,
      `📱 <b>${details.title}</b>\n\n📦 Package: <code>${packageName}</code>\n🔄 Version: ${details.version}\n💾 Size: ${details.size}\n\n📤 Sending APK file...`,
      { parse_mode: 'HTML' }
    );

    // Send the file as document
    await ctx.replyWithDocument({
      source: fileData.stream,
      filename: fileName
    }, {
      caption: `📱 <b>${details.title}</b>\n\n📦 Package: <code>${packageName}</code>\n🔄 Version: ${details.version}\n💾 Size: ${details.size}\n\n⚠️ <i>Scan for viruses before installing</i>`,
      parse_mode: 'HTML'
    });

    // Delete the loading message
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

  } catch (error) {
    console.error('Download command error:', error);
    
    try {
      await ctx.reply(`❌ Failed to download APK: ${error.message}\n\nPossible reasons:\n• File too large (>50MB)\n• Network error\n• APK not available\n\nPlease try again later.`);
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

// Handle text messages that might be package names
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  // If it looks like a package name (contains dots)
  if (text.includes('.') && !text.startsWith('/')) {
    try {
      const loadingMsg = await ctx.reply(`🔍 Checking if <code>${text}</code> is a valid package...`, {
        parse_mode: 'HTML'
      });

      const apkURL = `https://apkpure.com/${text}`;
      const details = await scraper.getAPKDetails(apkURL);
      
      if (details.success) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          null,
          `📱 <b>${details.title}</b>\n\n📦 Package: <code>${text}</code>\n🔄 Version: ${details.version}\n💾 Size: ${details.size}\n\n⬇️ Use <code>/download ${text}</code> to get the APK file`,
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          null,
          `❌ Package not found: <code>${text}</code>\n\nTry searching with /search command first.`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (error) {
      await ctx.reply('❌ Invalid package name or network error.');
    }
  }
});

// Webhook handler for Vercel
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body, res);
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(200).send('OK');
    }
  } else {
    res.status(200).json({ 
      status: 'APK Search Bot is running!',
      description: 'Sends APK files directly as Telegram documents',
      max_file_size: '50MB',
      commands: ['/search', '/download']
    });
  }
};
