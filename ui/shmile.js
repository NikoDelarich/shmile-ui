
// Everything required to set up the app.
$(window).ready(function() {
  var socketProxy = new SocketProxy();
  var appState = new AppState();

  window.io = window.io || undefined;

  var layer = new SocketLayer(window.io, socketProxy)
  layer.init();

  window.p = new PhotoView(window.Config, appState);
  bv = new ButtonView();
  snackbar = new Snackbar(socketProxy);

  var ssm = new ShmileStateMachine(window.p, socketProxy, appState, window.Config, bv, snackbar)

  bv.fsm = ssm.fsm;

  window.socketProxy = socketProxy;

  socketProxy.on('template', function(template){
    layer.register(ssm.fsm);
    bv.render();
    snackbar.render();
    p.render(template);
    ssm.fsm.connected();
  });

  socketProxy.on('configsChanged', function() {
    window.location.reload(false);
  });

});
