// Original SVG presenter rig, MIT. Baked Anidoodle hands: Apache-2.0, see actor-hands.js and upstream notices.
(() => {
  const poses={
    explain:{left:[76,345],right:[425,233],tilt:-3,brow:0},
    point:{left:[105,398],right:[405,88],tilt:-5,brow:-2},
    listen:{left:[115,398],right:[380,215],tilt:7,brow:1},
    shrug:{left:[40,241],right:[448,244],tilt:0,brow:-3},
    worry:{left:[110,399],right:[361,124],tilt:5,brow:4},
    welcome:{left:[55,185],right:[428,177],tilt:0,brow:-2},
    rest:{left:[120,440],right:[373,443],tilt:0,brow:0},
    hush:{left:[115,430],right:[194,248],tilt:6,brow:4},
    think:{left:[115,430],right:[325,315],tilt:-8,brow:2},
    chin:{left:[150,400],right:[268,292],tilt:-7,brow:2},
    scratch:{left:[115,430],right:[352,78],tilt:-7,brow:3},
    facepalm:{left:[115,430],right:[300,118],tilt:10,brow:4},
    cheer:{left:[62,70],right:[438,70],tilt:0,brow:-3},
    wave:{left:[115,430],right:[440,130],tilt:-3,brow:-1}
  };
  const clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,p)=>a+(b-a)*p;
  const gestures={rest:['relaxed','relaxed'],explain:['relaxed','open'],point:['relaxed','point'],listen:['relaxed','relaxed'],shrug:['open','open'],worry:['relaxed','relaxed'],welcome:['open','open'],hush:['relaxed','relaxed'],think:['relaxed','relaxed'],chin:['relaxed','relaxed'],scratch:['relaxed','relaxed'],facepalm:['relaxed','open'],cheer:['open','open'],wave:['relaxed','open']};
  const handAngles={hush:[-25,90],think:[-25,-65],chin:[-25,-35],scratch:[-25,-150],facepalm:[-25,-170],cheer:[25,-25],wave:[-25,15]};
  const expressions={rest:'neutral',explain:'neutral',point:'neutral',listen:'worried',shrug:'surprised',worry:'worried',welcome:'happy',hush:'surprised',think:'worried',chin:'neutral',scratch:'worried',facepalm:'grimace',cheer:'happy',wave:'happy'};
  // open: extra mouth opening; round: narrow «O» mouth; teeth: clenched teeth; wink: left eye closed. Missing keys mean 0.
  const emotions={neutral:{inner:0,outer:0,smile:0,eye:1,pupil:1},happy:{inner:-2,outer:-2,smile:1,eye:.72,pupil:1},worried:{inner:-9,outer:3,smile:-1,eye:.9,pupil:.9},surprised:{inner:-12,outer:-12,smile:0,eye:1.2,pupil:.75,open:20,round:.6},
    shocked:{inner:-17,outer:-17,smile:-.4,eye:1.3,pupil:.5,open:54,round:1},grimace:{inner:-7,outer:7,smile:-.2,eye:.75,pupil:.9,open:5,teeth:1},
    wink:{inner:-3,outer:-1,smile:1,eye:.85,pupil:1,wink:1},sad:{inner:-11,outer:7,smile:-1.5,eye:.85,pupil:.85}};
  const FACE_KEYS=['inner','outer','smile','eye','pupil','open','teeth','wink','round'];
  const NS='http://www.w3.org/2000/svg',INK='#202421',PAPER='#fffdf5';
  // Presenter pool: one rig, different looks. classic is the original presenter and stays the default.
  const cast={
    classic:{skin:'#ebc6ab',hair:INK,shine:'#7e8977',hairStyle:'crop',beard:'none',glasses:'square',outfit:'suit',top:'#67745f',sleeve:'#737c6d',trim:'#a3ae96',shade:'#324738',shirt:PAPER,accent:'#d8432e',lips:INK,iris:'none',face:'round',chain:false,lashes:false,earrings:false,height:1},
    casual:{skin:'#f1cfb8',hair:'#4b4038',shine:'#7d7064',hairStyle:'short',beard:'none',glasses:'none',outfit:'hoodie',top:'#2e3135',sleeve:'#3a3e43',trim:'#46494e',shade:'#000000',shirt:PAPER,accent:'#c9ccd1',lips:INK,iris:'#5b8fb8',face:'long',chain:false,lashes:false,earrings:false,height:1.04},
    woman:{skin:'#f0cdb4',hair:'#8a4b2a',shine:'#c27d4f',hairStyle:'long',beard:'none',glasses:'none',outfit:'blouse',top:'#c45a4a',sleeve:'#cf6b5b',trim:'#8f3a30',shade:'#6e2a22',shirt:PAPER,accent:'#f2c14e',lips:'#9c2f3a',iris:'#6b4a2e',face:'round',chain:false,lashes:true,earrings:true,height:.95}
  };
  const STYLES={hairStyle:['crop','short','long','bun','curls','bald'],beard:['none','stubble','goatee','full'],face:['round','long'],glasses:['none','square','round'],outfit:['suit','hoodie','tee','shirt','sweater','blouse']};
  const COLORS=['skin','hair','shine','top','sleeve','trim','shade','shirt','accent','lips'];
  function character(spec='classic'){
    const base=typeof spec==='string'?cast[spec]:cast[spec?.base??'classic'];
    if(!base||(typeof spec!=='string'&&(spec===null||typeof spec!=='object')))throw new Error('unknown actor character');
    const c={...base,...(typeof spec==='string'?{}:spec)};delete c.base;
    for(const k of Object.keys(c))if(!(k in cast.classic))throw new Error(`unknown actor character field ${k}`);
    for(const [k,list] of Object.entries(STYLES))if(!list.includes(c[k]))throw new Error(`invalid actor ${k}`);
    for(const k of [...COLORS,...(c.iris==='none'?[]:['iris'])])if(!/^#[0-9a-f]{3,8}$/i.test(c[k]))throw new Error(`invalid actor color ${k}`);
    for(const k of ['chain','lashes','earrings'])if(typeof c[k]!=='boolean')throw new Error(`actor ${k} must be boolean`);
    if(!Number.isFinite(c.height)||c.height<.8||c.height>1.15)throw new Error('actor height must be 0.8..1.15');
    return c;
  }
  const TORSO='M125 600L138 367Q144 318 212 301L290 301Q355 317 367 367L387 600Z';
  function outfit(c,hatch){
    const torso=`<path d="${TORSO}" fill="${c.top}" stroke="${INK}" stroke-width="4"/><path d="${TORSO}" fill="url(#${hatch})"/>`;
    const neck=`<path d="M224 269V318Q249 343 275 318V268" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>`;
    const pin=`<circle cx="311" cy="379" r="11" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
    switch(c.outfit){
      case 'suit':return `${torso}<path d="M207 308L250 350L292 308L303 600H197Z" fill="${c.shirt}" stroke="${INK}" stroke-width="3"/>
      <path d="M208 310L178 344L207 377L186 408L228 600M292 310L323 344L294 377L316 408L275 600" fill="none" stroke="${INK}" stroke-width="3"/>
      ${neck}
      <path d="M286 440H332V453H286" fill="none" stroke="${INK}" stroke-width="3"/>
      <path d="M144 373L160 571M357 374L373 571M143 581L215 581M290 581L373 581" fill="none" stroke="${c.trim}" stroke-width="2"/>
      <path d="M147 366Q152 327 206 310L178 344L207 377L186 408L226 589L198 600L127 600Z" fill="${c.shade}" opacity=".22"/>
      <path d="M251 365V593" stroke="#d9dbcf" stroke-width="2"/>
      <circle cx="264" cy="492" r="4" fill="${INK}"/><circle cx="264" cy="541" r="4" fill="${INK}"/>
      ${pin}`;
      case 'hoodie':return `<path d="M168 330Q160 280 210 262L290 262Q340 280 332 330Q300 350 250 350Q200 350 168 330Z" fill="${c.trim}" stroke="${INK}" stroke-width="4"/>
      ${torso}${neck}
      <path d="M200 304Q250 352 300 304Q290 336 250 346Q210 336 200 304Z" fill="${c.trim}" stroke="${INK}" stroke-width="4"/>
      <path d="M232 340L226 420M268 340L274 420" stroke="${PAPER}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="226" cy="424" r="5" fill="${c.accent}" stroke="${INK}" stroke-width="2"/><circle cx="274" cy="424" r="5" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>
      <path d="M184 476H316Q322 520 328 556H172Q178 520 184 476Z" fill="none" stroke="${INK}" stroke-width="3" opacity=".55"/>
      <path d="M147 366Q152 327 206 310L198 600L127 600Z" fill="${c.shade}" opacity=".22"/>`;
      case 'tee':return `${torso}${neck}
      <path d="M210 303Q250 338 290 303" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="M210 303Q250 338 290 303" fill="none" stroke="${c.trim}" stroke-width="7" stroke-linecap="round"/>
      <path d="M282 470Q296 460 312 468M286 482Q300 474 318 480" fill="none" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/>
      <path d="M147 366Q152 327 206 310L198 600L127 600Z" fill="${c.shade}" opacity=".22"/>`;
      case 'shirt':return `${torso}${neck}
      <path d="M212 300L250 342L224 360L198 316Z M288 300L250 342L276 360L302 316Z" fill="${c.shirt}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M250 342V600" stroke="${INK}" stroke-width="3"/>
      ${[380,440,500,560].map(y=>`<circle cx="262" cy="${y}" r="4" fill="${c.trim}" stroke="${INK}" stroke-width="1.5"/>`).join('')}
      <path d="M290 410H330V450Q310 458 290 450Z" fill="none" stroke="${INK}" stroke-width="3"/>
      <path d="M147 366Q152 327 206 310L198 600L127 600Z" fill="${c.shade}" opacity=".22"/>`;
      case 'sweater':return `${torso}<path d="M224 269V312Q249 330 275 312V268" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>
      <path d="M206 300Q250 326 294 301L298 336Q250 362 202 336Z" fill="${c.trim}" stroke="${INK}" stroke-width="4"/>
      <path d="M215 310L213 340M230 316L229 349M250 318V352M270 316L271 349M285 310L287 340" stroke="${INK}" stroke-width="2" opacity=".35"/>
      <path d="M150 560H350" stroke="${c.trim}" stroke-width="10"/>
      <path d="M147 366Q152 327 206 310L198 600L127 600Z" fill="${c.shade}" opacity=".22"/>${pin}`;
      default:return `${torso}<path d="M224 269V318Q249 343 275 318V268" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>
      <path d="M206 302Q250 360 294 302" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M206 302Q250 360 294 302" fill="none" stroke="${c.trim}" stroke-width="6" stroke-linecap="round"/>
      <path d="M200 330Q250 400 300 330" fill="none" stroke="${c.trim}" stroke-width="3" opacity=".7"/>
      <path d="M147 366Q152 327 206 310L198 600L127 600Z" fill="${c.shade}" opacity=".22"/>
      <path d="M232 352Q250 368 268 352" fill="none" stroke="${c.accent}" stroke-width="4" stroke-linecap="round"/><circle cx="250" cy="372" r="8" fill="${c.accent}" stroke="${INK}" stroke-width="2"/>`;
    }
  }
  const curl=(list,c)=>list.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c.hair}" stroke="${INK}" stroke-width="4"/>`).join('');
  function hair(c){
    const H=c.hair,S=c.shine;
    switch(c.hairStyle){
      case 'crop':return [`<path d="M150 248L146 128Q144 37 246 32Q350 35 355 133L343 295L313 327L189 326Z" fill="${H}" stroke="${INK}" stroke-width="4"/>`,
        `<path d="M156 137L164 88Q189 41 251 44Q323 45 339 114L330 145L295 119L281 91L257 112L210 100L185 132Z" fill="${H}"/>
        <path d="M177 99Q208 60 248 60M300 71L325 105" fill="none" stroke="${S}" stroke-width="3" stroke-linecap="round"/>`];
      case 'short':return [`<path d="M160 156Q148 64 250 44Q352 64 340 156L332 158Q330 112 300 102L200 102Q170 112 168 158Z" fill="${H}" stroke="${INK}" stroke-width="4"/>`,
        `<path d="M162 150Q152 78 188 54Q204 36 228 40Q246 28 268 36Q292 32 308 50Q340 74 338 150L330 126Q322 108 308 108Q296 96 280 103Q264 94 248 104Q230 96 214 106Q196 100 186 112Q174 124 170 146Z" fill="${H}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M200 70Q222 54 248 56M270 56Q296 60 310 82M226 90Q240 78 256 82" fill="none" stroke="${S}" stroke-width="3" stroke-linecap="round"/>`];
      case 'long':return [`<path d="M148 200Q132 46 250 40Q368 46 352 200L370 330Q376 372 340 380L300 360L298 270L202 270L200 360L160 380Q124 372 130 330Z" fill="${H}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
        `<path d="M160 168Q150 60 250 52Q350 60 340 168L330 140Q312 96 262 92Q246 118 196 128Q176 136 170 170Z" fill="${H}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M206 72Q236 60 268 62M150 240Q146 300 158 350M350 240Q355 300 342 350" fill="none" stroke="${S}" stroke-width="3" stroke-linecap="round"/>`];
      case 'bun':return [`<circle cx="250" cy="30" r="36" fill="${H}" stroke="${INK}" stroke-width="4"/>`,
        `<path d="M160 150Q156 58 250 50Q344 58 340 150L330 126Q300 80 250 82Q200 80 170 126Z" fill="${H}" stroke="${INK}" stroke-width="4"/><path d="M222 18Q240 6 262 10" fill="none" stroke="${S}" stroke-width="3" stroke-linecap="round"/>`];
      case 'curls':return [`<ellipse cx="250" cy="140" rx="112" ry="100" fill="${H}"/>${curl([[150,215,34],[136,165,38],[150,112,40],[185,70,42],[235,48,44],[288,52,43],[332,82,41],[360,130,38],[366,180,36],[350,222,33]],c)}`,
        curl([[188,100,20],[218,86,22],[250,82,22],[282,88,22],[312,104,20]],c)];
      default:return [``,`<path d="M160 176Q154 134 176 116L182 168ZM340 176Q346 134 324 116L318 168Z" fill="${H}" stroke="${INK}" stroke-width="3"/><path d="M212 84Q250 70 288 84" fill="none" stroke="${PAPER}" stroke-width="5" stroke-linecap="round" opacity=".7"/>`];
    }
  }
  function beard(c){
    const jaw='M170 205Q172 250 200 280Q225 304 251 306Q277 304 302 280Q328 250 330 205Q322 238 300 250Q276 232 251 236Q226 232 202 250Q180 238 170 205Z';
    if(c.beard==='full')return `<path d="${jaw}" fill="${c.hair}" stroke="${INK}" stroke-width="3"/><path d="M222 238Q236 226 251 232Q266 226 280 238Q266 236 251 240Q236 236 222 238Z" fill="${c.hair}" stroke="${INK}" stroke-width="2"/>`;
    if(c.beard==='goatee')return `<path d="M226 236Q251 226 276 236" fill="none" stroke="${c.hair}" stroke-width="5" opacity=".35" stroke-linecap="round"/><path d="M232 ${c.face==='long'?280:274}Q251 ${c.face==='long'?304:294} 270 ${c.face==='long'?280:274}Q262 ${c.face==='long'?272:268} 251 ${c.face==='long'?276:272}Q240 ${c.face==='long'?272:268} 232 ${c.face==='long'?280:274}Z" fill="${c.hair}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    if(c.beard==='stubble')return `<path d="${jaw}" fill="${c.hair}" opacity=".22"/>`;
    return '';
  }
  function eyes(c){
    const lashes=c.lashes?`<path d="M181 166L170 158M186 160L178 150M321 166L332 158M316 160L324 150" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`:'';
    if(c.glasses==='square')return `<rect x="181" y="155" width="58" height="42" rx="16" fill="${PAPER}" stroke="${INK}" stroke-width="5"/><rect x="263" y="155" width="58" height="42" rx="16" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>
          <path d="M239 171Q252 164 263 171M167 165L181 169M321 169L335 164" fill="none" stroke="${INK}" stroke-width="5"/>${lashes}`;
    if(c.glasses==='round')return `<circle cx="211" cy="176" r="27" fill="${PAPER}" stroke="${INK}" stroke-width="5"/><circle cx="290" cy="176" r="27" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>
          <path d="M238 172Q251 163 263 172M167 168L184 172M317 172L334 167" fill="none" stroke="${INK}" stroke-width="5"/>${lashes}`;
    return `${lashes}<ellipse cx="212" cy="177" rx="23" ry="17" fill="${PAPER}" stroke="${INK}" stroke-width="3.5"/><ellipse cx="288" cy="177" rx="23" ry="17" fill="${PAPER}" stroke="${INK}" stroke-width="3.5"/>`;
  }
  function mount(parent,o={}) {
    if([o.x??0,o.y??0,o.w??480].some(x=>!Number.isFinite(x))||(o.w??480)<=0)throw new Error('actor needs finite position and positive width');
    const c=character(o.character),id=String(o.id??'presenter').replace(/[^\w-]/g,'_'),hatch=`actor-hatch-${id}`,[back,front]=hair(c);
    const w=o.w??480,root=C.reg(C.el('div',{class:'abs','data-actor':o.id??'presenter','data-character':typeof o.character==='string'?o.character:(o.character?'custom':'classic'),style:`width:${w}px;height:${w*1.2}px`},parent),{x:o.x??0,y:o.y??0});
    const arm=side=>`<g data-part="${side}-arm"><path data-part="${side}-outer" fill="none" stroke="${INK}" stroke-width="53" stroke-linecap="round"/><path data-part="${side}-inner" fill="none" stroke="${c.sleeve}" stroke-width="43" stroke-linecap="round"/></g>`;
    const ear=x=>`<ellipse cx="${x}" cy="190" rx="17" ry="28" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>`+(c.earrings?`<circle cx="${x}" cy="226" r="7" fill="${c.accent}" stroke="${INK}" stroke-width="2.5"/>`:'');
    const iris=c.iris==='none'?'':` stroke="${c.iris}" stroke-width="5" paint-order="stroke"`;
    const chain=c.chain?`<path d="M214 306Q216 372 250 384Q284 372 286 306" fill="none" stroke="#c9ccd1" stroke-width="3" stroke-dasharray="4 2"/>`:'';
    const hand=`<path d="M-17 17L-21-8Q-23-21-17-21Q-10-22-8-7L-8-29Q-7-40 0-39Q7-38 7-26L8-7L14-23Q19-32 25-28Q30-24 25-12L20 5L31-3Q39-8 43-2Q48 4 40 10L21 30Q4 43-12 28Z" fill="${c.skin}" stroke="${INK}" stroke-width="3"/>`;
    root.innerHTML=`<svg xmlns="${NS}" viewBox="0 0 500 600" width="100%" height="100%" overflow="visible">
      <defs><pattern id="${hatch}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#fff" stroke-width=".7" opacity=".17"/></pattern></defs>
      ${c.hairStyle==='long'?`<g data-part="hair-back">${back}</g>`:''}
      ${arm('left')}${arm('right')}
      ${outfit(c,hatch)}${chain}
      <g data-part="head">
        ${c.hairStyle==='long'?'':back}
        ${ear(157)}${ear(340)}
        <path d="${c.face==='long'?'M172 127Q175 62 249 60Q321 62 327 129L323 224Q313 296 251 310Q189 296 177 225Z':'M166 127Q170 66 247 65Q323 67 333 129L328 220Q318 285 251 299Q184 285 170 221Z'}" fill="${c.skin}" stroke="${INK}" stroke-width="4"/>
        ${beard(c)}${front}
        <g data-part="eyes">${eyes(c)}
          <ellipse data-part="pupil-left" cx="213" cy="177" rx="6" ry="9" fill="${INK}"${iris}/><ellipse data-part="pupil-right" cx="288" cy="177" rx="6" ry="9" fill="${INK}"${iris}/>
          <path data-part="eyelid-left" d="M199 178Q213 170 225 178" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
          <path data-part="eyelid-right" d="M275 178Q288 170 301 178" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        </g>
        <path data-part="brows" d="M188 142L224 138M277 138L310 142" fill="none" stroke="${c.hair===INK||c.hairStyle==='bald'?INK:c.hair}" stroke-width="5" stroke-linecap="round"/>
        <path d="M251 180L242 213L256 216" fill="none" stroke="#9a6856" stroke-width="3" stroke-linecap="round"/>
        <path data-part="mouth" d="M223 241Q250 263 278 240Q250 275 223 241" fill="${c.lips}" stroke="${c.lips}" stroke-width="2"/>
        <path data-part="teeth" d="M229 243Q250 252 271 243" fill="none" stroke="${PAPER}" stroke-width="5" stroke-linecap="round"/>
        <path d="M183 227L204 231M297 231L315 225" stroke="#d08878" stroke-width="6" opacity=".6" stroke-linecap="round"/>
        <path data-part="sweat" d="M340 100Q357 128 349 145Q338 156 328 147Q320 134 340 100Z" fill="#bfe3f2" stroke="${INK}" stroke-width="3"/>
      </g>
      <g data-part="left-hand">${hand}</g>
      <g data-part="right-hand">${hand}</g>
    </svg>`;
    const q=part=>root.querySelector(`[data-part="${part}"]`),svg=root.firstElementChild;
    const hands={};
    if(window.ACTOR_HANDS)for(const side of ['left','right']){
      q(`${side}-hand`).innerHTML=Object.entries(ACTOR_HANDS).map(([name,shape])=>`<g data-hand="${name}" transform="scale(${side==='right'?-.85:.85} .85)">${shape.replaceAll('#ebc6ab',c.skin)}</g>`).join('');
      hands[side]=[...q(`${side}-hand`).children];
    }
    // react: 0..1 body pop when the pose changes (dip, then overshoot); breathe: idle bob in px of the 500-unit rig; sweat: 0..1.
    function draw(t,{pose='explain',previous='rest',at=0,duration=.55,mouth=0,look=0,target=[250,-120],expression=expressions[pose],previousExpression=expressions[previous],react=.6,breathe=3,sweat=0}={}) {
      if(!poses[pose]||!poses[previous]||[t,at,duration,mouth,look,react,breathe,sweat].some(x=>!Number.isFinite(x))||duration<=0)throw new Error('invalid actor pose, time or state');
      if(!emotions[expression]||!emotions[previousExpression]||!Array.isArray(target)||target.length!==2||!target.every(Number.isFinite))throw new Error('invalid actor expression or target');
      const z=clamp((t-at)/duration),p=z*z*(3-2*z),a=poses[previous],b=poses[pose];
      for(const [side,shoulder] of [['left',[161,351]],['right',[343,351]]]){
        const hand=[mix(a[side][0],b[side][0],p),mix(a[side][1],b[side][1],p)];
        const elbow=[mix(shoulder[0],hand[0],.4)+(side==='left'?-38:38),Math.max(hand[1]+43,shoulder[1]+27)];
        const d=`M${shoulder}Q${elbow} ${hand}`;
        q(`${side}-outer`).setAttribute('d',d);q(`${side}-inner`).setAttribute('d',d);
        const index=side==='left'?0:1,active=p<.5?previous:pose,gesture=gestures[active][index];
        let angle=mix((handAngles[previous]??[-25,20])[index],(handAngles[pose]??[-25,20])[index],p);
        if(side==='right'&&active==='wave')angle+=22*Math.sin((t-at)*11)*p;
        if(side==='right'&&gesture==='point')angle=(Math.atan2(target[1]-hand[1],target[0]-hand[0])-Math.atan2(-73.93799190776967,10.266372227065947))*180/Math.PI;
        hands[side]?.forEach(n=>n.setAttribute('visibility',n.dataset.hand===gesture?'inherit':'hidden'));
        q(`${side}-hand`).setAttribute('data-gesture',gesture);
        q(`${side}-hand`).setAttribute('transform',`translate(${hand}) rotate(${angle})`);
      }
      q('head').setAttribute('transform',`rotate(${mix(a.tilt,b.tilt,p)} 250 310)`);
      const ea=emotions[previousExpression],eb=emotions[expression],face=Object.fromEntries(FACE_KEYS.map(k=>[k,mix(ea[k]??0,eb[k]??0,p)]));
      q('brows').setAttribute('d',`M188 ${142+face.outer}Q205 ${136+face.inner} 224 ${138+face.inner}M277 ${138+face.inner}Q294 ${136+face.inner} 310 ${142+face.outer}`);
      const blink=Math.exp(-Math.pow(((t%3.7)-2.8)/.065,2)),eyeH=9*face.eye*(1-.95*blink);
      for(const [part,x,closed] of [['pupil-left',213,face.wink],['pupil-right',288,0]]){q(part).setAttribute('cx',x+Math.max(-1,Math.min(1,look))*8);q(part).setAttribute('rx',6*face.pupil);q(part).setAttribute('ry',Math.max(.4,eyeH*(1-.95*clamp(closed))));}
      q('eyelid-left').setAttribute('opacity',blink>.5||face.wink>.5?'1':'0');q('eyelid-right').setAttribute('opacity',blink>.5?'1':'0');
      const top=244+face.smile*8,corner=244-face.smile*1.5,opening=clamp(mouth)*24+face.open;
      const L=225+13*face.round,R=277-13*face.round,lift=opening*.35*face.round,gr=face.teeth>.5;
      q('mouth').setAttribute('d',gr?`M221 ${corner-8}H279Q286 ${corner} 279 ${corner+8}H221Q214 ${corner} 221 ${corner-8}Z`:`M${L} ${corner}Q250 ${top-lift} ${R} ${corner}Q250 ${top+3+opening} ${L} ${corner}Z`);
      q('mouth').setAttribute('fill',gr?PAPER:c.lips);q('mouth').setAttribute('stroke',c.lips);q('mouth').setAttribute('stroke-width',gr?'4':'2');
      q('teeth').setAttribute('d',gr?`M221 ${corner}H279M236 ${corner-8}V${corner+8}M250 ${corner-8}V${corner+8}M264 ${corner-8}V${corner+8}`:`M232 ${corner+1}Q250 ${top+6} 270 ${corner+1}`);
      q('teeth').setAttribute('stroke',gr?'#202421':'#fffdf5');q('teeth').setAttribute('stroke-width',gr?'2.5':'5');
      q('teeth').setAttribute('visibility',(face.smile>.3&&opening>2)||gr?'inherit':'hidden');
      q('sweat').setAttribute('visibility',sweat>.01?'inherit':'hidden');q('sweat').setAttribute('transform',`translate(0 ${18*clamp(sweat)})`);
      // Body: anticipation dip then overshoot right after the pose change, plus a slow breath. Scales from the feet.
      const k=Math.max(0,t-at),pop=pose===previous&&expression===previousExpression?0:react*(k<.12?-.03*Math.sin(Math.PI*k/.12):.045*Math.exp(-(k-.12)/.18)*Math.sin(Math.PI*Math.min(1,(k-.12)/.3)));
      svg.style.transformOrigin='50% 100%';svg.style.transform=`translateY(${(breathe*Math.sin(2*Math.PI*t/3.4))*w/500}px) scale(${(1+pop)*c.height},${(1-pop*.6)*c.height})`;
      svg.style.display='none';svg.getBoundingClientRect();svg.style.display='';
    }
    return {root,draw,character:{...c}};
  }
  window.ACTOR={mount,poses:Object.keys(poses),expressions:Object.keys(emotions),characters:Object.keys(cast),styles:STYLES};
})();
