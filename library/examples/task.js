// The partially completed document remains visible while the worker leaves and returns.
(() => {
  const {node,label,paper,frame,ramp,put}=EXAMPLE,L=C.TL.example.labels;
  C.scene({name:'task',from:0,to:20,
    build(root,S){
      S.g=frame(root,L.title);
      // Pixel-aligned worker edges survive partial repaints on a backwards seek. Keep the status inside the frame.
      if(C.FMT==='16x9') C.reg(S.g,{s:1.5,y:320});
      S.shell=node(S.g,'worker-entrance',0,0,880,560);
      S.agent=node(S.shell,'worker',0,0,340,400);
      node(S.agent,'body',140,180,190,200,'background:#e0e8ed;border:3px solid #202a31');
      node(S.agent,'head',150,35,170,140,'background:#e0e8ed;border:3px solid #202a31');
      node(S.agent,'eye-left',190,90,18,18,'background:#202a31;border-radius:50%');
      node(S.agent,'eye-right',267,90,18,18,'background:#202a31;border-radius:50%');
      S.clock=node(S.g,'clock',650,-60,100,100,'border:4px solid #202a31;border-radius:50%;background:white');
      S.hand=node(S.clock,'clock-hand',46,12,8,38,'background:#e8552b;border-radius:4px');
      node(S.clock,'clock-pin',43,43,14,14,'background:#202a31;border-radius:50%');
      S.paper=paper(S.g,'document',900,100,L.document);
      S.paper.style.borderRadius='0';
      S.docLabel=S.paper.querySelector('[data-example=document-label]');
      S.lines=Array.from({length:3},(_,i)=>node(S.paper,'completed-line-'+i,20,94+i*29,0,8,'background:#e8552b'));
      S.check=label(S.paper,'check',110,175,60,'✓',52);
      S.pause=node(S.g,'pause',785,160,64,70);
      node(S.pause,'pause-left',0,0,18,55,'background:#e8552b');
      node(S.pause,'pause-right',34,0,18,55,'background:#e8552b');
      S.bar=node(S.g,'progress',500,400,0,24,'background:#e8552b');
      S.value=label(S.g,'value',770,387,110,'0%',44);
      S.status=label(S.g,'status',280,C.pick(450,450,500),600,L.ready,38);
      // Canvas redraw avoids raster-history artifacts on the changing articulated tool.
      S.arm=C.el('canvas',{width:880,height:560,style:'position:absolute;left:0;top:0;width:880px;height:560px'},S.g).getContext('2d');
    },
    run(t,b,S){
      C.enterExit(t,S.shell,{from:0,enterDuration:.65,enter:{x:-C.W-200,y:0}});
      const leave=C.ease.inOut(ramp(t,4.3,4.8)),back=C.ease.inOut(ramp(t,5.2,5.7));
      put(S.agent,{x:-(C.W+200)*(leave-back)});
      const progress=t<4?.48*ramp(t,1.8,4):t<5.9?.48:.48+.52*ramp(t,5.9,7.7);
      const paused=t>=4&&t<5.9,done=t>=7.7;
      const into=C.ease.inOut(ramp(t,.8,1.7)),out=C.ease.inOut(ramp(t,8,8.7));
      const paperX=1200-650*into+110*out;
      put(S.paper,{x:paperX,y:100});put(S.docLabel,{hide:t<1.5});
      S.lines.forEach((e,i)=>put(e,{css:{width:((130-i*18)*C.clamp(progress*3-i))+'px',background:done?'#202a31':'#e8552b'}}));
      put(S.bar,{css:{width:250*progress+'px'}});put(S.value,{text:Math.round(progress*100)+'%'});
      put(S.pause,{hide:!paused});put(S.check,{hide:!done});
      C.rotate(S.hand,progress*720,{origin:'50% 100%'});
      put(S.status,{text:done?L.done:paused?L.paused:t>=1.8?L.working:L.ready});
      const row=Math.min(2,Math.floor(progress*3)),part=C.clamp(progress*3-row);
      const reach=C.ease.out(ramp(t,1.6,1.8))*(1-C.ease.inOut(ramp(t,4,4.3)))+
        C.ease.inOut(ramp(t,5.7,5.9))*(1-C.ease.inOut(ramp(t,7.7,8)));
      const x=300+(paperX+20+(130-row*18)*part-300)*reach,y=215+(194+row*29-215)*reach;
      const g=S.arm;g.clearRect(0,0,880,560);
      if(reach>.001){g.strokeStyle='#202a31';g.lineWidth=12;g.lineCap='round';g.beginPath();g.moveTo(300,215);g.lineTo(x,y);g.stroke();
        g.fillStyle='#e8552b';g.beginPath();g.arc(x,y,8,0,Math.PI*2);g.fill();}
    },
    after(t,b,S){EXAMPLE.invalidate(S.g);}
  });C.start();
})();
