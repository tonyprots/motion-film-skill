// One running WebGL picture in a resizable player. All geometry belongs to this example.
import {layer, THREE as T} from './lib/gl.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

C.stage.style.background = '#192b2c';
const player = C.el('div', {style: 'position:absolute;inset:0;overflow:hidden;transform-origin:center;background:radial-gradient(ellipse at 28% 22%,#fff1d8,#d5bb97 70%,#bca681)'}, C.stage);
const progress = C.el('div', {style: 'position:absolute;z-index:1;bottom:4%;height:5px;left:8%;width:84%;background:#68584655'}, player);
const playhead = C.el('div', {style: 'height:100%;width:100%;transform-origin:left;background:#9c4828'}, progress);
const studio = await layer(player, {fov:32, msaa:2, envIntensity:1.05});
const material = (color, metalness, roughness) => studio.physical({color, metalness, roughness});
const steel = material('#dedbd0', 1, .20);
const ink = material('#1b3535', .55, .31);
const paper = new T.MeshStandardMaterial({color:'#f2dda8',roughness:.82});
const dialInk = new T.MeshStandardMaterial({color:'#1a302f',roughness:.74});
const brass = material('#c79c57', .84, .28);
const orange = material('#da622d', .13, .42);
const leather = material('#244348', .04, .70);
const glass = material('#204349', .69, .10);

function mesh(parent, geometry, finish, x=0, y=0, z=0) {
  const object = new T.Mesh(geometry, finish);
  object.position.set(x,y,z);
  parent.add(object);
  return object;
}
function group(parent) {
  const node = new T.Group();
  parent.add(node);
  return node;
}
function disk(parent, radius, depth, finish, z) {
  const cylinder = new T.CylinderGeometry(radius, radius, depth, 64);
  cylinder.rotateX(Math.PI/2);
  return mesh(parent, cylinder, finish, 0, 0, z);
}
function ring(parent, radius, tube, finish, z) {
  return mesh(parent, new T.TorusGeometry(radius,tube,12,72), finish,0,0,z);
}
function box(parent,w,h,d,finish,x,y,z,radius=0) {
  const geometry = radius ? new RoundedBoxGeometry(w,h,d,3,radius) : new T.BoxGeometry(w,h,d);
  return mesh(parent,geometry,finish,x,y,z);
}

const lamp = new T.DirectionalLight(0xfff3dc,2.5);
lamp.position.set(-4,6,7);
studio.scene.add(lamp,new T.HemisphereLight(0xfff4df,0x75847c,1.6));

function makeWatch(parent) {
  const watch = group(parent);
  for (const side of [-1,1]) {
    const profile = new T.Shape();
    profile.moveTo(-.34,.63);
    profile.quadraticCurveTo(-.39,1.24,-.29,1.65);
    profile.quadraticCurveTo(-.26,1.83,0,1.84);
    profile.quadraticCurveTo(.26,1.83,.29,1.65);
    profile.quadraticCurveTo(.39,1.24,.34,.63);
    profile.closePath();
    const band = mesh(watch, new T.ExtrudeGeometry(profile,{
      depth:.07,bevelSegments:3,bevelSize:.026,bevelThickness:.035
    }), orange,0,0,-.14);
    if (side < 0) band.rotation.z = Math.PI;
    for (let i=0;i<8;i++) box(watch,.55-.012*i,.014,.014,orange,0,side*(.95+i*.08),-.023);
  }
  disk(watch,.93,.20,steel,-.07);
  disk(watch,.90,.09,ink,.05);
  ring(watch,.86,.047,orange,.12);
  disk(watch,.81,.035,paper,.12);
  for (let i=0;i<60;i++) {
    const angle=i*Math.PI/30, major=i%5===0, radius=major?.70:.752;
    const tick=box(watch,major?.030:.011,major?.121:.043,.010,dialInk,
      Math.sin(angle)*radius,Math.cos(angle)*radius,.148);
    tick.rotation.z=-angle;
  }
  function hand(length,width,finish,angle,z) {
    const pivot=group(watch);
    pivot.rotation.z=angle;
    box(pivot,width,length,.014,finish,0,length*.43,z);
    return pivot;
  }
  hand(.40,.055,dialInk,.98,.17);
  hand(.60,.030,dialInk,-.92,.19);
  const second=hand(.66,.017,orange,0,.213);
  disk(watch,.045,.025,brass,.23);
  const crown = mesh(watch,new T.CylinderGeometry(.096,.096,.14,28),brass,.96,.02,-.035);
  crown.rotation.z=Math.PI/2;
  return {watch,second};
}

