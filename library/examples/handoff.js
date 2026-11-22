// A single labelled object travels between containers; the label is its child.
(() => {
  const {node,label,paper,frame,ramp,put}=EXAMPLE,L=C.TL.example.labels;
  C.scene({name:'handoff',from:0,to:20,
    build(root,S){
      S.g=frame(root,L.title);
      for(const [x,id,txt] of [[0,'source',L.source],[560,'target',L.target]]){
        node(S.g,id,x,80,310,340,'border:3px solid #a4b4be;border-radius:0;background:#e0e8ed');
        label(S.g,id+'-label',x,440,310,txt,36);
      }
      S.paper=paper(S.g,'document',60,120,L.document);
      S.check=label(S.paper,'check',110,155,60,'✓',52);
    },run(t,b,S){
      C.enterExit(t,S.g,{from:0,to:17.6,enterDuration:.6,exitDuration:.6});
      const p=C.ease.inOut(ramp(t,2,4));
      put(S.paper,{x:60+560*p,y:120-150*Math.sin(p*Math.PI)});
      put(S.check,{hide:t<4});
    },after(t,b,S){EXAMPLE.invalidate(S.g);}
  });C.start();
})();
