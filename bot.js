const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf('TOKENINGIZ'); // Tokeningiz

let admins = fs.existsSync('admins.json') ? JSON.parse(fs.readFileSync('admins.json')) : ["8165064673"];
let movies = fs.existsSync('movies.json') ? JSON.parse(fs.readFileSync('movies.json')) : {};
let state = fs.existsSync('state.json') ? JSON.parse(fs.readFileSync('state.json')) : {};
let users = {};

function saveJSON(file, data){
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =================== START ===================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    users[userId] = users[userId] || { subscribed: true };

    if(admins.includes(userId)){
        await ctx.reply('Siz adminsiz! Admin menyu:', Markup.keyboard([
            ['Kino qo‘shish','Reklama jo‘natish']
        ]).resize());
    } else {
        await ctx.reply("Xush kelibsiz! Kod orqali kino izlang.");
    }
});

// =================== KINO QO‘SHISH ===================
bot.hears('Kino qo‘shish', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!admins.includes(userId)) return;

    state[userId] = { step: 'waiting_for_video' };
    saveJSON('state.json', state);

    await ctx.reply('🎬 Kino videosini yuboring:');
});

bot.on('video', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(state[userId]?.step === 'waiting_for_video'){
        state[userId] = { step: 'waiting_for_code', videoId: ctx.message.video.file_id };
        saveJSON('state.json', state);
        await ctx.reply('Kino kodi kiriting:');
    }
});

// =================== REKLAMA JARAYONI ===================
bot.hears('Reklama jo‘natish', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!admins.includes(userId)) return;
    state[userId] = { step: 'waiting_for_ad_media' };
    saveJSON('state.json', state);
    await ctx.reply('📷 Reklama uchun rasm yoki video yuboring.');
});

bot.on(['photo', 'video'], async (ctx) => {
    const userId = ctx.from.id.toString();
    if(state[userId]?.step === 'waiting_for_ad_media'){
        if(ctx.message.photo){
            state[userId] = { step: 'waiting_for_ad_text', media: { type: 'photo', file_id: ctx.message.photo.pop().file_id } };
        } else {
            state[userId] = { step: 'waiting_for_ad_text', media: { type: 'video', file_id: ctx.message.video.file_id } };
        }
        saveJSON('state.json', state);
        await ctx.reply('✍️ Endi reklama matnini yozing:');
    }
});

// =================== TEXT HANDLER ===================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    // KINO QO‘SHISH
    if(state[userId]?.step === 'waiting_for_code'){
        const videoId = state[userId].videoId;
        movies[text] = videoId;
        saveJSON('movies.json', movies);
        state[userId] = null;
        saveJSON('state.json', state);
        return ctx.reply(`✅ Kino saqlandi! Kodi: ${text}`);
    }

    // REKLAMA MATNI
    if(state[userId]?.step === 'waiting_for_ad_text'){
        const ad = { ...state[userId], text };
        for(const uid in users){
            try {
                if(ad.media.type === 'photo'){
                    await ctx.telegram.sendPhoto(uid, ad.media.file_id, { caption: ad.text });
                } else {
                    await ctx.telegram.sendVideo(uid, ad.media.file_id, { caption: ad.text });
                }
            } catch(e){ console.log(`❌ ${uid} ga yuborilmadi`); }
        }
        state[userId] = null;
        saveJSON('state.json', state);
        return ctx.reply("✅ Reklama yuborildi!");
    }

    // ODDIY FOYDALANUVCHI KODI
    if(movies[text]){
        return ctx.replyWithVideo(movies[text], { caption: `🎬 Kino kodi: ${text}` });
    }
});

bot.launch();
console.log("Bot ishga tushdi!");