function makeCamera(parent) {
  const camera=group(parent);
  // The off-centre camera body leaves the circular lens on the former dial's axis.
  box(camera,2.68,1.64,.67,leather,-.17,-.05,-.36,.11);
  box(camera,2.69,.35,.69,steel,-.17,.65,-.36,.06);
  box(camera,2.55,.09,.63,steel,-.17,-.84,-.36,.03);
  box(camera,.54,.39,.12,ink,.68,.58,.018,.046);
  box(camera,.42,.26,.13,glass,.68,.58,.045,.027);
  box(camera,.52,.27,.09,paper,-1.03,.55,.041,.035);
  for(let i=0;i<6;i++) box(camera,.016,.20,.018,steel,-1.22+i*.076,.55,.088);
  box(camera,.44,.11,.29,orange,-.89,.86,-.29,.04);
  box(camera,.44,1.09,.13,ink,-1.12,-.14,.028,.05);
  for(let i=0;i<8;i++) box(camera,.019,.91,.025,leather,-1.28+i*.044,-.14,.092);
  const focus=group(camera);
  disk(focus,.80,.30,ink,.13);
  ring(focus,.72,.054,orange,.28);
  disk(focus,.65,.11,steel,.29);
  const optics=group(focus);
  disk(optics,.54,.16,ink,.40);
  disk(optics,.44,.035,glass,.50);
  ring(optics,.45,.022,brass,.52);
  const lens=mesh(optics,new T.SphereGeometry(.32,48,24),glass,0,0,.52);
  lens.scale.z=.29;
  return {camera,focus,optics};
}

const {watch,second}=makeWatch(studio.scene);
const {camera,focus,optics}=makeCamera(studio.scene);
// Rotate each object about its coloured ring, whose plane sits at a different depth in each model.
const watchAxis=new T.Vector3(0,0,.12);
const lensAxis=new T.Vector3(0,0,.28);
const axisOffset=new T.Vector3();
function centreRing(product, localAxis, travel) {
  axisOffset.copy(localAxis).applyQuaternion(product.quaternion);
  product.position.set(travel,0,0).sub(axisOffset);
}
const turn=C.bt('turn'), replay=C.bt('replay');
const ease=(t,a,b) => {
  const u=Math.max(0,Math.min(1,(t-a)/(b-a)));
  return u*u*(3-2*u);
};
studio.frame(time => {
  const reprise=time>=replay;
  // The reprise plays the first second again; enlarging the thumbnail never resets this clock.
  const t=reprise ? time-replay : time;
  const isCamera=t>=turn;
  camera.visible=isCamera;
  watch.visible=!isCamera;
  const opening=ease(t,.56,1.40);
  const size=reprise ? .62 : .56+.44*opening;
  const viewportY=reprise ? -.13*C.H : .08*C.H*(1-opening);
  // Keep the WebGL canvas at output resolution so reversing an enlargement never resamples a cached raster.
  const insetX=Math.round(C.W*(1-size)/2);
  const insetY=Math.round(C.H*(1-size)/2);
  const shiftY=Math.round(viewportY);
  player.style.clipPath='inset('+(insetY+shiftY)+'px '+insetX+'px '+(insetY-shiftY)+'px '+insetX+'px round '+Math.round((1-size)*70)+'px)';
  const trackWidth=Math.round((C.W-2*insetX)*.84);
  progress.style.left=(insetX+Math.round((C.W-2*insetX)*.08))+'px';
  progress.style.bottom=(insetY-shiftY+Math.round((C.H-2*insetY)*.04))+'px';
  progress.style.width=trackWidth+'px';
  progress.style.opacity=String(reprise ? 1 : 1-opening);
  playhead.style.width=Math.round(trackWidth*Math.min(1,(t+.2)/5.4))+'px';

  studio.camera.position.z=C.H>C.W ? 12 : 8.6;
  studio.camera.zoom=size;
  studio.camera.setViewOffset(C.W,C.H,0,-shiftY,C.W,C.H);
  const enterSpin=ease(t,turn-.39,turn+.39);
  // Both silhouettes keep turning in the same direction. A half-turn swaps the front faces.
  const angle=-.24+.48*ease(t,0,1.8)+Math.PI*enterSpin;
  watch.rotation.set(-.09,angle,-.14);
  second.rotation.z=-2.10-t*1.5;
  const reveal=ease(t,turn+.42,turn+1.33);
  camera.rotation.set(-.09-.15*reveal,angle-Math.PI+.34*reveal,-.14+.12*reveal);
  const travel=.08*Math.sin(Math.PI*enterSpin);
  const refocus=reveal-ease(t,turn+1.70,replay-.16);
  focus.position.z=.15*refocus;
  optics.position.z=.32*refocus;
  centreRing(watch,watchAxis,travel);
  lensAxis.z=.28+focus.position.z;
  centreRing(camera,lensAxis,travel);
});
C.glDone();
