export const faces = [
  ['Trước',[0,0,1],[1,0,0],[0,1,0]],
  ['Phải',[1,0,0],[0,0,-1],[0,1,0]],
  ['Sau',[0,0,-1],[-1,0,0],[0,1,0]],
  ['Trái',[-1,0,0],[0,0,1],[0,1,0]],
  ['Trên',[0,1,0],[1,0,0],[0,0,-1]],
  ['Dưới',[0,-1,0],[1,0,0],[0,0,1]],
];
export const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const scale = (a,k) => a.map(v=>v*k);
const cross = ([x,y,z],[a,b,c]) => [y*c-z*b,z*a-x*c,x*b-y*a];
const position = (n,u,v,x,y) => n.map((value,i)=>2.5*value+x*u[i]+y*v[i]);
export const tiles = faces.flatMap(([,n,u,v],face)=>Array.from({length:25},(_,i)=>({
  face,n,u,v,p:position(n,u,v,i%5-2,2-Math.floor(i/5))
})));
const index = new Map(tiles.map(({p},i)=>[p.join(','),i]));
export const layers = [
  ...faces.map(([name],face)=>({name:'Mặt '+name.toLowerCase(),face,depth:2})),
  ...[0,1,4].flatMap(face=>[-1,0,1].map(depth=>({
    name:'Lớp trong · '+faces[face][0]+' · '+(depth===0?'giữa':depth===1?'gần':'xa'),
    face,depth
  })))
];
export function inLayer(tile,{face,depth}){
  const coordinate=dot(tile.p,faces[face][1]);
  return depth===2?coordinate>=2:coordinate===depth;
}

// A screen-facing tile provides the local row and column axes.
export function hoveredTurn(tile,horizontal,forward){
  const axis=horizontal?tile.v:tile.u;
  const coordinate=dot(tile.p,axis);
  const layer=layers.findIndex(({face,depth})=>{
    const alignment=dot(axis,faces[face][1]);
    return Math.abs(alignment)===1 && coordinate*alignment===depth;
  });
  const alignment=dot(axis,faces[layers[layer].face][1]);
  return {layer,direction:(forward?1:-1)*alignment};
}

export function turn(board,layer,direction) {
  const axis=faces[layer.face][1], next=board.slice();
  tiles.forEach((tile,i)=>{
    if (!inLayer(tile,layer)) return;
    const perpendicular=cross(axis,tile.p);
    const rotated=axis.map((v,k)=>v*dot(axis,tile.p)+direction*perpendicular[k]);
    next[index.get(rotated.join(','))]=board[i];
  });
  return next;
}

const lines=new Map();
const same = (a,b) => a.every((value,i)=>value===b[i]);

function step(tile,direction){
  const next=tile.p.map((value,i)=>value+direction[i]);
  const exits=[tile.u,tile.v]
    .map(axis=>[axis,dot(next,axis)])
    .filter(([,offset])=>Math.abs(offset)>2);
  if(exits.length===0) return [index.get(next.join(',')),direction];
  if(exits.length===2) return null;
  const [axis,offset]=exits[0];
  const out=scale(axis,Math.sign(offset));
  const folded=next.map((value,i)=>value-.5*(out[i]+tile.n[i]));
  const continued=direction.map((value,i)=>value-out[i]-tile.n[i]);
  return [index.get(folded.join(',')),continued];
}

tiles.forEach((tile,start)=>{
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    let direction=tile.u.map((value,i)=>dx*value+dy*tile.v[i]);
    const line=[start];
    for(let i=1;i<5;i++){
      const current=tiles[line.at(-1)];
      const next=step(current,direction);
      if(!next) break;
      const [destination,continued]=next;
      if((dx===0||dy===0) && !same(current.n,tiles[destination].n)
        && line.some(k=>!same(tiles[k].n,current.n))) break;
      line.push(destination);
      direction=continued;
    }
    if(line.length===5) lines.set(line.slice().sort((a,b)=>a-b).join(','),line);
  }
});

export function winners(board) {
  const result={X:new Set(),O:new Set()};
  for(const line of lines.values()) {
    const player=board[line[0]];
    if(player && line.every(i=>board[i]===player)) line.forEach(i=>result[player].add(i));
  }
  return result;
}
