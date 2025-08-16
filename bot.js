const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf('7782418983:AAFw1FYb-ESFb-1abiSudFlzhukTAkylxFA'); // Tokeningiz

// JSON fayllarni yuklash
let admins = fs.existsSync('admins.json') ? JSON.parse(fs.readFileSync('admins.json')) : ["8165064673"];
let channels = fs.existsSync('channels.json') ? JSON.parse(fs.readFileSync('channels.json')) : ["@saikostars"];
let movies = fs.existsSync('movies.json') ? JSON.parse(fs.readFileSync('movies.json')) : {};
let state = fs.existsSync('state.json') ? JSON.parse(fs.readFileSync('state.json')) : {};

let users = {}; // foydalanuvchi holati

function saveJSON(file, data){
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// =================== START ===================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    users[userId] = users[userId] || { subscribed: false };

    let channelButtons = channels.map(c => Markup.button.url('Kanal', `https://t.me/${c.replace('@','')}`));
    await ctx.reply('Iltimos kanallarga obuna bo‘ling:', Markup.inlineKeyboard(channelButtons, { columns: 1 }));
    await ctx.reply('Obuna bo‘lgach, /check yozing.');

    // Admin menyu
    if(admins.includes(userId)){
        await ctx.reply('Siz adminsiz! Admin menyu:', Markup.keyboard([
            ['Kino qo‘shish','Reklama qoshish']
        ]).resize());
    }
});

// =================== CHECK ===================
bot.command('check', async (ctx) => {
    const userId = ctx.from.id.toString();
    users[userId].subscribed = true;
    await ctx.reply('Obuna tasdiqlandi! Endi kino kodi kiriting:');
});

// =================== ADMIN PANEL ===================
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!admins.includes(userId)) return ctx.reply('Siz admin emassiz!');

    await ctx.reply('Admin menyu:', Markup.keyboard([
        ['Kino qo‘shish', 'Reklama jo‘natish']
    ]).resize());
});

// =================== KINO QO‘SHISH ===================
bot.hears('Kino qo‘shish', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!admins.includes(userId)) return;

    state[userId] = { step: 'waiting_for_video' };
    saveJSON('state.json', state);

    await ctx.reply('Iltimos kino video yuboring:', Markup.inlineKeyboard([
        Markup.button.callback('Bekor qilish', 'cancel')
    ]));
});

// Bekor qilish
bot.action('cancel', async (ctx) => {
    const userId = ctx.from.id.toString();
    state[userId] = null;
    saveJSON('state.json', state);
    await ctx.editMessageText('Amal bekor qilindi. Endi boshqa menyularni ishlatishingiz mumkin.');
});

// Video qabul qilish
bot.on('video', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!state[userId] || state[userId].step !== 'waiting_for_video') return;

    const videoId = ctx.message.video.file_id;
    state[userId] = { step: 'waiting_for_code', videoId };
    saveJSON('state.json', state);

    await ctx.reply('Kino kodi kiriting:');
});

// Rasm yuborilsa
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(state[userId] && state[userId].step === 'waiting_for_video'){
        await ctx.reply('Faqat video qabul qilinadi! Iltimos video yuboring.');
    }
});

