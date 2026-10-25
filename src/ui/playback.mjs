export class PlaybackOrder {
 constructor(settings={},random=Math.random){this.shuffle=!!settings.shuffle;this.repeat=['off','all','one'].includes(settings.repeat)?settings.repeat:'off';this.random=random;this.base=[];this.order=[];this.current=null;}
 randomized(ids){const result=[...ids];for(let i=result.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
 start(id,ids){this.base=[...new Set(ids)];this.current=id;this.order=this.shuffle?[id,...this.randomized(this.base.filter(x=>x!==id))]:[...this.base];}
 setShuffle(value){this.shuffle=!!value;if(this.current)this.start(this.current,this.base);}
 cycleRepeat(){const modes=['off','all','one'];this.repeat=modes[(modes.indexOf(this.repeat)+1)%3];return this.repeat;}
 next(delta=1,{ended=false}={}){
  if(!this.order.length)return null;
  if(ended&&this.repeat==='one')return this.current;
  const current=this.order.indexOf(this.current),next=current+delta;
  if(next<0||next>=this.order.length){if(this.repeat!=='all'&&ended)return null;if(this.repeat!=='all'&&!ended)return null;const id=this.order[(next+this.order.length)%this.order.length];this.current=id;return id;}
  this.current=this.order[next];return this.current;
 }
 prune(ids){const available=new Set(ids);this.base=this.base.filter(id=>available.has(id));this.order=this.order.filter(id=>available.has(id));if(!available.has(this.current))this.current=null;}
 settings(){return {shuffle:this.shuffle,repeat:this.repeat};}
}
