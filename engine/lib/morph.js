// Adapted from anidoodle canvas-core/morph.ts, Copyright 2026 Alex Greenshpun, Apache-2.0.
// Modified: plain JS, seconds instead of frames, finite/bounded input validation, immutable endpoints,
// explicit velocity units and a local SVG adapter. Full grant/notice: LICENSE-anidoodle, NOTICE-anidoodle.
(function(host,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(host.C)host.MORPH=api;})(globalThis,()=>{
  const finite=(...xs)=>xs.every(Number.isFinite),clamp=x=>Math.max(0,Math.min(1,x)),lerp=(a,b,p)=>a+(b-a)*p;
  const inOut=x=>(x=clamp(x))<.5?4*x*x*x:1-(-2*x+2)**3/2;
  const copy=s=>s.map(p=>[...p]);
  const area=s=>s.reduce((a,p,i)=>{const q=s[(i+1)%s.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;
  function validate(s){if(!Array.isArray(s)||s.length<3||s.length>4096||s.some(p=>!Array.isArray(p)||p.length!==2||!finite(...p))||Math.abs(area(s))<1e-8)throw new Error('morph needs a finite, non-degenerate closed outline');return s;}
  function centre(s){validate(s);const xs=s.map(p=>p[0]),ys=s.map(p=>p[1]);return[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];}
  function circle(c,r,n=72){if(!Array.isArray(c)||c.length!==2||!finite(...c,r)||r<=0||!Number.isInteger(n)||n<8||n>1024)throw new Error('circle needs a finite centre, positive radius and 8..1024 points');return Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return[c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r];});}
  function rect(x,y,w,h,r=0,perCorner=10){
    if(!finite(x,y,w,h,r)||w<=0||h<=0||r<0||!Number.isInteger(perCorner)||perCorner<2||perCorner>128)throw new Error('rect needs finite coordinates, positive size and non-negative radius');
    const q=Math.min(r,w/2,h/2),pts=[];
    const corner=(cx,cy,a0)=>{if(q===0){pts.push([cx,cy]);return;}for(let i=0;i<=perCorner;i++){const a=a0+i/perCorner*Math.PI/2;pts.push([cx+Math.cos(a)*q,cy+Math.sin(a)*q]);}};
    corner(x+w-q,y+q,-Math.PI/2);corner(x+w-q,y+h-q,0);corner(x+q,y+h-q,Math.PI/2);corner(x+q,y+q,Math.PI);return pts;
  }
  function resample(shape,n=160){
    validate(shape);if(!Number.isInteger(n)||n<8||n>1024)throw new Error('resample needs 8..1024 points');
    const s=area(shape)<0?[...shape].reverse():shape,m=s.length,L=s.map((p,i)=>Math.hypot(s[(i+1)%m][0]-p[0],s[(i+1)%m][1]-p[1])),total=L.reduce((a,b)=>a+b,0),out=[];
    let i=0,acc=0;for(let k=0;k<n;k++){const d=k/n*total;while(i<m-1&&acc+L[i]<d)acc+=L[i++];const u=L[i]?(d-acc)/L[i]:0,a=s[i],b=s[(i+1)%m];out.push([lerp(a[0],b[0],u),lerp(a[1],b[1],u)]);}return out;
  }
  function pair(a,b){
    const n=a.length,norm=s=>{const c=centre(s),k=Math.sqrt(s.reduce((v,p)=>v+(p[0]-c[0])**2+(p[1]-c[1])**2,0)/n)||1;return s.map(p=>[(p[0]-c[0])/k,(p[1]-c[1])/k]);};
    const A=norm(a),B=norm(b);let best=0,bd=Infinity;
    for(let k=0;k<n;k++){let d=0;for(let i=0;i<n&&d<bd;i++){const q=B[(i+k)%n];d+=(A[i][0]-q[0])**2+(A[i][1]-q[1])**2;}if(d<bd){bd=d;best=k;}}
    return b.map((_,i)=>b[(i+best)%n]);
  }
  function handoff({from,to,at=0,duration=1,arc=0,stretch=.16,turn=[.3,1],points=160,speedRef=360}={}){
    validate(from);validate(to);
    if(!finite(at,duration,arc,stretch,speedRef)||duration<=0||stretch<0||stretch>1||speedRef<=0||!Array.isArray(turn)||turn.length!==2||!finite(...turn)||turn[0]<0||turn[1]>1||turn[1]<=turn[0]||!Number.isInteger(points)||points<8||points>512)throw new Error('invalid handoff timing, turn, stretch or point count');
    const source=copy(from),target=copy(to),A=resample(source,points),B=pair(A,resample(target,points)),ca=centre(source),cb=centre(target),end=at+duration;
    if(!finite(end)||end<=at)throw new Error('handoff end time must be representable and finite');
    const position=t=>{if(!finite(t))throw new Error('handoff needs finite time');const u=clamp((t-at)/duration),e=inOut(u);return[lerp(ca[0],cb[0],e),lerp(ca[1],cb[1],e)-Math.sin(Math.PI*u)*arc];};
    function sample(t){
      if(!finite(t))throw new Error('handoff needs finite time');if(t<=at)return copy(source);if(t>=end)return copy(target);
      const u=clamp((t-at)/duration),m=inOut(clamp((u-turn[0])/(turn[1]-turn[0]))),c=position(t),dt=duration/1000,c1=position(t-dt),c2=position(t+dt),vx=(c2[0]-c1[0])/(2*dt),vy=(c2[1]-c1[1])/(2*dt),v=Math.hypot(vx,vy);
      const k=1+stretch*Math.sin(Math.PI*u)*clamp(v/speedRef)*(1-m),dx=v?vx/v:1,dy=v?vy/v:0;
      return A.map((a,i)=>{const b=B[i],x=lerp(a[0]-ca[0],b[0]-cb[0],m),y=lerp(a[1]-ca[1],b[1]-cb[1],m),along=(x*dx+y*dy)*k,across=(-x*dy+y*dx)/k;return[c[0]+along*dx-across*dy,c[1]+along*dy+across*dx];});
    }
    return{at:sample,centre:position,start:at,end};
  }
  function toOutline(p,s){let d=Infinity;for(let i=0;i<s.length;i++){const a=s[i],b=s[(i+1)%s.length],vx=b[0]-a[0],vy=b[1]-a[1],t=clamp(((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(vx*vx+vy*vy||1));d=Math.min(d,Math.hypot(p[0]-a[0]-vx*t,p[1]-a[1]-vy*t));}return d;}
  function gap(a,b){validate(a);validate(b);if(a.length===b.length&&a.every((p,i)=>p[0]===b[i][0]&&p[1]===b[i][1]))return 0;return Math.max(...[...a,...resample(a,240)].map(p=>toOutline(p,b)),...[...b,...resample(b,240)].map(p=>toOutline(p,a)));}
  function check(a,b,tolerance=2){if(!finite(tolerance)||tolerance<0)throw new Error('seam tolerance must be finite and non-negative');const d=gap(a,b);if(d>tolerance)throw new Error(`handoff seam jumps ${d.toFixed(2)}px (limit ${tolerance})`);return d;}
  const path=s=>{validate(s);return s.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ')+'Z';};
  function mount(parent,model,{fill='var(--card)',stroke='var(--ink)',width=3,w=C.W,h=C.H}={}){
    if(!model||typeof model.at!=='function'||!finite(width,w,h)||width<0||w<=0||h<=0)throw new Error('morph mount needs a model and finite positive area');
    const ns='http://www.w3.org/2000/svg',root=C.reg(C.el('div',{class:'abs','data-morph':'handoff',style:`width:${w}px;height:${h}px;pointer-events:none`},parent));
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.style.cssText='width:100%;height:100%;overflow:visible';root.appendChild(svg);
    const shape=document.createElementNS(ns,'path');for(const[k,v]of Object.entries({fill,stroke,'stroke-width':width,'stroke-linejoin':'round'}))shape.setAttribute(k,v);svg.appendChild(shape);
    return{root,shape,draw(t){const s=model.at(t);shape.setAttribute('d',path(s));svg.style.display='none';svg.getBoundingClientRect();svg.style.display='';return s;}};
  }
  return{circle,rect,centre,resample,handoff,gap,check,path,mount};
});
