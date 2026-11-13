import * as THREE from 'three';
import './style.css';
import {faces,tiles,layers,inLayer,hoveredTurn,turn,winners} from './rules.mjs';

const $=id=>document.getElementById(id);
const stage=$('stage');
const defaultView=new THREE.Vector3(9,7,10).normalize();
const eye=defaultView.clone(), targetEye=eye.clone();
const camera=new THREE.PerspectiveCamera(35,1,.1,80);
const scene=new THREE.Scene();
let renderer;
try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
} catch {
  renderer=canvasRenderer();
}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
stage.append(renderer.domElement);
const cube=new THREE.Group();
scene.add(cube);
const body=new THREE.Mesh(new THREE.BoxGeometry(4.95,4.95,4.95),new THREE.MeshBasicMaterial({color:0x101010}));
cube.add(body);
function roundedSquare(halfSize,radius){
  const center=halfSize-radius;
  return [[center,center],[-center,center],[-center,-center],[center,-center]]
    .flatMap(([x,y],corner)=>Array.from({length:7},(_,step)=>{
      const angle=(corner+step/6)*Math.PI/2;
      return [x+radius*Math.cos(angle),y+radius*Math.sin(angle)];
    }));
}
const stickerCorners=roundedSquare(.445,.085);
const backingCorners=roundedSquare(.499,.105);
const borderCorners=roundedSquare(.408,.07);
function faceGeometry(points,z){
  const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));
  return new THREE.ShapeGeometry(shape).translate(0,0,z);
}
const tileGeometry=faceGeometry(stickerCorners,.036);
const backingGeometry=faceGeometry(backingCorners,.009);
const backingMaterial=new THREE.MeshBasicMaterial({color:0x111111});
const glyphGeometry={
  X:new THREE.PlaneGeometry(.72,.72),
  O:new THREE.PlaneGeometry(.72,.72)
};
const colors={X:'#dafa76',O:'#82dbf3'};
function glyph(player){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.strokeStyle=colors[player];ctx.lineWidth=13;ctx.lineCap='round';
  ctx.beginPath();
  if(player==='X'){
    ctx.moveTo(34,34);ctx.lineTo(94,94);ctx.moveTo(94,34);ctx.lineTo(34,94);
  }else ctx.arc(64,64,36,0,Math.PI*2);
  ctx.strokeStyle='#181818';ctx.lineWidth=22;ctx.stroke();
  ctx.strokeStyle=colors[player];ctx.lineWidth=13;ctx.stroke();
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
}
const glyphs={X:glyph('X'),O:glyph('O')};
const palette=[0x1953b6,0xe9510e,0x24a65a,0xc72836,0xf1f0ed,0xf5ca28];
const layerTint=new THREE.Color(0xb9d16b);
const pieces=tiles.map(({p,n,u,v,face},i)=>{
  const item=new THREE.Group();
  const normal=new THREE.Vector3(...n);
  item.position.set(...p);
  item.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...u),new THREE.Vector3(...v),normal));
  const tile=new THREE.Mesh(tileGeometry,new THREE.MeshBasicMaterial({color:palette[face]}));

  const mark=new THREE.Mesh(glyphGeometry.X,glyphs.X);
  mark.position.z=.05;
  item.add(new THREE.Mesh(backingGeometry,backingMaterial),tile,mark);
  cube.add(item);
  return {item,tile,mark,position:item.position.clone(),orientation:item.quaternion.clone()};
});
const hoverBorder=new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(borderCorners.map(([x,y])=>new THREE.Vector3(x,y,.044))),
  new THREE.LineBasicMaterial({color:0xdce6ef,transparent:true,opacity:.42,depthWrite:false})
);
const hitGeometry=new THREE.BoxGeometry(.97,.97,.07);
const hitMaterial=new THREE.MeshBasicMaterial({visible:false});
const hitTargets=pieces.map(({item,tile})=>{
  const target=new THREE.Mesh(hitGeometry,hitMaterial);
  target.userData=tile.userData;
  item.add(target);
  return target;
});
const ray=new THREE.Raycaster();
const axis=new THREE.Vector3();
let board,player,preview,outcome,ply,hover,pointer,drag,angle=0,renderedLayer=null;
function reset(){
  board=Array(150).fill(null);player='X';
  preview=null;outcome=null;ply=1;hover=null;
  targetEye.copy(defaultView);
  $('layer').value='';
  update();
}

