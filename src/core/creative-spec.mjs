const han=/[\u3400-\u9fff]/;
const quoted=value=>JSON.stringify(String(value).trim().replace(/[\r\n]+/g,' '));
export const CREATIVE_RULES=`Cover art: write coverPrompt as ENGLISH visual art direction, describing a distinctive scene, composition, palette and lighting tailored to this song. Chinese is allowed ONLY inside exact quoted display text. Always supply coverSubtitle, a concise meaningful English subtitle (2-6 words), and preserve the exact song title in its original language. The application adds mandatory large title and smaller subtitle typography. Never request text-free artwork or omit the title. Duration: choose durationSeconds independently for EACH song according to the user's requested length, tempo, lyric density and arrangement. It is a target in seconds, not a fixed 180-second default. A 2-minute song needs about 120, 4 minutes about 240, 5 minutes about 300. As a rough lyric-planning guide at a moderate tempo, a 4-minute full vocal song often needs around 48-64 sung lines, and a 5-minute song around 60-80, adjusted for line length, rests and instrumental sections. Do not merely reuse a short-song lyric for a long target. Write enough complete original lyric sections for the chosen duration, including verses, repeated choruses, bridge, instrumental spaces and a resolved outro where suitable. Include tempo in BPM in style. Do not squeeze a long-song request into short lyrics. Provide optional abc only if you have a valid original ABC score matching the arrangement. The engine's generation limit is a safety ceiling, not an exact duration guarantee; never promise exact timing or say the track was measured before generation. Do not automatically regenerate or review quality.`;

export function coverSpec(song){
 const title=String(song.title||'Untitled').trim();
 const subtitle=String(song.coverSubtitle||'ZOW ORIGINAL').trim().slice(0,120);
 let scene=String(song.coverPrompt||'').trim();
 const outsideQuotes=scene.replace(/"[^"]*"|'[^']*'|「[^」]*」|“[^”]*”/g,'');
 if(!scene||han.test(outsideQuotes)){
  const text=scene+' '+song.style+' '+title;
  scene=/雨|rain/i.test(text)?'A cinematic rainy city at night, wet pavement reflecting amber and blue light, a solitary figure, intimate atmospheric record-sleeve photography.':/山|河|乡|田|folk/i.test(text)?'A poetic rural landscape, layered mountains and a winding river, a small human silhouette, warm natural light, refined cinematic record-sleeve photography.':'A distinctive cinematic music single cover, one strong focal subject, evocative light and shadow, rich restrained colors, tactile film grain and generous negative space for typography.';
 }
 scene=scene.replace(/\b(?:no (?:other )?(?:text|lettering|typography)|without (?:any )?(?:text|lettering|typography)|text[- ]free)\b[^.!?]*/gi,'').trim();
 const prompt=`Square premium original music single cover. ${scene}\nMANDATORY TYPOGRAPHY: Render the main title exactly ${quoted(title)}, large, prominent and clearly legible. Render a separate smaller subtitle exactly ${quoted(subtitle)} beneath the title in carefully spaced lettering. Keep both text lines inside safe margins, with strong contrast, clear hierarchy and an intentional professional album-cover layout. Preserve every character of the quoted title and subtitle. These are the only two text strings to render; no extra lettering, logos or watermarks.`;
 return {title,subtitle,prompt};
}

function requestedDuration(request){
 const numbers={'一':1,'两':2,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
 const text=String(request||'').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)(?=\s+minutes?)/gi,word=>({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10})[word.toLowerCase()]).replace(/[一两二三四五六七八九十](?=分钟|分半|分左右|分的|minute)/g,c=>numbers[c]);
 const range=text.match(/(\d+(?:\.\d+)?)\s*(?:到|至|[-~—])\s*(\d+(?:\.\d+)?)\s*(?:分钟|minutes?)/i);
 if(range)return (Number(range[1])+Number(range[2]))*30;
 const matches=[...text.matchAll(/(\d+(?:\.\d+)?)\s*(分钟|分半|分(?=\d|左右|的)|minutes?|mins?)(?:\s*(\d+)\s*秒)?/gi)];
 const values=[...new Set(matches.map(m=>Number(m[1])*60+(m[2]==='分半'?30:Number(m[3]||0))))];
 if(values.length===1)return values[0];
 const seconds=text.match(/(?:时长|大约|约|length|duration)\s*(\d+)\s*(?:秒|seconds?)/i);return seconds?Number(seconds[1]):null;
}
export function durationSpec(song,request=''){
 const bpm=Number(song.bpm)||Number(String(song.style||'').match(/(\d{2,3})\s*BPM/i)?.[1])||90;
 const lines=String(song.lyrics||'').split(/\r?\n/).filter(line=>line.trim()&&!/^\s*\[/.test(line)).length;
 const requested=requestedDuration(request),explicit=song.durationSeconds??song.seconds;
 const target=Number(requested??explicit??Math.max(90,Math.min(360,Math.round(((lines*2+8)*4*60/bpm)/5)*5)));
 if(!Number.isFinite(target)||target<30||target>600)throw Error('歌曲目标时长须为30至600秒 / Song duration must be 30–600 seconds');
 const bars=Math.max(8,Math.round(target*bpm/240)),limit=Math.min(900,Math.ceil(target*1.15+15));
 return {targetSeconds:target,generationSeconds:limit,bpm,estimatedBars:bars,source:requested?'user':explicit!==undefined?'model':'lyrics',style:`${song.style}. Original full song arrangement, target approximately ${Math.round(target)} seconds, ${bpm} BPM, about ${bars} bars in 4/4. Match verses, choruses, bridge and instrumental spaces to the intended length. Complete the final chorus and a natural resolved outro; do not truncate the ending.`};
}

export function musicGraph(modules,moduleId,song,prefix){
 const plan=song.durationPlan,graph=modules.graph(moduleId,{lyrics:song.lyrics,style:plan?.style||song.style,seed:song.seed,seconds:plan?.generationSeconds||song.seconds,steps:song.steps,abc:song.abc||'',prefix});
 return graph;
}