// =================== TEXT HANDLER ===================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    // Kino qo‘shish jarayoni
    if(state[userId] && state[userId].step === 'waiting_for_code'){
        const videoId = state[userId].videoId;
        state[userId] = { step: 'confirm', videoId, code: text };
        saveJSON('state.json', state);

        await ctx.reply(`Kodi: ${text}\nKino tasdiqlansinmi?`, Markup.inlineKeyboard([
            Markup.button.callback('Tasdiqlash', 'confirm_video'),
            Markup.button.callback('Bekor qilish', 'cancel')
        ]));
        return;
    }

    // Foydalanuvchi kodi orqali kino olish (faqat obunachilar)
    if(users[userId] && users[userId].subscribed){
        // Agar admin kino qo‘shish jarayonida bo'lmasa, kodi soramasin
        if(!state[userId] || !['waiting_for_video','waiting_for_code','confirm'].includes(state[userId].step)){
            if(movies[text]){
                await ctx.replyWithVideo(movies[text], { caption: `Sizning kinoingiz kodi: ${text}` });
                state[userId] = { last_watched: text, username: ctx.from.username || '', first_name: ctx.from.first_name };
                saveJSON('state.json', state);
            } else if(!text.startsWith('/')){
                await ctx.reply('Bunday kino kodi topilmadi!');
            }
        }
    }

    // /delete komandasi
    if(text.startsWith('/delete ')){
        if(!admins.includes(userId)) return ctx.reply('Siz admin emassiz!');
        const arg = text.split(' ')[1];
        if(movies[arg]){
            delete movies[arg];
            saveJSON('movies.json', movies);
            return ctx.reply(`Kino kodi ${arg} o‘chirildi.`);
        }
    }

    // /addadmin komandasi
    if(text.startsWith('/addadmin ')){
        if(!admins.includes(userId)) return ctx.reply('Siz admin emassiz!');
        const newAdmin = text.split(' ')[1];
        if(!admins.includes(newAdmin)){
            admins.push(newAdmin);
            saveJSON('admins.json', admins);
            return ctx.reply(`Yangi admin qo‘shildi: ${newAdmin}`);
        } else {
            return ctx.reply('Bu admin allaqachon mavjud.');
        }
    }

    // =================== REKLAMA JO'NATISH ===================
    if(state[userId] && state[userId].step === 'waiting_for_ad'){
        for(const uid in users){
            try {
                await ctx.telegram.sendMessage(uid, `📢 Reklama:\n\n${text}`);
            } catch(e){
                console.log(`Foydalanuvchi ${uid}ga reklama yuborilmadi.`);
            }
        }
        state[userId] = null;
        saveJSON('state.json', state);
        await ctx.reply('Reklama barcha foydalanuvchilarga jo‘natildi!');
        return;
    }
});
// =================== REKLAMA JARAYONI ===================
bot.hears('Reklama jo‘natish', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!admins.includes(userId)) return;

    state[userId] = { step: 'waiting_for_ad_media' };
    saveJSON('state.json', state);

    await ctx.reply('📷 Iltimos reklama uchun rasm yoki video yuboring.');
});
bot.on(['photo', 'video'], async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!state[userId] || state[userId].step !== 'waiting_for_ad_media') return;

    if(ctx.message.photo){
        state[userId] = { step: 'confirm_ad_media', media: { type: 'photo', file_id: ctx.message.photo.pop().file_id } };
    } else if(ctx.message.video){
        state[userId] = { step: 'confirm_ad_media', media: { type: 'video', file_id: ctx.message.video.file_id } };
    }
    saveJSON('state.json', state);

    await ctx.reply('✅ Media qabul qilindi. Tasdiqlaysizmi?', Markup.inlineKeyboard([
        Markup.button.callback('Ha', 'confirm_ad_media'),
        Markup.button.callback('Yo‘q', 'cancel')
    ]));
});
bot.action('confirm_ad_media', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!state[userId] || state[userId].step !== 'confirm_ad_media') return;

    state[userId].step = 'waiting_for_ad_text';
    saveJSON('state.json', state);

    await ctx.editMessageText('✍️ Endi reklama uchun matn yozing.');
});
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    // Reklama matni
    if(state[userId] && state[userId].step === 'waiting_for_ad_text'){
        state[userId].text = text;
        state[userId].step = 'ask_button';
        saveJSON('state.json', state);

        await ctx.reply(`📌 Matn qabul qilindi:\n\n${text}\n\nTugma qo‘shasizmi?`, 
            Markup.inlineKeyboard([
                Markup.button.callback('Ha', 'add_ad_button'),
                Markup.button.callback('Yo‘q', 'skip_ad_button')
            ])
        );
        return;
    }

    // Tugma matni
    if(state[userId] && state[userId].step === 'waiting_for_button_text'){
        state[userId].buttonText = text;
        state[userId].step = 'waiting_for_button_url';
        saveJSON('state.json', state);

        await ctx.reply('🔗 Endi tugma uchun link yuboring.');
        return;
    }

    // Tugma linki
    if(state[userId] && state[userId].step === 'waiting_for_button_url'){
        state[userId].buttonUrl = text;
        state[userId].step = 'confirm_ready_ad';
        saveJSON('state.json', state);

        await ctx.reply('✅ Tugma qo‘shildi. Reklama tayyor. Tasdiqlaysizmi?', 
            Markup.inlineKeyboard([
                Markup.button.callback('Ha', 'send_ad'),
                Markup.button.callback('Yo‘q', 'cancel')
            ])
        );
        return;
    }
});
bot.action('add_ad_button', async (ctx) => {
    const userId = ctx.from.id.toString();
    state[userId].step = 'waiting_for_button_text';
    saveJSON('state.json', state);

    await ctx.editMessageText('Tugma ustida yoziladigan matnni yuboring:');
});

