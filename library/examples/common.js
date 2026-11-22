// Finished teaching scenes: neutral illustrations, never a replica of a product.
(() => {
  const {el, reg, put, pick, W, H} = C;
  const node = (parent, id, x, y, w, h, css = '', text = '') => reg(el('div', {
    class:'abs', 'data-example':id, style:`width:${w}px;height:${h}px;${css}`
  }, parent, text), {x,y});
  const label = (p,id,x,y,w,text,size=40) => node(p,id,x,y,w,size*1.3,
    `font:${size>=60?600:500} ${size}px Arial,sans-serif;white-space:nowrap`,text);
  const paper = (p,id,x,y,text) => {
    const n=node(p,id,x,y,190,240,'background:white;border:3px solid #202a31;border-radius:16px;box-shadow:0 12px 0 #dbe2e6');
    label(n,id+'-label',18,28,160,text,32);
    for(let i=0;i<3;i++) node(n,id+'-line'+i,20,94+i*29,130-i*18,8,'background:#b3c0c7;border-radius:4px');
    return n;
  };
  const frame = (root,title) => {
    root.style.background='#f2f6f8';root.style.color='#202a31';
    label(root,'title',pick(140,90,90),pick(105,140,310),pick(1600,900,900),title,pick(100,76,62));
    const g=node(root,'world',pick(320,100,70),pick(340,390,700),880,500);
    reg(g,{s:pick(1.45,1,.98)});
    return g;
  };
  const ramp=(t,a,b)=>C.clamp((t-a)/(b-a));
  const invalidate = e => { e.style.display='none'; e.getBoundingClientRect(); e.style.display=''; };
  window.EXAMPLE={node,label,paper,frame,ramp,put,invalidate};
})();
