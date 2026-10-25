export const RADIO_CATEGORIES=[
 {id:'language',name:'语种',en:'Language',tags:['华语','欧美','日语','韩语','粤语']},
 {id:'style',name:'风格',en:'Style',tags:['流行','摇滚','民谣','电子','轻音乐','舞曲','说唱','爵士','乡村','R&B/Soul','古典','民族','英伦','金属','朋克','蓝调','雷鬼','世界音乐','拉丁','New Age','古风','后摇','Bossa Nova']},
 {id:'scene',name:'场景',en:'Scene',tags:['清晨','夜晚','学习','工作','午休','下午茶','地铁','驾车','运动','旅行','散步','酒吧']},
 {id:'mood',name:'情感',en:'Mood',tags:['怀旧','清新','浪漫','伤感','治愈','放松','孤独','感动','兴奋','快乐','安静','思念']},
 {id:'theme',name:'主题',en:'Theme',tags:['综艺','影视原声','ACG','儿童','校园','游戏','70后','80后','90后','网络歌曲','KTV','经典','翻唱','吉他','钢琴','器乐','榜单','00后']},
];
export const RADIO_TAGS=new Set(RADIO_CATEGORIES.flatMap(c=>c.tags));