bot.action('skip_ad_button', async (ctx) => {
    const userId = ctx.from.id.toString();
    state[userId].step = 'confirm_ready_ad';
    saveJSON('state.json', state);

    await ctx.editMessageText('Reklama tayyor. Tasdiqlaysizmi?', 
        Markup.inlineKeyboard([
            Markup.button.callback('Ha', 'send_ad'),
            Markup.button.callback('Yo‘q', 'cancel')
        ])
    );
});
bot.action('send_ad', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!state[userId] || state[userId].step !== 'confirm_ready_ad') return;

    const ad = state[userId];
    let extra = {};
    if(ad.buttonText && ad.buttonUrl){
        extra = {
            reply_markup: {
                inline_keyboard: [[{ text: ad.buttonText, url: ad.buttonUrl }]]
            }
        };
    }

    for(const uid in users){
        try {
            if(ad.media.type === 'photo'){
                await ctx.telegram.sendPhoto(uid, ad.media.file_id, { caption: ad.text, ...extra });
            } else {
                await ctx.telegram.sendVideo(uid, ad.media.file_id, { caption: ad.text, ...extra });
            }
        } catch(e){
            console.log(`❌ ${uid} ga yuborilmadi`);
        }
    }

    state[userId] = null;
    saveJSON('state.json', state);

    await ctx.editMessageText('✅ Reklama barcha foydalanuvchilarga yuborildi!');
});

// =================== TASDIQLASH ===================
bot.action('confirm_video', async (ctx) => {
    const userId = ctx.from.id.toString();
    if(!state[userId] || state[userId].step !== 'confirm') return;

    const { videoId, code } = state[userId];
    movies[code] = videoId;
    saveJSON('movies.json', movies);

    state[userId] = { step: 'ask_more' };
    saveJSON('state.json', state);

    await ctx.editMessageText(`Kino tasdiqlandi! Kodi: ${code}`);
    await ctx.reply('Yana kino kiritasizmi?', Markup.inlineKeyboard([
        Markup.button.callback('Ha', 'add_more'),
        Markup.button.callback('Yo‘q', 'add_no')
    ]));
});

// Yana kino qo‘shish
bot.action('add_more', async (ctx) => {
    const userId = ctx.from.id.toString();
    state[userId] = { step: 'waiting_for_video' }; // yana video kutish
    saveJSON('state.json', state);
    await ctx.editMessageText('Iltimos yangi kino video yuboring:');
});

// Kino qo‘shishni yakunlash
bot.action('add_no', async (ctx) => {
    const userId = ctx.from.id.toString();
    state[userId] = null;
    saveJSON('state.json', state);
    await ctx.editMessageText('Kino qo‘shish yakunlandi. Endi boshqa menyularni ishlatishingiz mumkin.');
});

bot.launch();
console.log('Bot ishga tushdi!');
