export type Rect = { id: string; width: number; height: number };
export type Placement = Rect & { x: number; y: number; rotated: boolean };
type FreeRect = { x:number; y:number; width:number; height:number };

/** Best-short-side-fit MaxRects. Dimensions are millimetres; output stays inside the safe area. */
export function packTabloid(items: Rect[], pageWidth=279.4, pageHeight=431.8, margin=5): { placements: Placement[]; overflow: Rect[] } {
  const bin={width:pageWidth-2*margin,height:pageHeight-2*margin};
  let free:FreeRect[]=[{x:0,y:0,...bin}]; const placements:Placement[]=[], overflow:Rect[]=[];
  const ordered=[...items].sort((a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height));
  for(const item of ordered){
    let best:{rect:FreeRect;w:number;h:number;rot:boolean;short:number;long:number}|undefined;
    for(const r of free) for(const [w,h,rot] of [[item.width,item.height,false],[item.height,item.width,true]] as const){
      if(w<=r.width&&h<=r.height){const dw=r.width-w,dh=r.height-h,short=Math.min(dw,dh),long=Math.max(dw,dh);if(!best||short<best.short||(short===best.short&&long<best.long)) best={rect:r,w,h,rot,short,long};}
    }
    if(!best){overflow.push(item);continue;}
    const {rect:r,w,h,rot}=best; placements.push({id:item.id,width:w,height:h,x:r.x+margin,y:r.y+margin,rotated:rot});
    const next:FreeRect[]=[];
    for(const f of free){if(r.x>=f.x+f.width||r.x+w<=f.x||r.y>=f.y+f.height||r.y+h<=f.y){next.push(f);continue;}
      if(r.x>f.x)next.push({x:f.x,y:f.y,width:r.x-f.x,height:f.height});
      if(r.x+w<f.x+f.width)next.push({x:r.x+w,y:f.y,width:f.x+f.width-(r.x+w),height:f.height});
      if(r.y>f.y)next.push({x:f.x,y:f.y,width:f.width,height:r.y-f.y});
      if(r.y+h<f.y+f.height)next.push({x:f.x,y:r.y+h,width:f.width,height:f.y+f.height-(r.y+h)});
    }
    free=next.filter((a,i)=>!next.some((b,j)=>i!==j&&a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height));
  }
  return {placements,overflow};
}

export type WorkOrder={minutes:number; due:Date};
/** Returns earliest date with enough remaining daily capacity, honoring blocked local dates. */
export function estimateReadyDate(newMinutes:number, active:WorkOrder[], dailyWorkHours:number, blockedDates:string[]=[], start=new Date()):Date {
  if(newMinutes<0||dailyWorkHours<=0)throw new Error('Invalid production capacity');
  const cap=dailyWorkHours*60, backlog=active.reduce((s,o)=>s+Math.max(0,o.minutes),0)+newMinutes;
  let day=new Date(start); day.setHours(0,0,0,0); let remaining=backlog;
  while(remaining>0){const key=day.toISOString().slice(0,10); if(!blockedDates.includes(key)) remaining-=cap; if(remaining>0)day.setDate(day.getDate()+1);}
  return day;
}
