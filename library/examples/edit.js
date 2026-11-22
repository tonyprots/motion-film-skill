// Deliberately generic teaching editor; no product brand or invented product UI.
(() => {
  const {node,label,frame,ramp,put}=EXAMPLE,L=C.TL.example.labels;
  C.scene({name:'edit',from:0,to:20,build(root,S){
    S.g=frame(root,L.title);
    node(S.g,'editor',0,10,850,430,'background:white;border:3px solid #202a31;border-radius:24px');
    label(S.g,'illustration',35,40,780,L.illustration,32);
    label(S.g,'subject',35,120,780,L.subject,50);
    S.old=label(S.g,'old',35,235,780,L.old,44);
    S.selection=node(S.g,'selection',30,230,700,65,'background:#e8552b22');
    S.new=label(S.g,'new',35,235,780,'',44);
    S.new.style.fontFamily='monospace';
    S.caret=node(S.g,'caret',35,238,4,52,'background:#e8552b');
    S.saved=label(S.g,'saved',35,345,780,L.saved,36);
  },run(t,b,S){
    C.enterExit(t,S.g,{from:0,enterDuration:.6});
    const typed=Math.floor(L.replacement.length*ramp(t,3,6));
    put(S.old,{hide:t>=3});put(S.selection,{hide:t<1.7||t>=3});
    put(S.new,{text:L.replacement.slice(0,typed),hide:t<3});
    put(S.caret,{x:35+typed*26.4,hide:t<3||t>=6});
    put(S.saved,{hide:t<6.5});
  },after(t,b,S){EXAMPLE.invalidate(S.g);}});C.start();
})();