function resultFor(current) {
  const lines=winners(current);
  if(lines.X.size && lines.O.size) return {title:'Hòa · Hai đường thắng',lines};
  if(lines.X.size || lines.O.size) return {title:(lines.X.size?'X':'O')+' thắng!',lines};
  if(current.every(Boolean)) return {title:'Hòa · Bàn đã đầy',lines};
  return null;
}
function update(){
  $('step').textContent='LƯỢT '+String(ply).padStart(2,'0');
  $('status').textContent=outcome?.title??'Lượt của '+player;
  $('arenaStatus').textContent=outcome?.title??(preview?'Đang xem trước cú xoay · Esc để hủy':'Lượt '+player+' · Có thể xoay 1 lần');
  $('hint').textContent=outcome?'Bắt đầu ván mới để chơi lại.':preview
    ? 'Chọn ô trống trên khối đã xoay để dùng quyền xoay và kết thúc lượt.'
    : 'Chọn ô trống để đặt quân và kết thúc lượt.';
  $('twist').hidden=Boolean(outcome);
  $('ccw').disabled=$('cw').disabled=$('layer').value==='';
  $('ccw').setAttribute('aria-pressed',preview?.direction===1);
  $('cw').setAttribute('aria-pressed',preview?.direction===-1);
  $('cancelTwist').hidden=$('layer').value==='';
  $('previewNote').textContent=preview
    ? 'Đang xem trước · '+layers[preview.layer].name
    :'';
  for(const side of ['X','O']){
    $('stock'+side).textContent=outcome?'Ván đã kết thúc':side===player?'Có thể xoay 1 lần':'Đang chờ lượt';
    $('player'+side).classList.toggle('active',!outcome&&side===player);
  }
}
function clearPreview(){
  preview=null;$('layer').value='';
}
function place(index){
  if(outcome) return;
  const next=preview?turn(board,layers[preview.layer],preview.direction):board.slice();
  if(next[index]) return;
  next[index]=player;
  board=next;
  angle=0;renderedLayer=null;hover=null;
  clearPreview();
  outcome=resultFor(board);
  if(outcome){
    const winning=[...outcome.lines.X,...outcome.lines.O];
    if(winning.length){
      const sum=new THREE.Vector3();
      for(const i of winning) sum.add(new THREE.Vector3(...tiles[i].n));
      if(sum.lengthSq()) targetEye.copy(sum.normalize());
    }
  }else{
    player=player==='X'?'O':'X';ply++;
  }
  update();
}

function showFace(face){
  const [,n,u,v]=faces[face];
  targetEye.set(...n).addScaledVector(new THREE.Vector3(...u),.19)
    .addScaledVector(new THREE.Vector3(...v),.14).normalize();
}
faces.forEach(([name],face)=>{
  const button=document.createElement('button');button.textContent=name;
  button.addEventListener('click',()=>showFace(face));$('views').append(button);

});
layers.forEach(({name},i)=>$('layer').append(new Option(name,String(i))));
$('layer').onchange=()=>{
  preview=null;
  if($('layer').value!=='') showFace(layers[Number($('layer').value)].face);
  update();
};
function chooseTurn(direction){
  if(outcome || $('layer').value==='') return;
  const layer=Number($('layer').value);
  setPreview({layer,direction});
  update();
}
function setPreview(choice){
  // A reverse input cancels the pending quarter turn; repeats leave it in place.
  preview=preview?.layer===choice.layer && preview.direction===-choice.direction
    ? null
    : choice;
  $('layer').value=String(choice.layer);
  update();
}
$('ccw').onclick=()=>chooseTurn(1);
$('cw').onclick=()=>chooseTurn(-1);
$('cancelTwist').onclick=()=>{clearPreview();update();};
$('home').onclick=()=>targetEye.copy(defaultView);
$('help').onclick=()=>$('rules').showModal();
$('reset').onclick=()=>{if(ply===1&&!outcome) reset();else $('restart').showModal();};
$('restart').addEventListener('close',()=>{if($('restart').returnValue==='reset') reset();});

const twistKeys=new Map([
  ['arrowleft',[true,false]],['a',[true,false]],
  ['arrowright',[true,true]],['d',[true,true]],
  ['arrowup',[false,false]],['w',[false,false]],
  ['arrowdown',[false,true]],['s',[false,true]]
]);
document.addEventListener('keydown',event=>{
  if(outcome || drag || event.altKey || event.ctrlKey || event.metaKey
    || document.querySelector('dialog[open]') || event.target.closest?.('button, select, input, textarea')) return;
  if(event.key==='Escape' && preview){
    clearPreview();update();
    return;
  }
  const command=twistKeys.get(event.key.toLowerCase());
  if(!command || !pointer) return;
  const [horizontal,forward]=command;
  const active=preview?.keyboard && preview.horizontal===horizontal ? preview : null;
  const index=active?null:pick(pointer,!settled());
  if(!active && index===null) return;
  event.preventDefault();
  if(event.repeat) return;
  if(active){
    setPreview({...active,direction:forward===active.forward?active.direction:-active.direction,forward});
  }else{
    setPreview({...hoveredTurn(tiles[index],horizontal,forward),keyboard:true,horizontal,forward});
  }
});

