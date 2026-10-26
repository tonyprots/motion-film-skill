// Original choreography helpers. Absolute time only; spatial fields and traffic express cause and consequence.
(() => {
  const clamp=x=>Math.max(0,Math.min(1,x)), smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const mix=(a,b,p)=>a+(b-a)*p;
  function point(a,b,p,bend=0) {
    if([a?.x,a?.y,b?.x,b?.y,p,bend].some(x=>!Number.isFinite(x)))throw new Error('path needs finite points and phase');
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,k=4*p*(1-p)*bend;
    return {x:mix(a.x,b.x,p)-dy/len*k,y:mix(a.y,b.y,p)+dx/len*k};
  }
  function wave(points,{origin={x:0,y:0},speed=600,at=0,duration=.45,mode='radial'}={}) {
    if([speed,at,duration,origin.x,origin.y].some(x=>!Number.isFinite(x))||speed<=0||duration<=0||!['radial','x','y'].includes(mode)||points.some(p=>![p.x,p.y].every(Number.isFinite)))throw new Error('wave needs finite points, positive speed and duration');
    const delay=p=>mode==='x'?p.x-origin.x:mode==='y'?p.y-origin.y:Math.hypot(p.x-origin.x,p.y-origin.y);
    const offsets=points.map(p=>Math.max(0,delay(p))/speed);
    return t=>{if(!Number.isFinite(t))throw new Error('wave needs finite time');return offsets.map(d=>smooth((t-at-d)/duration));};
  }
  function connector(parent,{id,from,to,bend=0,color='var(--accent)',width=5,label='',packets=3,w=C.W,h=C.H}={}) {
    if(!id||!from||!to||!Number.isInteger(packets)||packets<1||packets>20||[w,h,width,bend].some(x=>!Number.isFinite(x))||Math.min(w,h,width)<=0)throw new Error('connector needs id, finite endpoints and 1..20 packets');
    const ns='http://www.w3.org/2000/svg',root=C.reg(C.el('div',{class:'abs','data-connector':id,style:`width:${w}px;height:${h}px;pointer-events:none`},parent));
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.style.cssText='width:100%;height:100%;overflow:visible';root.appendChild(svg);
    const el=(tag,attrs)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));svg.appendChild(n);return n;};
    const path=el('path',{fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-dasharray':'7 12'});
    const dots=Array.from({length:packets},()=>el('circle',{r:width*2,fill:color,stroke:'var(--bg)','stroke-width':3}));
    const tag=el('text',{fill:color,'font-size':26,'font-family':'UI,Arial,sans-serif','font-weight':600,'text-anchor':'middle'});tag.textContent=label;
    function draw(t,{at=0,duration=1,progress,active=true}={}) {
      if([t,at,duration,progress??0].some(x=>!Number.isFinite(x))||duration<=0)throw new Error('connector needs finite time and positive duration');
      const phase=progress??clamp((t-at)/duration),a=typeof from==='function'?from(t):from,b=typeof to==='function'?to(t):to;
      const pts=Array.from({length:41},(_,i)=>point(a,b,i/40,bend));
      path.setAttribute('d',pts.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '));
      path.setAttribute('opacity',active?'1':'0');
      dots.forEach((n,i)=>{const p=phase*(1+(packets-1)*.24)-i*.24,pt=point(a,b,clamp(p),bend);n.setAttribute('cx',pt.x);n.setAttribute('cy',pt.y);n.setAttribute('visibility',active&&p>0&&p<1?'inherit':'hidden');});
      const mid=point(a,b,.5,bend);tag.setAttribute('x',mid.x);tag.setAttribute('y',mid.y-22);tag.setAttribute('opacity',active?'1':'0');
      svg.style.display='none';svg.getBoundingClientRect();svg.style.display='';
    }
    return {root,draw};
  }
  window.CAUSAL={point,wave,connector,smooth};
})();
