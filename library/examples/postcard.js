// Original vector artwork for an insertion and retrieval study. All geometry is shared by both editions.
(() => {
  const collage = C.TL.example.kind === 'postcard-collage';
  const colors = collage ? {
    table: '#284942', grid: '#416359', card: '#f6dfb5', edge: '#e5b977', flower: '#b73027',
    stem: '#315c47', center: '#eea934', back: '#9d593a', front: '#d99762', flap: '#c18452',
    fold: '#925933', stamp: '#eee0b8', ink: '#5d5544', skin: '#cc8a69', light: '#e5ad87',
    sleeve: '#29354a', receiver: '#a3422e'
  } : {
    table: '#f3e2ba', grid: '#d3be94', card: '#fff2cd', edge: '#2d505c', flower: '#d43146',
    stem: '#193d50', center: '#e66b39', back: '#bd4c36', front: '#f18048', flap: '#dd683d',
    fold: '#a74539', stamp: '#fae0a9', ink: '#305e67', skin: '#52aaa2', light: '#86c5ad',
    sleeve: '#244959', receiver: '#af3946'
  };
  const svgNS = 'http://www.w3.org/2000/svg';
  function svg(parent, tag, attrs = {}) {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    parent.appendChild(element);
    return element;
  }
  function shape(parent, d, fill, stroke = 'none', width = 1) {
    return svg(parent, 'path', {d, fill, stroke, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'});
  }
  function flat(parent, d, color) {
    shape(parent, d, color);
    shape(parent, d, 'url(#surface)');
  }
  function bloom(parent, scale, x, y) {
    const group = svg(parent, 'g', {transform: 'translate(' + x + ' ' + y + ') scale(' + scale + ')'});
    shape(group, 'M1 9 C5 25 -8 40 -2 58 M-3 47 Q-21 45 -24 30 Q-8 30 -3 47 M1 33 Q8 15 22 15 Q19 31 1 33', colors.stem, colors.stem, 2);
    for (let i = 0; i < 7; i++) {
      const petal = shape(group, 'M0 1 C-13 -6 -15 -24 -6 -32 Q2 -37 7 -30 C14 -20 11 -5 0 1', colors.flower);
      petal.setAttribute('transform', 'rotate(' + i * 360 / 7 + ')');
    }
    svg(group, 'circle', {r: 8.7, fill: colors.center});
    for (const [cx, cy] of [[-3,-3],[3,-2],[0,3]]) svg(group, 'circle', {cx,cy,r:1.4,fill:colors.ink});
  }
  function makeTexture(defs) {
    const pattern = svg(defs, 'pattern', {id:'surface',width:48,height:48,patternUnits:'userSpaceOnUse'});
    const random = C.mulberry32(974);
    if (collage) {
      for (let i = 0; i < 90; i++) {
        const x = random()*48, y = random()*48;
        svg(pattern,'path',{d:'M'+x+' '+y+'l'+(random()*2+.3)+' '+(random()-.5),
          stroke:i%3?'#ffebc7':'#302e27','stroke-width':.7,opacity:.33});
      }
    } else {
      for (let y=0; y<48; y+=4) for (let x=0; x<48; x+=4)
        svg(pattern,'circle',{cx:x+(y%8?2:0),cy:y,r:.82,fill:'#263c4c',opacity:.21});
    }
  }
  function card(parent) {
    const group = svg(parent,'g');
    const outline = 'M-131 1 L76 -2 L80 201 L-129 205 Z';
    shape(group,outline,colors.edge,colors.edge,3).setAttribute('transform','translate(-2 3)');
    flat(group,outline,colors.card);
    shape(group,'M-117 14 L64 12 L66 186 L-116 190 Z','none',colors.ink,1.2);
    bloom(group,1.28,-25,91);
    shape(group,'M-48 176 L-12 176 M-7 176 L-3 176','none',colors.ink,1.6);
    return group;
  }
  function hand(parent) {
    const group = svg(parent,'g');
    // Pinch point is the local origin. The sleeve extends past the right edge of the stage.
    flat(group,'M42 -30 Q57 -41 82 -44 L151 -64 L174 -24 L92 0 Q73 13 55 14 L21 14 Q11 14 12 7 Q13 1 26 -2 L43 -9 L9 0 Q-2 2 -4 -3 Q-5 -8 4 -14 Z',colors.skin);
    const sleevePath='M88 -48 L156 -76 L565 -164 L571 -11 L122 -3 Z';
    const sleeve=shape(group,sleevePath,colors.sleeve);
    shape(group,sleevePath,'url(#surface)');
    const cuff=shape(group,'M82 -47 L111 -58 L135 -4 L103 6 Z',colors.receiver);
    shape(group,'M2 -12 Q19 -23 39 -29 Q49 -30 54 -22 Q58 -15 48 -10 L13 2 Q3 5 -2 0 Q-7 -5 2 -12Z',colors.light,colors.skin,1.3);
    shape(group,'M0 -7 Q5 -13 12 -13 L15 -8 Q8 -4 2 -3 Z',colors.card);
    const stitching=shape(group,'M103 -45 l17 39 M114 -50 l18 40','none',colors.card,2.4);
    return {group,cuff,sleeve,stitching};
  }
  function build(root,S) {
    root.style.background = colors.table;
    const tall = C.H>C.W;
    const art = svg(root,'svg',{width:'100%',height:'100%',viewBox:tall?'-270 -380 540 800':'-485 -310 970 610',
      'aria-label':'Flower postcard and open envelope'});
    const defs=svg(art,'defs');
    makeTexture(defs);
    const paper=svg(art,'g');
    flat(paper,'M-800 -780 H800 V730 H-800 Z',colors.table);
    const edge=tall?-232:-413;
    shape(paper,'M'+edge+' -385 v790 M'+(edge+4)+' -385 v790','none',colors.grid,1);
    const stage=svg(art,'g');
    S.stage=stage;
    S.art=art;
    const envelope='M-196 39 L-12 -91 Q0 -98 12 -89 L194 39 L189 258 L-194 254 Z';
    shape(stage,envelope,collage?'#182f2a':'#c0a989').setAttribute('transform','translate(3 8)');
    flat(stage,envelope,colors.back);
    flat(stage,'M-196 39 L-12 -91 Q0 -98 12 -89 L194 39 L0 170 Z',colors.flap);
    shape(stage,'M-183 37 L-8 -80 Q0 -85 8 -80 L182 37','none',colors.fold,2);
    // Clip the bottom of the pocket even when the card is completely seated.
    const pocket=svg(defs,'clipPath',{id:'pocket'});
    shape(pocket,'M-800 -800 H800 V251 H-800 Z','black');
    S.card=card(svg(stage,'g',{'clip-path':'url(#pocket)'}));
    flat(stage,'M-196 39 L-12 123 Q0 130 12 123 L194 39 L189 258 L-194 254 Z',colors.front);
    shape(stage,'M-192 251 L-58 139 M190 254 L61 138','none',colors.fold,2);
    const stamp=svg(stage,'g',{transform:'translate(116 143) rotate(5)'});
    const stampShape=svg(stamp,'rect',{x:-26,y:-31,width:52,height:63,fill:colors.stamp,stroke:colors.stamp,'stroke-width':5,'stroke-dasharray':'3 4'});
    stampShape.setAttribute('rx',1);
    bloom(stamp,.43,0,-5);
    for(const y of [152,159,166]) shape(stage,'M65 '+y+' q12 -8 24 -3 t24 -3','none',colors.ink,1.5);
    shape(stage,'M-126 178 l95 3 M-127 187 l67 1 M-125 197 l58 2','none',colors.fold,2);
    S.hand=hand(stage);
  }
  function ramp(t,a,b) {
    const u=Math.max(0,Math.min(1,(t-a)/(b-a)));
    return u*u*(3-2*u);
  }
  function run(t,b,S) {
    const received=t>=3.3;
    const inside=ramp(t,.65,2.35)-ramp(t,4.0,5.8);
    const cardY=-206+260*inside;
    const drift=(1-inside)*(received?17:-10);
    const angle=(1-inside)*(received?7:-6);
    S.card.setAttribute('transform','translate('+drift+' '+cardY+') rotate('+angle+' 65 8)');
    // First hand releases the card. After the match cut the other sleeve enters and pinches it.
    const reach=received ? 1-ramp(t,3.3,4.0) : ramp(t,2.35,3.15);
    S.hand.group.setAttribute('transform','translate('+(69+drift+reach*500)+' '+(cardY+10-reach*90)+')');
    S.hand.sleeve.setAttribute('fill',received?colors.receiver:colors.sleeve);
    S.hand.cuff.setAttribute('fill',received?colors.flower:colors.stem);
    S.hand.stitching.setAttribute('visibility',received?'visible':'hidden');
    S.stage.setAttribute('transform',received?'translate(-7 3) rotate(3)':'rotate(-2)');
  }
  function after(t,b,S) {
    // Chromium can otherwise reuse an SVG raster from another seek.
    S.art.style.display='none';
    S.art.getBoundingClientRect();
    S.art.style.display='';
  }
  C.scene({name:'postcard',from:0,to:'done',build,run,after});
  C.start();
})();