function pick(event,original=false){
  const rect=stage.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(
    (event.clientX-rect.left)/rect.width*2-1,
    1-(event.clientY-rect.top)/rect.height*2
  ),camera);
  const hit=ray.intersectObjects(hitTargets,false)[0]?.object;
  return (original?hit?.userData.origin:hit?.userData.destination)??null;
}
stage.addEventListener('pointerdown',event=>{
  if(drag || event.button!==0) return;
  stage.focus({preventScroll:true});
  if(event.pointerType!=='touch') pointer={clientX:event.clientX,clientY:event.clientY};
  stage.setPointerCapture(event.pointerId);
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,
    startX:event.clientX,startY:event.clientY,
    tile:!outcome&&settled()?pick(event):null,live:!preview};
});
stage.addEventListener('pointermove',event=>{
  if(event.pointerType==='mouse' || event.pointerType==='pen') pointer={clientX:event.clientX,clientY:event.clientY};
  if(!drag) return;
  if(drag.id!==event.pointerId) return;
  const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  if(!drag.moved && Math.hypot(dx,dy)<8) return;
  if(!drag.moved && drag.tile!==null){
    const tile=tiles[drag.tile];
    const center=new THREE.Vector3(...tile.p);
    const origin=center.clone().project(camera);
    const {width,height}=stage.getBoundingClientRect();
    // Compare the gesture to the projected row and column on the touched face.
    const screenAxis=axis=>{
      const end=center.clone().add(new THREE.Vector3(...axis)).project(camera);
      return new THREE.Vector2((end.x-origin.x)*width,(origin.y-end.y)*height).normalize();
    };
    const row=screenAxis(tile.u),column=screenAxis(tile.v);
    const motion=new THREE.Vector2(dx,dy);
    const horizontal=Math.abs(motion.dot(row))>=Math.abs(motion.dot(column));
    drag.axis=horizontal?row:column;
    drag.sign=Math.sign(motion.dot(drag.axis));
    setPreview(hoveredTurn(tile,horizontal,horizontal?drag.sign>0:drag.sign<0));
  }
  if(drag.live && drag.axis && preview){
    const progress=(dx*drag.axis.x+dy*drag.axis.y)*drag.sign;
    drag.angle=preview.direction*Math.PI/2*THREE.MathUtils.clamp(progress/(stage.clientHeight*.14),0,1);
  }
  drag.moved=true;
  if(drag.tile===null){
    const orbit=new THREE.Spherical().setFromVector3(targetEye);
    orbit.theta-=(event.clientX-drag.x)*.009;
    orbit.phi=THREE.MathUtils.clamp(orbit.phi-(event.clientY-drag.y)*.009,.045,Math.PI-.045);
    targetEye.setFromSpherical(orbit);
    drag.x=event.clientX;drag.y=event.clientY;hover=null;
  }
});
stage.addEventListener('pointerup',event=>{
  if(drag?.id!==event.pointerId) return;
  if(!drag.moved && !outcome && settled()){
    const index=pick(event);
    if(index!==null) place(index);
  }
  drag=null;
});
stage.addEventListener('pointercancel',()=>{
  if(drag?.live && drag.axis){clearPreview();update();}
  drag=null;hover=null;
});
stage.addEventListener('pointerleave',()=>{pointer=null;hover=null;});

