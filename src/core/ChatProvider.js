/*
 * class for chat communications
 */
import { Op } from 'sequelize';
import { query } from '../data/sql/database';
import fetch from 'node-fetch';
import logger from './logger';
import client from './client';
import RateLimiter from '../utils/RateLimiter';
import { getNamesToIds } from '../data/sql/RegUser';
import {
    getIdsToIps,
    getInfoToIps,
    getIPofIID,
} from '../data/sql/IPInfo';
import {
  Channel, RegUser, UserChannel, Message, Reaction,
} from '../data/sql';
import { findIdByNameOrId } from '../data/sql/RegUser';
import ChatMessageBuffer from './ChatMessageBuffer';
import socketEvents from '../socket/socketEvents';
import isIPAllowed from './isAllowed';
import {
  mutec, unmutec,
  unmutecAll, listMutec,
  mute,
  unmute,
  allowedChat,
  getPixelCount,
} from '../data/redis/chat';
import { banIP } from '../data/sql/Ban';
import Ban from '/root/pixelplanet/src/data/sql/Ban.js';
import { DailyCron } from '../utils/cron';
import { escapeMd, getUserIdFromMd, getUsernameFromMd } from './utils';
import ttags from './ttag';
import { nextEvent, getEventArea, CANVAS_ID } from '../data/redis/Event';
import { getUserFactionTag } from '../routes/api/faction';

import { USE_MAILER } from './config';
import {
  CHAT_CHANNELS,
  EVENT_USER_NAME,
  INFO_USER_NAME,
  APISOCKET_USER_NAME,
  TILE_SIZE,
} from './constants';
import axios from 'axios';
import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import cron from 'node-cron';
import moment from 'moment';
import canvases from './canvases';
import { logModerationCommands } from './discord-webhook.js';
// import { franc } from 'franc'

