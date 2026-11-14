export type PrintPiece={id:string;width:number;height:number;source:string;rotationAllowed:boolean};
export type PrintPlacement=PrintPiece&{x:number;y:number;rotated:boolean};
type Free={x:number;y:number;width:number;height:number};
/** MaxRects Best Short Side Fit. All input and output dimensions are millimetres. */
export function packTabloid(pieces:PrintPiece[],pageWidth=279.4,pageHeight=431.8,margin=5):{placements:PrintPlacement[];overflow:PrintPiece[]} {
  let free:Free[]=[{x:0,y:0,width:pageWidth-2*margin,height:pageHeight-2*margin}];const placements:PrintPlacement[]=[],overflow:PrintPiece[]=[];
  for(const piece of [...pieces].sort((a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height))){
    let choice:{f:Free;w:number;h:number;rotated:boolean;short:number;long:number}|undefined;
    for(const f of free){const orientations:[[number,number,boolean],[number,number,boolean]]=[[piece.width,piece.height,false],[piece.height,piece.width,true]];for(const [w,h,rotated] of orientations){if(rotated&&!piece.rotationAllowed)continue;if(w<=f.width&&h<=f.height){const dw=f.width-w,dh=f.height-h,short=Math.min(dw,dh),long=Math.max(dw,dh);if(!choice||short<choice.short||(short===choice.short&&long<choice.long))choice={f,w,h,rotated,short,long};}}}
    if(!choice){overflow.push(piece);continue;}const {f,w,h,rotated}=choice;placements.push({...piece,x:f.x+margin,y:f.y+margin,width:w,height:h,rotated});const next:Free[]=[];
    for(const r of free){if(f.x>=r.x+r.width||f.x+w<=r.x||f.y>=r.y+r.height||f.y+h<=r.y){next.push(r);continue;}if(f.x>r.x)next.push({x:r.x,y:r.y,width:f.x-r.x,height:r.height});if(f.x+w<r.x+r.width)next.push({x:f.x+w,y:r.y,width:r.x+r.width-f.x-w,height:r.height});if(f.y>r.y)next.push({x:r.x,y:r.y,width:r.width,height:f.y-r.y});if(f.y+h<r.y+r.height)next.push({x:r.x,y:f.y+h,width:r.width,height:r.y+r.height-f.y-h});}
    free=next.filter((a,i)=>!next.some((b,j)=>i!==j&&a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height));
  }return {placements,overflow};
}
