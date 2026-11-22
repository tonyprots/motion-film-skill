// Each boundary is a real cut, so shutter samples never mix the two products.
C.scene({name: 'watch', from: 0, to: 'turn'});
C.scene({name: 'camera', from: 'turn', to: 'replay'});
C.scene({name: 'reprise', from: 'replay', to: 'done'});
C.start();