export class ChatProvider {
  constructor() {
    this.defaultChannels = {};
    this.langChannels = {};
    this.publicChannelIds = [];
    this.enChannelId = 0;
    this.infoUserId = 0;
    this.eventUserId = 0;
    this.autobanPhrase = null;
    this.apiSocketUserId = 0;
    this.caseCheck = /^[A-Z !.]*$/;
    this.chatMessageBuffer = new ChatMessageBuffer(socketEvents);
    this.clearOldMessages = this.clearOldMessages.bind(this);
    this.channelCooldowns = {}; // Track cooldowns per channel
    this.userReactionCooldowns = new Map(); // Track reaction rate limiting

    // Prevents full words from being filtered by the chat filter
    this.filterWhitelist = [
      'nope',
      'noob',
      'busy'
    ];

    // Substitutions. Can be multiple characters
    // First string is the find, second is the replace
    // Partial substitutions match partial words
    this.partialSubstitutions = {
      'ü': 'u',
      'Ü': 'U',
      'İ': 'i',
      'ngrok-free.app': '[DOMAIN #1 BLOCKED]',
      'canvasland': '[DOMAIN #2 BLOCKED]',
      'pixelday': '[DOMAIN #3 BLOCKED]',
      'grabify.link': '[DOMAIN #4 BLOCKED]',
      'https://pixmap.fun/': ''
    };
    this.partialSubstituteRegex = new RegExp(Object.keys(this.partialSubstitutions).join('|'), 'gi');

    /* 
      Full substitutions match ONLY full words
      RegEx Guide:
      Square brackets match any character inside (e.g. [il1] will match "i" or "l" or "1")
      Plus will match 1 or MORE of the previous operator (e.g. `[n]+` will match one or more "n")
      `[i1!l]+` will match one or more of any combo of those characters (e.g. "ii!!111il" will match)
      Pipe is OR operator
      Asterisk matches 0 or MORE of the previous operator (e.g. `[s]*` will match zero or more "s")
      Parentheses group things (e.g. `(?:[a]|[e][r])[s]` will match "as" OR "ers")
      YOU MUST USE "(?:" AND ")" FOR PARENTHESES OR IT WILL BREAK!!!
      Paste it into https://regexr.com/ and you can get a breakdown in the "Tools" section
      TWO BACKSLASHES ARE REQUIRED TO ESCAPE!
      "Filler" will be added between brackets/parentheses
      The filler will match things such as "n...i'.c~e" so your RegEx can be "[n]+[i]+[c]+[e]+"
      Repeating characters should be added. For example, if a word has "...gg..." you should add "[g]+[g]*" to your RegEx

      Quick Paste List:
      o -> (?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])
      i/l -> [il1!\\|y]
      s -> [s\\$z]
      a -> [a\\@]
      e -> [e3]
      g/b/q/p -> [gbqp]
      y/ie -> (?:[y]+|[il1!\\|]+[e3]+)
    */
    this.fullSubstitutions = {
      '[nm]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|(?:[y]+|[il1!\\|]+))+[gbqp]+[gbqp]*(?:[a\\@]+|[e3h]*[rl]+|[u]+[r]+)*[s\\$e]*(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])*': 'i am dumb', // Nigger
      '[n]+[e3]+[gbqp]+[gbqp]*[r](?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])[s\\$z]*': 'i am dumb', // Negro
      '[f]+[a\\@]+[gbqp]+[gbqp]*(?:(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+|[t]+)*[s\$]*': 'Fox', // Faggot
      '[c]+[u]+[n]+[t]+[s\\$z]*': 'Gorilla', // Cunt
      '[r]+[e3]+[t]+[a\\@]+[r]+[d]+[s\\$z]*': 'Duck', // Retard
      '[b]+[a\\@]+[s\\$z]+[t]+[a\\@]+[r]+[d]+[s\\$z]*': 'Raccoon', // Bastard
      '[w]+[h]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+[r]+[e3]+[s\\$z]*': 'Goat', // Whore
      '[b]+[il1!\\|]+[t]+[c]+[h]+[e3]*[s\\$z]*': 'Hyena', // Bitch
      '[m]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+[t]+[h]+[e3]+[r]+[f]+[u]+[c]+[k]+(?:[a\\@]|[e3]+[r]+)*[s\\$z]*': 'Chimpanzee', // Motherfucker
      '[p]+[e3]+[d]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+(?:[p]+[h]+[il1!\\|]+[e3]+)*[s\\$z]*': 'Koala', // Pedo(phile)
      '[s\\$z]+[il1!\\|]+[u]+[t]+[s\\$z]*': 'Hamster', // Slut
      '[t]+[r]+[a\\@]+[n]+[n]*(?:[y]+|[il1!\\|]+[e3]+)[s\\$z]*': 'Chameleon', // Tranny
      '[b]+[il1!\\|]+[m]+[b]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+[s\\$z]*': 'Woodchuck', // Bimbo
      '[c]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+[u]+[gbqp]+[a\\@]+[r]+[s\\$z]*': 'Platypus', // Cougar
      '[gbqp]+[u]+[s\\$z]+[s\\$z]*(?:[y]+|[il1!\\|]+[e3]+)[s\\$z]*': 'Otter', // Pussy
      '[c]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+[y]+(?:[\\(\\[\\{\\<][\\)\\]\\}\\>]|[o0])+[t]+[e3]+[s\\$z]*': 'Coyote', // Gypsy
      '[c]+[a\\@]+[n]+[v]+[a\\@]+[s\\$z]+[il1!\\|]+[a\\@]+[n]+[d]+(?:[\\.]*[n]+[e3]+[t]+)*': '[DOMAIN #2 BLOCKED]', // canvasland.net
      '[p]+[il1!\\|]+[x]+[e3]+[il1!\\|]+[d]+[a\\@]+[y]+(?:[s\\$z]*|[\\.]*[n]+[e3]+[t]+)*': '[DOMAIN #3 BLOCKED]', // pixeldays.fun
      '[gbqp]+[r]+[a\\@]+[b]+[il1!\\|]+[i]+[f]+[y]+(?:[\\.]*[l]+[i]+[n]+[k]+)*': '[DOMAIN #4 BLOCKED]' // grabify.link
    }
    this.fillerFullSubstitutions = '[~\`!@#\\$%\\^&\\*\\(\\)_\\+-=\\[\\]\\|\\{};:,\\.\\/<>\\?\"\']*'; // Filler text b.e't-w~e`e|n characters
    this.regExToAddFillerToFullSubstitutions = /([\]\)][\+\*]*)(?=[\[\(])(?!$)/g; // Matches "]" or ")" followed by 0 or more "+" or "*" followed by 1 "[" or "("

    // Temp key/value object that holds the the full substitutions with filler text
    this.tempRegExObject = Object.fromEntries(
      Object.entries(this.fullSubstitutions).map(([key, value]) => [
        key.replace(this.regExToAddFillerToFullSubstitutions, `$1${this.fillerFullSubstitutions}`),
        value
      ])
    );
    this.fullSubstitutions = this.tempRegExObject; // Overrides the full substitutions object with the object with full substitutions + filler text

    this.fullSubstitutionsObject = Object.keys(this.fullSubstitutions);
    this.fullSubstituteRegex = new RegExp(this.fullSubstitutionsObject.map(pattern => `(\\b${pattern}\\b)`).join('|'), 'gi');

    // Blocks international characters
    // First range line does NOT start with a "|"
    // Last range line ends with a ","
    this.internationalCharacters = new RegExp(
      '[\u00A0\u00AD\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]' + // Latin-1 Supplement (i.e. "ã")
      '|[\u0100-\u017E\u0180-\u024F]' + // Latin Extended A & B (i.e. "Ǽ")
      '|[\u0250-\u02AF]' + // IPA Extensions (i.e. "ˈæpəl")
      '|[\u02B0-\u02FF]' + // Spacing Modifier Letters (i.e. "ʰ")
      '|[\u0300-\u036F]' + // Combining Diacritical Marks (i.e. " ͥ  ")
      '|[\u0370-\u058C\u058F-\u06DD\u06DF-\u06E8\u06EA-\u07F5\u07F8-\u08FF]' + // Greek "Ω", Coptic "ϣ", Cyrillic "Ѣ", Aremenian "Ա", Hebrew "א", Arabic "ا", Syriac "ܔ", Thaana "ޑ", NKo "߁" Samaritan "ࠕ", Mandaic "ࡆ"
      '|[\u0900-\u0D9D\u0D9F-\u10FF]' + // Devanagari "न", Bengali "ব", Gurmukhi "ਗ", Gujarati "ગ", Oriya "ଗ", Tamil "க", Telugu "గ", Kannada "ಗ", Malayalam "ഗ", Sinhala "ඞ", Thai "ก", Lao "ກ", Tibetan "ཀ", Myanmar "က", Gregorian "Ⴤ"
      '|[\u1100-\u197F]' + // Hangul Jamo "ᄀ", Ethiopic "ሀ", Cherokee "Ꭰ", Canadian Syllabics "ᐁ", Ogham "ᚃ", Runic "ᚠ", Tagalog "ᜀ", Hanunoo "ᜁ", Buhid "ᝠ", Tagbanua "ᝡ", Khmer "ក", Mongolian "ᠠ", Limbu "ᤦ", Tai Le "ꓐ", Tai Lue "ᥐ"
      '|[\u1980-\u1CBF]' + // New Tai Lue "ᦀ", Khmer Symbols "᧠", Buginese "ᨀ", Tai Tham "ᨠ", Combining Diacritical Marks Extended "◌᪰", Balinese "ᬀ", Sundanese "ᮀ", Batak "ᯀ", Lepcha "ᰀ", Ol Chiki "ᱝ", Cyrillic Extended C "ᲀ", Gregorian Extended "Ა"
      '|[\u1CC0-\u200C\u200E-\u200F\u2011\u2028-\u202F\u205F-\u2061\u2065-\u206F]' + // Sundanese Supplement "᳀", Vedic Extentions "᳐", Phonetic Extensions "ᴸᴼᴸ", Phonetic Extensions Supplement "ᶀ", Combining Diacritical Marks Supplement "◌᷀  ", Latin Extended Additional "Ṉ", Greek Extended "ᾣ", General Punctuation " "
      '|[\u2070-\u209F\u20C1-\u2129\u212B-\u214F\u2160-\u218F\u242A-\u243F\u244B-\u24FF\u2776-\u2793]' + // Superscripts and Subscripts "⁰", Combining Diacritical Marks for Symbols "◌⃕", Letterlike Symbols "℃", Number Forms "Ⅹ", Control Pictures "␦", Optical Character Recognition "⑂", Enclosed Alphanumeric Supplement "Ⓔ", Dingbats "➉"
      '|[\u2B74\u2B75\u2B96\u2C00-\u2DFF\u2E5E-\u2FDF]' + // Miscellaneous Symbols and Arrows "⭳", Galgolitic "Ⰰ", Latin Extended C "Ⱡ", Coptic "Ⲁ", Georgian Supplement "ⴀ", Tifinagh "ⴴ", Ethiopic Extended "ⶀ", Cyrillic Extended A " ⷠ", CJK Radicals Supplement "⻆", Kangxi Radicals "⿔"
      '|[\u2FF0-\u31EF]' + // Ideographic Description Characters "⿰", CJK Symbols and Punctuation "〠", Hiragana "あ", Katakana "ア", Bopomofo "ㄅ", Hangul Compatibility Jamo "ㄲ", Kanbun "㆔", Bopomofo Extended "ㆠ", CJK Strokes "㇀"
      '|[\u31F0-\u9FFF]' + // Katakana Phonetic Extensions "ㇰ", Enclosed CJK Letters and Months "㈼", CJK Compatibility "㎤", CJK Unified Ideographs Extension A "㐀", Yijing Hexagram Symbols "䷐", CJK Unified Ideographs "蒚"
      '|[\uA000-\uA87F]' + // Yi Syllables "ꀀ", Yi Radicals "꒧", Lisu "ꓐ", Vai "ꔀ", Cyrillic Extended B "Ꙃ", Bamum "ꚠ", Modifier Tone Letters "꜀", Latin Extended D "Ꝇ", Syloti Nagri "ꠀ", Common Indic Number Forms "꠵", Phags-pa "ꡤ"
      '|[\uA880-\uA9C0\uA9C3-\uAAFF]' + // Saurashtra "ꢀ", Devanagari Extended "ꣽ", Kayah Li "꤀", Rejang "ꤰ", Hangul Jamo Extended "ꥠ", Javanese "꧃", Myanmar Extended B "ꧠ", Cham "ꨀ", Myanmar Extended A "ꩠ", Tai Viet "ꪀ", Meetei Mayek Extensions "ꫠ"
      '|[\uAB00-\uD7FF\uF900-\uFB4F]' + // Ethiopic Extended A "ꬁ", Latin Extended E "ꬰ", Cherokee Supplement "ꭰ", Hangul Syllables "가", Hangul Jamo Extended B "ힰ", CJK Compatibility Ideographs "豈", Alphabetic Presentation Forms "ﬀ"
      '|[\uFB50-\uFDFF\uFE10-\uFFF8\uFFFE\uFFFF]' + // Arabic Presentation Forms A "ﭐ", Vertical Forms "︐", Combining Half Marks "◌︠ ", CJK Compatibility Forms "︻", Small Form Variants "﹠", Arabic Presentation Forms B "ﺵ", Halfwidth and Fullwidth Forms "ｹ"
      '|[\u{10000}-\u{1018F}\u{1019D}-\u{1019F}\u{101A1}-\u{101CF}\u{101FE}-\u{101FF}\u{10280}-\u{1037F}]' + // Linear B Syllabary "𐀀", Linear B Ideograms "𐂀", Aegean Numbers "𐄀", Ancient Greek Numbers "𐅀", Lycian "𐊀", Carian "𐊠", Coptic Epact Numbers " 𐋠", Old Italic "𐌀", Gothic "𐌰", Old Permic "𐍐"
      '|[\u{10380}-\u{1083F}]' + // Ugaritic "𐎀", Old Persian "𐎠", Deseret "𐐀", Shavian "𐑐", Osmanya "𐒀", Osage "𐒰", Elbasan "𐔀", Caucasian Albanian "𐔰", Vithkuqi "𐕰", Todhri "𐗀", Linear A "𐘀", Latin Extended F "𐞀", Cypriot Syllabary "𐠀"
      '|[\u{10840}-\u{10A9F}]' + // Imperial Aramaic "𐡀", Palmyrene "𐡠", Nabataean "𐢀", Hatran "𐣠", Phoenician "𐤀", Lydian "𐤠", Meroitic Hieroglyphs "𐦀", Meroitic Cursive "𐦠", Kharoshthi "𐩂", Old South Arabian "𐩠", Old North Arabian "𐪀"
      '|[\u{10AC0}-\u{10E7F}]' + // Manichaean "𐫀", Avestan "𐬀", Inscriptional Parthian "𐭀", Inscriptional Pahlavi "𐭿", Psalter Pahlavi "𐮀", Old Turkic "𐰀", Old Hungarian "𐲀", Hanifi Rohingya "𐴀", Garay "𐵀", Rumi Numeral Symbols "𐹠"
      '|[\u{10E80}-\u{111DF}]' + // Yezidi "𐺀", Arabic Extended C "𐻂", Old Sogdian "𐼀", Sogdian "𐼰", Old Uyghur "𐽰", Chorasmian "𐾰", Elymaic "𐿠", Brahmi "𑀐", Kaithi "𑂀", Sora Sompeng "𑃐", Chakma "𑄃", Mahajani "𑅐", Sharada "𑆀"
      '|[\u{111E0}-\u{116FF}]' + // Sinhala Archaic Numbers "𑇡", Khojki "𑈀", Multani "𑊀", Khudawadi "𑊰", Grantha "𑌀", Tuli-Tigalari "𑎀", Newa "𑐀", Tirhuta "𑒀", Siddham "𑖀", Modi "𑘀", Mongolian Supplement "𑙠", Takri "𑚀", Myanmar Extended C "𑛐"
      '|[\u{11700}-\u{11B5F}]' + // Ahom "𑜀", Dogra "𑠀", Warang Citi "𑢠", Dives Akuru "𑤀", Nandinagari "𑦠", Zanabazar Square "𑨀", Soyombo "𑩐", Unified Canadian Aboriginal Syllabics Extended A "𑪰", Pau Chin Hau "𑫀", Devanagari Extended A "𑫀"
      '|[\u{11BC0}-\u{1247F}]' + // Sunuwar "𑯀", Bhaiksuki "𑰀", Marchen "𑱰", Masaram Gondi "𑴀", Gunjala Gondi "𑵠", Makasar "𑻠", Kawi "𑼀", Lisu Supplement "𑾰", Tamil Supplement "𑿀", Cuneiform " ", Cuneiform Numbers and Punctuation " "
      '|[\u{12480}-\u{1613F}]' + // Early Dynastic Cuneiform "𒒀", Cypro-Minoan "𒾐", Egyptian Hieroglyphs "𓀀", Egyptian Hieroglyph Format Controls "𓐰", Egyptian Hieroglyph Extended A "𓑠", Anatolian Hieroglyphs "𔐀", Gurung Khema "𖄀"
      '|[\u{16800}-\u{18AFF}]' + // Bamum Supplement "𖠀", Mro "𖩀", Tangsa "𖩰", Bassa Vah "𖫐", Pahawh Hmong "𖬀", Kirat Rai "𖵀", Medefaidrin "𖹀", Miao "𖼀", Ideographic Symbols and Punctuation "𖿠", Tangut "𗀀", Tangut Components "𘠀"
      '|[\u{18B00}-\u{1BCAF}]' + // Khitan Small Script "𘬀", Tangut Supplement "𘴀", Kana Extended B "𚿰", Kana Supplement "𛀀", Kana Extended A "𛄀", Small Kana Extension "𛄲", Nushu "𛅰", Duployan "𛰀", Shorthand Format Controls "𛲠"
      '|[\u{1CC00}-\u{1D0FF}\u{1D127}\u{1D128}\u{1D1EB}-\u{1D2FF}]' + // Symbols for Legacy Computing Supplement "𜰀", Znamenny Musical Notation "𜼀", Byzantine Musical Symbols "𝀀", Ancient Greek Musical Notation "𝈀", Kaktovik Numerals "𝋀", Mayan Numerals "𝋠"
      '|[\u{1D300}-\u{1E14F}]' + // Tai Xuan Jing Symbols "𝌀", Counting Rod "𝍠", Mathematical Alphanumeric Symbols "A", Sutton SignWriting "𝠀", Latin Extended G "𝼀", Glagolitic Supplement "𞀀", Cyrillic Extended D "𞀰", Nyiakeng Puachue Hmong "𞄀"
      '|[\u{1E290}-\u{1EEFF}]' + // Toto "𞊐", Wancho "𞋀", Nag Mundari "𞓐", Ol Onal "𞗐", Ethiopic Extended B "𞟠", Mende Kikakui "𞠀", Adlam "𞤀", Indic Siyaq Numbers "𞱱", Ottoman Siyaq Numbers "𞴁", Arabic Mathematical Alphabetic Symbols "𞸀"
      // Enclosed Alphanumeric Supplement "🄮", Enclosed Ideographic Supplement "🈐", CJK Unified Ideographs Extension B C D E F G H I "𠆝", CJK Compatibility Ideographs Supplement "你"
      '|[\u{1F02C}-\u{1F02F}\u{1F094}-\u{1F09F}\u{1F0AF}\u{1F0B0}\u{1F0C0}\u{1F0D0}\u{1F0F6}-\u{1F2FF}\u{1F6D8}-\u{1F6DB}\u{1F6ED}-\u{1F6EF}\u{1F6FD}-\u{1F6FF}\u{1F777}-\u{1F77A}\u{1F7DA}-\u{1F7DF}\u{1F7EC}-\u{1F7EF}\u{1F7F1}-\u{1F7FF}\u{1F80C}-\u{1F80F}\u{1F848}-\u{1F84F}\u{1F85A}-\u{1F85F}\u{1F888}-\u{1F88F}\u{1F8AE}-\u{1F8AF}\u{1F8BC}-\u{1F8BF}\u{1F8C2}-\u{1F8FF}\u{1FA54}-\u{1FA5F}\u{1FA6E}-\u{1FA6F}\u{1FA7D}-\u{1FA7F}\u{1FA8A}-\u{1FA8E}\u{1FAC7}-\u{1FACD}\u{1FADD}-\u{1FADE}\u{1FAEA}-\u{1FAEF}\u{1FAF9}-\u{1FAFF}\u{1FB93}\u{1FBFA}-\u{323AF}]' + 
      '|[\u{E0000}\u{E0002}-\u{E001F}]', // Tags (All of these are intentionally invisible so no example can be provided)
      'giu'
    );

    // Blocks international words
    // First range line does NOT start with a "|"
    // Last range line ends with a ","
    // this.internationalWords = new RegExp(
    //   '(^sa(?:ldiri)*$)' + // Blocks "Sa" and "saldiri"
    //   '|(^benim(?:le)*$)', + // Blocks "Benim" and "benimle"
    //   'giu'
    // );

    socketEvents.on('recvChatMessage', async (user, message, channelId) => {
      const errorMsg = await this.sendMessage(user, message, channelId);
      if (errorMsg) {
        socketEvents.broadcastSUChatMessage(
          user.id,
          'info',
          errorMsg,
          channelId,
          this.infoUserId,
          'il',
        );
      }
    });

    socketEvents.on('recvChatReaction', async (user, messageId, emoji, channelId) => {
      const errorMsg = await this.handleReaction(user, messageId, emoji, channelId);
      if (errorMsg) {
        socketEvents.broadcastSUChatMessage(
          user.id,
          'info',
          errorMsg,
          channelId,
          this.infoUserId,
          'il',
        );
      }
    });

    // Schedule the task for every odd day at 8 PM UTCz
    cron.schedule('0 20 */2 * *', () => {
      const today = new Date();
      if (today.getDate() % 2 !== 0) { // Check if the day is odd
        this.executeScheduledCommands();
      }
    });

    // Initialize void event tracking
    this.voidEvent = {
      phase: 'waiting',
      nextStart: null,
      location: null,
      duration: 8 * 60 * 1000 // 8 minutes in milliseconds
    };

    // Update void event status every minute
    setInterval(async () => {
      try {
        const nextEventTime = await nextEvent();
        if (!nextEventTime) {
          // No event scheduled
          this.voidEvent.phase = 'waiting';
          this.voidEvent.nextStart = null;
          this.voidEvent.location = null;
          return;
        }

        const now = Date.now();
        // Redis stores timestamp in milliseconds
        const nextEventMs = Number(nextEventTime);
        const timeUntilEvent = nextEventMs - now;

        if (timeUntilEvent > 30 * 60 * 1000) { // More than 30 minutes
          this.voidEvent.phase = 'waiting';
          this.voidEvent.nextStart = nextEventMs;
          this.voidEvent.location = null;
        } else if (timeUntilEvent > 0) { // Less than 30 minutes but not started
          this.voidEvent.phase = 'starting';
          this.voidEvent.nextStart = nextEventMs;
          // Get void location
          const eventArea = await getEventArea();
          if (eventArea) {
            const [i, j] = eventArea;
            const { size: canvasSize } = canvases[CANVAS_ID];
            const x = i * TILE_SIZE - canvasSize / 2;
            const y = j * TILE_SIZE - canvasSize / 2;
            this.voidEvent.location = { x, y };
          }
        } else if (timeUntilEvent > -this.voidEvent.duration) { // Event is active
          this.voidEvent.phase = 'active';
          this.voidEvent.nextStart = nextEventMs;
          // Get current void location
          const eventArea = await getEventArea();
          if (eventArea) {
            const [i, j] = eventArea;
            const { size: canvasSize } = canvases[CANVAS_ID];
            const x = i * TILE_SIZE - canvasSize / 2;
            const y = j * TILE_SIZE - canvasSize / 2;
            this.voidEvent.location = { x, y };
          }
        } else { // Event has ended
          this.voidEvent.phase = 'ended';
          this.voidEvent.nextStart = nextEventMs;
          this.voidEvent.location = null;
        }
      } catch (error) {
        logger.error(`Error updating void event status: ${error.message}`);
      }
    }, 60000); // Update every minute

    // Add void command regex (case insensitive)
    this.voidTimeRegex = /^when\s+void$/i;
    this.voidLocationRegex = /^where\s+void$/i;
  }

  async clearOldMessages() {
    if (!socketEvents.amIImportant()) {
      return;
    }
    const ids = Object.keys(this.defaultChannels);
    for (let i = 0; i < ids.length; i += 1) {
      const cid = ids[i];
      Message.destroy({
        where: {
          cid,
          createdAt: {
            [Op.lt]: new Date(new Date() - 10 * 24 * 3600 * 1000),
          },
        },
      });
    }
  }

  async initialize() {
    // find or create default channels
    for (let i = 0; i < CHAT_CHANNELS.length; i += 1) {
      const { name } = CHAT_CHANNELS[i];
      // eslint-disable-next-line no-await-in-loop
      const channel = await Channel.findOrCreate({
        where: { name },
        defaults: {
          name,
        },
      });
      const { id, type, lastTs } = channel[0];
      if (name === 'en') {
        this.enChannelId = id;
      }
      this.defaultChannels[id] = [
        name,
        type,
        lastTs,
      ];
      this.publicChannelIds.push(id);
    }
    // find or create non-english lang channels
    const langs = Object.keys(ttags);
    for (let i = 0; i < langs.length; i += 1) {
      const name = langs[i];
      if (name === 'default') {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const channel = await Channel.findOrCreate({
        where: { name },
        defaults: {
          name,
        },
      });
      const { id, type, lastTs } = channel[0];
      this.langChannels[name] = {
        id,
        type,
        lastTs,
      };
      this.publicChannelIds.push(id);
    }
    // find or create default users
    let name = INFO_USER_NAME;
    const infoUser = await RegUser.findOrCreate({
      attributes: [
        'id',
      ],
      where: { name },
      defaults: {
        name,
        verified: 3,
        email: 'info@example.com',
      },
      raw: true,
    });
    this.infoUserId = infoUser[0].id;
    name = EVENT_USER_NAME;
    const eventUser = await RegUser.findOrCreate({
      attributes: [
        'id',
      ],
      where: { name },
      defaults: {
        name,
        verified: 3,
        email: 'event@example.com',
      },
      raw: true,
    });
    this.eventUserId = eventUser[0].id;
    name = APISOCKET_USER_NAME;
    const apiSocketUser = await RegUser.findOrCreate({
      attributes: [
        'id',
      ],
      where: { name },
      defaults: {
        name,
        verified: 3,
        email: 'event@example.com',
      },
      raw: true,
    });
    this.apiSocketUserId = apiSocketUser[0].id;
    this.clearOldMessages();
    DailyCron.hook(this.clearOldMessages);
  }

  getDefaultChannels(lang) {
    const langChannel = {};
    if (lang && lang !== 'en') {
      const { langChannels } = this;
      if (langChannels[lang]) {
        const {
          id, type, lastTs,
        } = langChannels[lang];
        langChannel[id] = [lang, type, lastTs];
      }
    }
    return {
      ...langChannel,
      ...this.defaultChannels,
    };
  }

  static async addUserToChannel(
    userId,
    channelId,
    channelArray,
  ) {
    const [, created] = await UserChannel.findOrCreate({
      where: {
        UserId: userId,
        ChannelId: channelId,
      },
      raw: true,
    });

    if (created) {
      socketEvents.broadcastAddChatChannel(
        userId,
        channelId,
        channelArray,
      );
    }
  }

  /* Check if the user has access to the channel
   * user.lang has to be set
   * this is just the case in chathistory.js and SocketServer
   */
  userHasChannelAccess(user, cid) {
    if (this.defaultChannels[cid]) {
      return true;
    }
    if (user.channels[cid]) {
      return true;
    }
    const { lang } = user;
    return !!(this.langChannels[lang]
      && this.langChannels[lang].id === cid);
  }

  // Check if the message is a Private Message
  checkIfDm(user, cid) {
    if (this.defaultChannels[cid]) {
      return null;
    }
    const channelArray = user.channels[cid];
    if (channelArray && channelArray.length === 4) {
      return user.channels[cid][3];
    }
    return null;
  }

  // Obtains the history of a channel
  getHistory(cid, limit = 30) {
    return this.chatMessageBuffer.getMessages(cid, limit);
  }

  // Automatically executes commands at scheduled times
  async executeScheduledCommands() {
    // Execute the first command
    await this.adminCommands('/oddity bcd 7200', 'channelId', { name: 'Scheduler' });
    
    // Wait for 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Execute the second command
    await this.adminCommands('/oddity pcd 7200', 'channelId', { name: 'Scheduler' });

    // Wait for 2 hours (7200 seconds)
    setTimeout(() => {
      this.disbandCooldowns();
    }, 7200000); // 2 hours in milliseconds
  }

  // Reset the cooldowns to default
  async disbandCooldowns() {
    // Restore original values for bcd and pcd
    const filePath = path.join(__dirname, '../dist/canvases.json');
    let canvasData;
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      canvasData = JSON.parse(data);
    } catch (error) {
      console.error('Error reading canvases.json:', error);
      return;
    }

    const cooldowns = canvasData['0'];
    cooldowns.bcd = 1000; // Restore original value
    cooldowns.pcd = 2000; // Restore original value

    // Write the restored values back to the JSON file
    try {
      fs.writeFileSync(filePath, JSON.stringify(canvasData, null, 2));
    } catch (error) {
      console.error('Error writing to canvases.json:', error);
    }

    // Announce the disbanding
    this.broadcastChatMessage(
      'info',
      'Cooldowns for bcd and pcd have been restored to their original values.',
      'channelId',
      this.infoUserId
    );
  }

  // Formats time in highest unit possible
  // Highest unit is the greatest unit above 1 (i.e. 90 seconds = 1.5 minutes)
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (seconds < 2592000) {
      const days = Math.floor(seconds / 86400);
      return `${days} day${days !== 1 ? 's' : ''}`;
    } else if (seconds < 31536000) {
      const months = Math.floor(seconds / 2592000);
      return `${months} month${months !== 1 ? 's' : ''}`;
    } else {
      const years = Math.floor(seconds / 31536000);
      return `${years} year${years !== 1 ? 's' : ''}`;
    }
  }

  // Handles admin commands
  async adminCommands(message, channelId, user) {
    // admin commands
    const cmdArr = message.split(' ');
    const cmd = cmdArr[0].substring(1); // get the command without the leading '/'
    const args = cmdArr.slice(1); // get the arguments
    const initiator = `@[${escapeMd(user.name)}](${user.id})`;
    
    switch (cmd) {
      case 'mute': {
        const timeMin = Number(args.slice(-1));
        if (args.length < 2 || Number.isNaN(timeMin)) {
          return this.mute(
            await getUserIdFromMd(args.join(' ')),
            {
              printChannel: channelId,
              initiator,
            },
          );
        }
        return this.mute(
          await getUserIdFromMd(args.slice(0, -1).join(' ')),
          {
            printChannel: channelId,
            initiator,
            duration: timeMin,
          },
        );
      }

      case 'unmute':
        return this.unmute(
          await getUserIdFromMd(args.join(' ')),
          {
            printChannel: channelId,
            initiator,
          },
        );

      case 'mutec': {
        if (args[0]) {
          const cc = args[0].toLowerCase();
          const ret = await mutec(channelId, cc);
          if (ret === null) {
            return 'No legit country defined';
          }
          if (!ret) {
            return `Country ${cc} is already muted`;
          }
          if (ret) {
            this.broadcastChatMessage(
              'info',
              `Country ${cc} has been muted from this channel by ${initiator}`,
              channelId,
              this.infoUserId,
            );
          }

          logModerationCommands({
            executorId: await getUserIdFromMd(initiator),
            executorName: await getUsernameFromMd(initiator),
            command: cmd,
            targetId: cc,
            timestamp: new Date()
          });

          return null;
        }
        return 'No country defined for mutec';
      }

      case 'unmutec': {
        if (args[0]) {
          const cc = args[0].toLowerCase();
          const ret = await unmutec(channelId, cc);
          if (ret === null) {
            return 'No legit country defined';
          }
          if (!ret) {
            return `Country ${cc} is not muted`;
          }
          this.broadcastChatMessage(
            'info',
            `Country ${cc} has been unmuted from this channel by ${initiator}`,
            channelId,
            this.infoUserId,
          );

          logModerationCommands({
            executorId: await getUserIdFromMd(initiator),
            executorName: await getUsernameFromMd(initiator),
            command: cmd,
            targetId: cc,
            timestamp: new Date()
          });

          return null;
        }
        const ret = await unmutecAll(channelId);
        if (ret) {
          this.broadcastChatMessage(
            'info',
            `All countries unmuted from this channel by ${initiator}`,
            channelId,
            this.infoUserId,
          );

          logModerationCommands({
            executorId: await getUserIdFromMd(initiator),
            executorName: await getUsernameFromMd(initiator),
            command: cmd,
            timestamp: new Date()
          });

          return null;
        }
        return 'No country is currently muted from this channel';
      }

      case 'listmc': {
        const ccArr = await listMutec(channelId);
        if (ccArr.length) {
          return `Muted countries: ${ccArr}`;
        }
        return 'No country is currently muted from this channel';
      }

      case 'purge': {
        if (args.length < 2) {
          return 'Usage: /purge <user> <amount|all>';
        }

        const rawTarget = args[0];
        const extractedId = await getUserIdFromMd(rawTarget);
        const userId = Number(extractedId);
        if (!userId || Number.isNaN(userId)) {
          return 'Invalid user identifier';
        }

        const amount = args[1].toLowerCase();

        const userResult = await query('SELECT name FROM Users WHERE id = ?', [userId]);
        if (!userResult || userResult.length === 0) {
          return 'User not found';
        }
        const userName = userResult[0].name;

        let messageCount;
        let isPurgeAll = false;

        if (amount.toLowerCase() === 'all') {
          isPurgeAll = true;
          // Get all messages from this user in the channel
          const messagesToPurge = await Message.findAll({
            where: {
              cid: channelId,
              uid: userId
            },
            order: [['createdAt', 'DESC']]
          });
          messageCount = messagesToPurge.length;
        } else {
          messageCount = parseInt(amount, 8);
          if (isNaN(messageCount) || messageCount <= 0) {
            return 'Invalid message count';
          }
        }

        logModerationCommands({
          executorId: await getUserIdFromMd(initiator),
          executorName: await getUsernameFromMd(initiator),
          command: cmd,
          targetId: userId,
          targetName: userName,
          commandDescription: `${amount},${messageCount}`, // Type of purge, number of messages
          timestamp: new Date()
        });

        // Get the messages to be purged
        const messagesToPurge = await Message.findAll({
          where: {
            cid: channelId,
            uid: userId
          },
          order: [['createdAt', 'DESC']],
          limit: isPurgeAll ? undefined : messageCount
        });

        // Get message IDs for reaction cleanup
        const purgedMessageIds = messagesToPurge.map(msg => msg.id);

        // Delete reactions associated with the messages being purged
        if (purgedMessageIds.length > 0) {
          const reactionsToDelete = await Reaction.findAll({
            where: {
              messageId: purgedMessageIds
            },
            include: [
              {
                model: RegUser,
                as: 'user',
                attributes: ['name']
              }
            ]
          });

          // Broadcast reaction removals to clients before deleting from database
          for (const reaction of reactionsToDelete) {
            socketEvents.broadcastChatReaction(
              reaction.messageId,
              reaction.emoji,
              reaction.userId,
              reaction.user.name,
              channelId,
              'remove'
            );
          }

          // Delete all reactions for these messages
          await Reaction.destroy({
            where: {
              messageId: purgedMessageIds
            }
          });
        }

        // Delete the messages
        await Message.destroy({
          where: {
            cid: channelId,
            uid: userId
          },
          order: [['createdAt', 'DESC']],
          limit: isPurgeAll ? undefined : messageCount
        });

        // Clear the messages from the chat buffer
        const messages = this.chatMessageBuffer.buffer.get(channelId);
        if (messages) {
          if (isPurgeAll) {
            // Remove all messages from this user
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i][3] === userId) { // messages[i][3] is the uid
                messages.splice(i, 1);
              }
            }
          } else {
            // Filter out the most recent messages from this user
            let count = 0;
            for (let i = messages.length - 1; i >= 0 && count < messageCount; i--) {
              if (messages[i][3] === userId) { // messages[i][3] is the uid
                messages.splice(i, 1);
                count++;
              }
            }
          }
        }

        // Broadcast a system message to refresh the chat
        this.broadcastChatMessage(
          'info',
          `${messageCount} messages from ${userName} have been purged by ${initiator}`,
          channelId,
          this.infoUserId
        );

        // Force refresh the chat for all users with the purged message IDs
        socketEvents.broadcastChatRefresh(channelId, purgedMessageIds);

        return null;
      }

      case 'autoban': {
        if (args[0]) {
          this.autobanPhrase = args.join(' ');
          if (this.autobanPhrase === 'unset' || this.autobanPhrase.length < 5) {
            this.autobanPhrase = null;
          }
          return `Set autoban phrase on shard to ${this.autobanPhrase}`;
        }
        // eslint-disable-next-line
        if (this.autobanPhrase) {
          // eslint-disable-next-line
          return `Current autoban phrase on shard is ${this.autobanPhrase}, use "/autoban unset" to remove it`;
        }
        return 'Autoban phrase is currently not set on this shard';
      }

      case 'ban':
        return 'Ban has moved to the mod area, Please check there :)';

      case 'unban':
        return 'Unban has moved to the mod area, Please check there :)';

      case 'reason': {
        if (args.length < 1) {
          return 'Usage: /reason <username_or_id>'; 
        }

        const targetUser = args.pop(); 
        let searchResult;

        if (!isNaN(targetUser)) {
          searchResult = await query('SELECT * FROM Users WHERE id = ?', [targetUser]);
        } else {
          searchResult = await query('SELECT * FROM Users WHERE name = ?', [targetUser]);
        }

        if (!searchResult || searchResult.length === 0) {
          return `User "${targetUser}" not found.`; 
        }

        const userData = searchResult[0]; 

        // Check if the user is banned
        if (userData.banned === 1) {
          // Fetch ban details with moderator name
          const banInfo = await query(`
            SELECT u.ban_reason, u.ban_expiration, u.moderator, m.name as mod_name 
            FROM Users u 
            LEFT JOIN Users m ON u.moderator = m.id 
            WHERE u.id = ?
          `, [userData.id]);

          if (banInfo.length > 0) {
            const banDetails = banInfo[0];
            const expiration = banDetails.ban_expiration ? moment(banDetails.ban_expiration).format('YYYY-MM-DD HH:mm:ss') : 'Permanent';
            const modInfo = banDetails.mod_name ? `${banDetails.mod_name} (${banDetails.moderator})` : banDetails.moderator;
            return `User "${userData.name}" is banned for: ${banDetails.ban_reason}, expires at: ${expiration}, moderated by: ${modInfo}`;
          }
        } else if (userData.banned === 0) {
          return `User "${userData.name}" is not banned.`; 
        }

        return `User "${userData.name}" has an unknown ban status.`; // Fallback for unexpected cases
      }

      case 'chatcd': {
        if (args.length < 1) {
          return 'Usage: /chatcd <seconds>';
        }
        const seconds = parseInt(args[0], 10);
        if (isNaN(seconds) || seconds < 0) {
          return 'Please provide a valid number of seconds';
        }
        this.channelCooldowns[channelId] = seconds;
        this.broadcastChatMessage(
          'info',
          `Chat cooldown set to ${seconds} seconds by ${initiator}`,
          channelId,
          this.infoUserId
        );

        logModerationCommands({
          executorId: await getUserIdFromMd(initiator),
          executorName: await getUsernameFromMd(initiator),
          command: cmd,
          consequenceLength: seconds,
          timestamp: new Date()
        });

        return null;
      }

      case 'help':
        return `/help  -- This message ---------- /mute <user> (time)  -- Mute user (0 = forever) ---------- /unmute <user>  -- Unmute user ---------- /mutec <code>  -- Mute country ---------- /unmutec (code) -- Unmute country (no code = all) ---------- /listmc  -- List muted countries ---------- /purge <userid> <amount|all>  -- Purge chat ---------- /autoban <phrase>  -- Bans those who say the phrase ---------- /reason <user>  -- View ban reason ---------- /chatcd <seconds>  -- Set chat cooldown (0 = no) -------------------- <required> (optional)`;

      default:
        return `Couldn't parse command ${cmd}`;
    }
  }

  parseDuration(durationStr) {
    const regex = /^(\d+)([dwmqmys])$/;
    const match = durationStr.match(regex);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd': return value * 86400;
      case 'w': return value * 604800;
      case 'm': return value * 2592000;
      case 'mn': return value * 60;
      case 'y': return value * 31536000;
      case 's': return value;
      default: return null;
    }
  }

  logBanAction(moderator, username, reason, duration) {
    const logDir = '/root/pixelplanet/dist/log/moderation/';
    const logFileName = `modtools-bans-${moment().format('YYYY-MM-DD')}.log`;
    const logFilePath = path.join(logDir, logFileName);
    const logMessage = `Moderator ${moderator} banned user ${username} for reason "${reason}" until ${duration} seconds\n`;

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(logFilePath, logMessage);

    this.scheduleLogFileDeletion(logFilePath);
  }

  scheduleLogFileDeletion(logFilePath) {
    const oneWeek = 7 * 24 * 60 * 60 * 1000; 
    setTimeout(() => {
      if (fs.existsSync(logFilePath)) {
        fs.unlinkSync(logFilePath); 
      }
    }, oneWeek);
  }

  logUnbanAction(moderator, username) {
    const logDir = '/root/pixelplanet/dist/log/moderation/';
    const logFileName = `modtools-bans-${moment().format('YYYY-MM-DD')}.log`;
    const logFilePath = path.join(logDir, logFileName);
    const logMessage = `Moderator ${moderator} unbanned user ${username}\n`;

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(logFilePath, logMessage);
  }

  /** Method to format time remaining
   * 
   * @param {*} ms - Time in milliseconds
   * @returns Formatted time string
   */
  formatTimeRemaining(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((ms % (60 * 1000)) / 1000);
    
    let timeStr = '';
    if (hours > 0) timeStr += `${hours} hours `;
    if (minutes > 0) timeStr += `${minutes} minutes `;
    if (seconds > 0) timeStr += `${seconds} seconds`;
    return timeStr.trim();
  }

  /** Update the handleVoidCommand method to match /void endpoint timing
   * @param {*} message - Message to check
   * @return {string|null} - Returns a string if the message needs a void response, otherwise null
  */
  handleVoidCommand(message) {
    // Check for "when void" command
    if (this.voidTimeRegex.test(message)) {
      if (!this.voidEvent || !this.voidEvent.nextStart) {
        return 'No void event is currently scheduled.';
      }

      const now = Date.now();
      const timeUntilEvent = this.voidEvent.nextStart - now;
      
      switch (this.voidEvent.phase) {
        case 'waiting':
          const hours = Math.floor(timeUntilEvent / (1000 * 60 * 60));
          const minutes = Math.floor((timeUntilEvent % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((timeUntilEvent % (1000 * 60)) / 1000);
          
          let timeStr = '';
          if (hours > 0) timeStr += `${hours}h `;
          if (minutes > 0) timeStr += `${minutes}m `;
          if (seconds > 0) timeStr += `${seconds}s`;
          
          return `Next void event begins in ${timeStr.trim()}`;
          
        case 'starting':
          return 'The void is about to appear! Get ready to defend!';
          
        case 'active':
          return 'The void is currently active! Defend your pixels!';
          
        case 'ended':
          return 'The void event has ended. Wait for the next one!';
          
        default:
          return 'Unable to determine void event status.';
      }
    }

    // Check for "where void" command
    if (this.voidLocationRegex.test(message)) {
      if (!this.voidEvent) {
        return 'No void event information available.';
      }
      
      const { x, y } = this.voidEvent.location;
      
      switch (this.voidEvent.phase) {
        case 'waiting':
          return 'The void location will be revealed when the event starts.';
          
        case 'starting':
        case 'active':
          return `The void is located near coordinates (${x}, ${y}).`;
          
        case 'ended':
          return 'The void has disappeared. Wait for the next event!';
          
        default:
          return 'Unable to determine void location.';
      }
    }

    return null;
  }

  /**
   * User.ttag for translation has to be set, this is just the case
   * in SocketServer for websocket connectionss
   * @param user User object
   * @param message string of message
   * @param channelId integer of channel
   * @return error message if unsuccessful, otherwise null
   */
  async sendMessage(
    user,
    message,
    channelId,
  ) {
    const { id } = user;
    const { t } = user.ttag;
    const { name } = user;
    const pixelCount = await getPixelCount(id);
    if (pixelCount < 1000 && user.userlvl === 0) {
      return t`You need atleast 1000 pixels to chat. Right now you have ${pixelCount} pixels.`;
    }

    // If the user does not exist
    if (!name || !id) {
      return null;
    }
    const country = user.regUser.flag || 'xx';

    // Check for chat cooldown
    if (this.channelCooldowns[channelId]) {
      if (!user.lastMessageTime) {
        user.lastMessageTime = {};
      }
      const now = Date.now();
      const lastMessageTime = user.lastMessageTime[channelId] || 0;
      const cooldownMs = this.channelCooldowns[channelId] * 1000;
      
      if (now - lastMessageTime < cooldownMs) {
        const waitTime = Math.ceil((cooldownMs - (now - lastMessageTime)) / 1000);
        return t`There is a cooldown on this chat channel, Please try again in ${waitTime}s`;
      }
      user.lastMessageTime[channelId] = now;
    }

    // If the user is banned
    const userCheck = await query('SELECT banned, ban_expiration FROM Users WHERE id = ?', [id]);
    if (userCheck.length > 0 && userCheck[0].banned === 1) {
        // If there's an expiration time and it's in the past, auto-unban
        if (userCheck[0].ban_expiration && new Date(userCheck[0].ban_expiration) < new Date()) {
            await query('UPDATE Users SET banned = 0, ban_expiration = NULL, ban_reason = NULL WHERE id = ?', [id]);
        } else {
            return t`You are banned, You can not type`;
        }
    }

    // Bans the user if the name contains a bannable phrase
    if (name.trim() === ''
      || (this.autobanPhrase && message.includes(this.autobanPhrase))
    ) {
      const { ipSub } = user;
      if (!user.banned) {
        banIP(ipSub, 'CHATBAN', 0, 1);
        mute(id);
        logger.info(`CHAT AUTOBANNED: ${ipSub}`);
        user.banned = true;
      }
      return 'nope';
    }

    // If the user has powers
    // Truthy if userlvl is 0
    // Falsy if userlvl is 1 or higher
    if (!user.userlvl) {
      const [allowed, needProxycheck] = await allowedChat(
        channelId,
        id,
        user.ipSub,
        country,
      );
      if (allowed) {
        logger.info(
          `${name} / ${user.ip} tried to send chat message but is not allowed`,
        );
        if (allowed === 1) {
          return t`You can not send chat messages while using a proxy`;
        } if (allowed === 100 && user.userlvl === 0) {
          return t`Your country is temporary muted from this chat channel`;
        } if (allowed === 101) {
          // eslint-disable-next-line max-len
          return t`You are permanently muted, join our guilded to appeal the mute`;
        } if (allowed === 2) {
          return t`You are banned`;
        } if (allowed === 3) {
          return t`Your Internet Provider is banned`;
        } if (allowed < 0) {
          const ttl = -allowed;
          if (ttl > 120) {
            const timeMin = Math.round(ttl / 60);
            return t`You are muted for another ${timeMin} minutes`;
          }
          return t`You are muted for another ${ttl} seconds`;
        }
      }
      if (needProxycheck) {
        isIPAllowed(user.ip);
      }
    } else if (message.charAt(0) === '/') {
      return this.adminCommands(message, channelId, user);
    }

    // Ratelimits the user
    if (!user.rateLimiter) {
      user.rateLimiter = new RateLimiter(20, 15, true);
    }
    const waitLeft = user.rateLimiter.tick();
    if (waitLeft) {
      const waitTime = Math.floor(waitLeft / 1000);
      // eslint-disable-next-line max-len
      return t`You are sending messages too fast, you have to wait ${waitTime}s :(`;
    }

    // If user does not have access to the channel
    if (!this.userHasChannelAccess(user, channelId)) {
      return t`You don\'t have access to this channel`;
    }
    
    // === Message transformations to make links work better ===

    // Save original message for optional logging
    const originalMessage = message;

    // Trim whitespace at both ends
    message = message.trim();
    // const textToCheck = Array(3).fill(message).join(' ')
    // const blockedLangs = ['rus', 'tur'];
    // // Check if message is non-english in the English channel
    // const langCode = franc(textToCheck)
    // if (channelId === this.enChannelId && blockedLangs.includes(langCode)) {
    //   return user.ttag.t`This channel is for English messages only. If you feel like this is wrong report to our discord server. Detected: ${langCode}`;
    // }

    // 1) Remove pixmap.fun domain from links of form https://*.pixmap.fun/#XY,number,number,number
    message = message.replace(
      /https?:\/\/(?:[\w-]+\.)*pixmap\.fun\/#([A-Za-z]{1,2}),(\d+),(\d+),(\d+)/g,
      '#$1,$2,$3,$4'
    );

    // 2) Append ",16" when pattern is exactly #XY,number,number (no third number)
    message = message.replace(
      /#([A-Za-z]{1,2}),(\d+),(\d+)(?![\d,])/g,
      '#$1,$2,$3,16'
    );

    // Custom country flags
    const customFlagOverrides = {
      2927: 'bt',
      41030: 'to',
      1384: 'fa',
      237286: 'lv',
      38: 'tu',
      509: 'ru',
      221472: 'kp',
    };

    let displayCountry = country;
    if (user.userlvl !== 0) {
      displayCountry = 'zz';
    } else {
      const override = customFlagOverrides[user.id];
      displayCountry = override || country;
    }

    // If the user is not email verified
    if (USE_MAILER && !user.regUser.verified) {
      return t`Your mail has to be verified in order to chat`;
    }

    // If the message is too long
    if (message.length > 200) {
      // eslint-disable-next-line max-len
      return t`You can\'t send a message this long :(`;
    }
    
    // If the user is spamming
    if (user.last_message && user.last_message === message) {
      user.message_repeat += 1;
      if (user.message_repeat >= 5) {
        this.mute(name, { duration: 60, printChannel: channelId });
        user.message_repeat = 0;
        return t`Stop flooding.`;
      }
    } else {
      user.message_repeat = 0;
      user.last_message = message;
    }

    // Flood protection: mute if 5 consecutive messages in this channel are from the same user
    if (!this.channelState) this.channelState = {};
    if (!this.channelState[channelId]) {
        this.channelState[channelId] = { lastAuthor: null, consecCount: 0 };
    }
    const state = this.channelState[channelId];
    if (state.lastAuthor === name) {
        state.consecCount++;
    } else {
        state.lastAuthor = name;
        state.consecCount = 1;
    }
    if (state.consecCount >= 10) {
        this.mute(name, { duration: 10, printChannel: channelId });
        state.consecCount = 0;
        return t`Stop flooding.`;
    }

    message = message.trim(); // Trim leading and trailing spaces

    logger.info(
      `Received chat message ${message} from ${name} / ${user.ip}`,
    );

    // Check for void commands
    const voidResponse = this.handleVoidCommand(message);
    if (voidResponse) {
      // Return the response instead of broadcasting
      return voidResponse;
    }

    // Process mentions in the message
    const mentionRegex = /@(\w+)/g;
    let matches = message.match(mentionRegex);
    if (matches) {
      // Convert @username to proper mention format
      for (const match of matches) {
        const username = match.substring(1); // Remove @ symbol
        try {
          const searchResult = await findIdByNameOrId(username);
          if (searchResult) {
            const { name: foundName, id: foundId } = searchResult;
            // Replace @username with @[username](id) format
            message = message.replace(
              match,
              `@[${escapeMd(foundName)}](${foundId})`
            );
          }
        } catch (error) {
          logger.error(`Error processing mention for ${username}: ${error.message}`);
        }
      }
    }

    
    // Truthy if userlvl is 0
    // Falsy if userlvl is 1 or higher
    if (!user.userlvl) {

      // Chat message substring substitution
      message = message.replace(this.partialSubstituteRegex, match => this.partialSubstitutions[match]);
      message = message.replace(this.fullSubstituteRegex, (...args) => {
        // args[0] = full match
        // args[1] to args[n] = capture groups from each pattern
        for (let i = 1; i < args.length - 2; i++) {

          console.log(`Checking capture group ${i}: ${args[i]}`);

          // If the capture group exists...
          if (args[i] !== undefined) {

            // ...AND if the capture group contains a whitelisted word...
            if (this.filterWhitelist.some(word => args[i].toLowerCase() == word.toLowerCase())) {
              return args[i]; // ...do not substitute the match, return the original captured group
            }

            // Else, substitute the match with the corresponding filter word
            const matchedPattern = this.fullSubstitutionsObject[i - 1];
            return this.fullSubstitutions[matchedPattern];
          }
        }
        return args[0]; // Fallback: return original
      });

      // If the message contains international characters
      const messageNoMentions = message.replace(/@\[[^\]]+\]\(\d+\)/gi, '');
      let matchedInternationalCharacters = messageNoMentions.match(this.internationalCharacters);
      //let matchedInternationalWords = messageNoMentions.match(this.internationalWords);
      if ((matchedInternationalCharacters != null) && (channelId === this.enChannelId)) {

        matchedInternationalCharacters = [...new Set(matchedInternationalCharacters)].join(', '); // Remove duplicates international characters

        return t`This channel is for English messages only. Please use the \"int\" channel for international languages. Do you think your message was blocked by mistake? Ask the Pixmap staff on our Discord server to unblock these characters: ${matchedInternationalCharacters}`;
      }
    }
    
    // Get user's faction tag
    const factionTag = await getUserFactionTag(id);
    
    this.broadcastChatMessage(
      name,
      message,
      channelId,
      id,
      displayCountry,
      true, // sendapi
      factionTag,
    );
    return null;
  }

  /** Broadcasts a chat message
   * 
   * @param  {...any} args - Arguments to be passed to the chatMessageBuffer
   * @returns broadcastChatMessage arguments
   */
  broadcastChatMessage(...args) {
    return this.chatMessageBuffer.broadcastChatMessage(...args);
  }

  /** Mutes user(s)
   * 
   * @param {*} nameOrId - Name or ID of the user(s) to mute
   * @param {*} opts - Options
   * @returns null
   */
  async mute(nameOrId, opts) {
    const timeMin = opts.duration || null;
    const initiator = opts.initiator || null;
    const printChannel = opts.printChannel || null;

    const searchResult = await findIdByNameOrId(nameOrId);
    if (!searchResult) {
      return `Couldn't find user ${nameOrId}`;
    }
    const { name, id } = searchResult;
    const userPing = `@[${escapeMd(name)}](${id})`;

    mute(id, timeMin);

    logModerationCommands({
      executorId: await getUserIdFromMd(initiator),
      executorName: await getUsernameFromMd(initiator),
      command: 'mute',
      targetId: id,
      targetName: name,
      consequenceLength: timeMin,
      timestamp: new Date()
    });

    if (printChannel) {
      if (timeMin) {
        this.broadcastChatMessage(
          'info',
          (initiator)
            ? `${userPing} has been muted for ${timeMin}min by ${initiator}`
            : `${userPing} has been muted for ${timeMin}min`,
          printChannel,
          this.infoUserId,
        );
      } else {
        this.broadcastChatMessage(
          'info',
          (initiator)
            ? `${userPing} has been muted forever by ${initiator}`
            : `${userPing} has been muted forever`,
          printChannel,
          this.infoUserId,
        );
      }
    }
    logger.info(`Muted user ${userPing}`);
    return null;
  }

  /** Unmutes user(s)
   * 
   * @param {*} nameOrId - Name or ID of the user(s) to unmute
   * @param {*} opts - Options
   * @returns null
   */
  async unmute(nameOrId, opts) {
    const initiator = opts.initiator || null;
    const printChannel = opts.printChannel || null;

    const searchResult = await findIdByNameOrId(nameOrId);
    if (!searchResult) {
      return `Couldn't find user ${nameOrId}`;
    }
    const { name, id } = searchResult;
    const userPing = `@[${escapeMd(name)}](${id})`;

    const succ = await unmute(id);
    if (!succ) {
      return `User ${userPing} is not muted`;
    }

    logModerationCommands({
      executorId: await getUserIdFromMd(initiator),
      executorName: await getUsernameFromMd(initiator),
      command: 'unmute',
      targetId: id,
      targetName: name,
      timestamp: new Date()
    });

    if (printChannel) {
      this.broadcastChatMessage(
        'info',
        (initiator)
          ? `${userPing} has been unmuted by ${initiator}`
          : `${userPing} has been unmuted`,
        printChannel,
        this.infoUserId,
      );
    }
    logger.info(`Unmuted user ${userPing}`);
    return null;
  }

  // Handle chat reactions
  async handleReaction(user, messageId, emoji, channelId) {
    try {
      // Check if user is registered
      if (!user.isRegistered) {
        return 'You must be logged in to react to messages';
      }

      // Check if user has access to the channel
      if (!this.userHasChannelAccess(user, channelId)) {
        return 'You do not have access to this channel';
      }

      // Validate emoji (check if it exists in our emoji folder)
      const validEmojis = [
        'check', 'clock', 'cross', 'crown', 'exclamation', 'fire', 'flag',
        'heart', 'laugh', 'paint', 'pixel', 'planet', 'question', 'shield',
        'smile', 'star', 'sword', 'thumbsdown', 'thumbsup', 'wink'
      ];
      
      if (!validEmojis.includes(emoji)) {
        return 'Invalid emoji';
      }

      // Rate limiting - 3 second cooldown
      const userId = user.id;
      const now = Date.now();
      const lastReaction = this.userReactionCooldowns.get(userId);
      
      if (lastReaction && (now - lastReaction) < 3000) {
        const timeLeft = Math.ceil((3000 - (now - lastReaction)) / 1000);
        return `Please wait ${timeLeft} second(s) before reacting again`;
      }

      // Check if message exists and get message details
      const message = await Message.findByPk(messageId, {
        include: [
          {
            model: RegUser,
            as: 'user',
            attributes: ['name']
          }
        ]
      });

      if (!message) {
        return 'Message not found';
      }

      // Check if message is in the correct channel
      if (message.cid !== channelId) {
        return 'Message not in this channel';
      }

      // Check if user already reacted with this emoji
      const existingReaction = await Reaction.findOne({
        where: {
          messageId,
          userId,
          emoji
        }
      });

      let action;
      if (existingReaction) {
        // Remove existing reaction
        await existingReaction.destroy();
        action = 'remove';
      } else {
        // Add new reaction
        await Reaction.create({
          messageId,
          userId,
          emoji
        });
        action = 'add';
      }

      // Update rate limit
      this.userReactionCooldowns.set(userId, now);

      // Broadcast reaction to all users in the channel
      socketEvents.broadcastChatReaction(
        messageId,
        emoji,
        userId,
        user.name,
        channelId,
        action
      );

      return null; // Success
    } catch (error) {
      logger.error(`Error handling reaction: ${error.message}`);
      return 'Failed to process reaction';
    }
  }
}

export default new ChatProvider();