let cameraDistance;
function resize(){
  const {clientWidth:w,clientHeight:h}=stage;
  if(!w||!h) return;
  camera.aspect=w/h;camera.updateProjectionMatrix();
  // A turn preserves each sticker's distance from the cube center.
  const radius=Math.sqrt(3)*2.55;
  const verticalHalfFov=THREE.MathUtils.degToRad(camera.fov/2);
  const horizontalHalfFov=Math.atan(Math.tan(verticalHalfFov)*camera.aspect);
  cameraDistance=radius/Math.sin(Math.min(verticalHalfFov,horizontalHalfFov)*.94);
  renderer.setSize(w,h,false);
}
new ResizeObserver(resize).observe(stage);
reset();resize();
const rotation=new THREE.Quaternion();
function settled(){
  return preview
    ? renderedLayer===preview.layer && angle===preview.direction*Math.PI/2
    : angle===0;
}
const tileIndices=tiles.map((_,i)=>i);
const permutations=layers.map(layer=>Object.fromEntries([-1,1].map(direction=>{
  const origins=turn(tileIndices,layer,direction);
  const destinations=[];
  origins.forEach((origin,destination)=>destinations[origin]=destination);
  return [direction,destinations];
})));
const viewDirection=new THREE.Vector3();
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
let lastFrameTime;
function frame(time){
  const delta=Math.min((time-(lastFrameTime??time))/1000,.05);
  lastFrameTime=time;
  const reducedMotion=motionPreference.matches;
  const ease=reducedMotion?1:1-Math.exp(-delta*15);
  eye.lerp(targetEye,ease);
  if(eye.lengthSq()<.01) eye.copy(targetEye);
  viewDirection.copy(eye).normalize();
  camera.position.copy(viewDirection).multiplyScalar(cameraDistance);
  camera.lookAt(0,0,0);
  camera.updateMatrixWorld(true);
  hover=pointer&&!drag&&settled()?pick(pointer):null;
  const desiredLayer=preview?.layer??null;
  if(desiredLayer!==renderedLayer && angle===0) renderedLayer=desiredLayer;
  const desiredAngle=preview && desiredLayer===renderedLayer
    ? drag?.angle??preview.direction*Math.PI/2
    : 0;
  angle+=(desiredAngle-angle)*(reducedMotion?1:1-Math.exp(-delta*24));
  if(Math.abs(desiredAngle-angle)<.005) angle=desiredAngle;
  if(renderedLayer!==null) rotation.setFromAxisAngle(axis.set(...faces[layers[renderedLayer].face][1]),angle);
  const destinations=preview?permutations[preview.layer][preview.direction]:tileIndices;
  const lines=outcome?.lines;
  hoverBorder.removeFromParent();
  pieces.forEach(({item,tile,mark,position,orientation},i)=>{
    item.position.copy(position);item.quaternion.copy(orientation);
    if(renderedLayer!==null&&inLayer(tiles[i],layers[renderedLayer])){
      item.position.applyQuaternion(rotation);item.quaternion.premultiply(rotation);
    }
    tile.userData.origin=i;
    tile.userData.destination=destinations[i];
    const markPlayer=board[i];
    const won=lines&&(lines.X.has(i)||lines.O.has(i));
    const hovered=hover===destinations[i] && !outcome && !markPlayer;
    const selected=preview && inLayer(tiles[i],layers[preview.layer]);
    tile.material.color.set(won
      ? (markPlayer==='X'?0x536936:0x325c70)
      : palette[tiles[i].face]);
    if(selected) tile.material.color.lerp(layerTint,.13);
    if(hovered) item.add(hoverBorder);
    mark.visible=Boolean(markPlayer);
    if(markPlayer) mark.material=glyphs[markPlayer];
  });
  renderer.render(scene,camera);
}
renderer.setAnimationLoop(frame);

function canvasRenderer(){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  let width,height,pixelRatio;
  function project(point){
    point.project(camera);
    return [(point.x+1)*width/2,(1-point.y)*height/2];
  }
  function corners(item,points){
    return points.map(([x,y,z=.036])=>project(
      new THREE.Vector3(x,y,z).applyQuaternion(item.quaternion).add(item.position)
    ));
  }
  function path(points){
    ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  }
  const ring=Array.from({length:25},(_,i)=>{
    const t=i*Math.PI/12;
    return [.2*Math.cos(t),.2*Math.sin(t)];
  });
  return {
    domElement:canvas,
    setPixelRatio(value){pixelRatio=value;},
    setSize(w,h){
      width=w;height=h;canvas.width=w*pixelRatio;canvas.height=h*pixelRatio;
      ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    },
    setAnimationLoop(draw){
      function tick(time){draw(time);requestAnimationFrame(tick);}
      requestAnimationFrame(tick);
    },
    render(){
      ctx.clearRect(0,0,width,height);
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const visible=pieces.filter(({item})=>new THREE.Vector3(0,0,1)
        .applyQuaternion(item.quaternion).dot(camera.position.clone().sub(item.position))>0);
      visible.sort((a,b)=>camera.position.distanceToSquared(b.item.position)-camera.position.distanceToSquared(a.item.position));
      for(const {item,tile,mark} of visible){
        path(corners(item,backingCorners));ctx.closePath();
        ctx.fillStyle='#111111';ctx.fill();
        path(corners(item,stickerCorners));ctx.closePath();
        ctx.fillStyle='#'+tile.material.color.getHexString();ctx.fill();
        if(hoverBorder.parent===item){
          path(corners(item,borderCorners));ctx.closePath();
          ctx.strokeStyle='rgba(220,230,239,.42)';ctx.lineWidth=1;ctx.stroke();
        }
        if(!mark.visible) continue;
        const isX=mark.material===glyphs.X;
        ctx.lineCap='round';
        const strokeMark=points=>{
          path(corners(item,points));
          ctx.strokeStyle='#181818';ctx.lineWidth=Math.max(4,height*.014);ctx.stroke();
          ctx.strokeStyle=colors[isX?'X':'O'];ctx.lineWidth=Math.max(2,height*.009);ctx.stroke();
        };
        if(isX){
          strokeMark([[-.18,-.18],[.18,.18]]);
          strokeMark([[-.18,.18],[.18,-.18]]);
        }else{
          strokeMark(ring);
        }
      }
    }
  };
}
