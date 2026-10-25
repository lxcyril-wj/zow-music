const paths={
 play:'M8 5v14l11-7Z',pause:'M8 5v14M16 5v14',previous:'M6 5v14M19 5 8 12l11 7Z',next:'M18 5v14M5 5l11 7L5 19Z',
 shuffle:'M3 6h3l12 12h3M17 14l4 4-4 4M3 18h3l4-4M14 10l4-4h3M17 2l4 4-4 4',
 repeat:'M4 8h15l-3-3m3 3-3 3M20 16H5l3 3m-3-3 3-3',
 repeatOne:'M4 8h15l-3-3m3 3-3 3M20 16H5l3 3m-3-3 3-3M11 10h1v4',
 heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
 volume:'M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',muted:'M11 5 6 9H3v6h3l5 4ZM16 9l5 6m0-6-5 6',
 settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
 info:'M12 8h.01M11 11h1v6m0-14a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
 sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
 moon:'M20 15.2A8.7 8.7 0 0 1 8.8 4 9 9 0 1 0 20 15.2',
 palette:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.4 1.4 0 0 1 1-2.4H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3ZM7 10h.01M10 6.5h.01M15 7h.01M17.5 11h.01',
};
export function setIcon(button,name,{label,pressed,filled=false}={}){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill',filled||name==='play'?'currentColor':'none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');p.setAttribute('d',paths[name]);svg.append(p);button.replaceChildren(svg);button.classList.add('control-icon');if(label){button.title=label;button.setAttribute('aria-label',label);}if(pressed!==undefined)button.setAttribute('aria-pressed',String(pressed));
}
