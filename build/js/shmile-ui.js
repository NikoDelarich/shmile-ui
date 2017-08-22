/**
 * A class of utility methods.
 */
 var CameraUtils = function() {};

/**
 * Play the snap effect.
 * @param {Integer} idx
 *   The frame index to place the updated image.
 * @param {Function} cheeseCB
 *   Code to execute after "Cheese" is displayed.
 *   Typically, this wraps the command to fire the shutter.
 */
CameraUtils.snap = function(idx, cheeseCb) {
  p.zoomFrame(idx, 'in');
  // These guys need to be promises.
  p.modalMessage('Ready?', Config.ready_delay, 200, function() {
    p.modalMessage("3", 1000, 200, function() {
      p.modalMessage("2", 1000, 200,  function() {
        p.modalMessage("1", 1000, 200, function() {
          cheeseCb();
        });
      });
    });
  });
}

/**
 * Given a max w and h bounds, return the dimensions
 * of the largest 4x6 rect that will fit within.
 */
CameraUtils.scale4x6 = function(maxw, maxh) {
    var s0 = 6/4; // width / height
    var s1 = maxw/maxh;

    // Then the width is longer. Use the shorter side (height)
    if (s0 <= s1) {
        return {w: maxh * 6/4, h: maxh};
    } else {
        return {w: maxw, h: maxw * 4/6}
    }
}

CameraUtils.scale4x1 = function(maxw, maxh) {
    var s0 = 6/4; // width / height
    var s1 = maxw/maxh;

    // Then the width is longer. Use the shorter side (height)
    if (s0 <= s1) {
        return {w: maxh * 4/6 * 0.5, h: maxh};
    } else {
        return {w: maxw, h: maxw * 6/4 * 0.5}
    }
}

/**
 * Given a max w and h bounds, return the dimensions
 * of the largest 3x8 rect that will fit within.
 */
CameraUtils.scale3x8 = function(maxw, maxh) {
    var s0 = 8/3; // width / height
    var s1 = maxw/maxh;

    // Then the width is longer. Use the shorter side (height)
    if (s0 <= s1) {
        return {w: maxh * s0, h: maxh};
    } else {
        return {w: maxw, h: maxw * s0}
    }
}

var Config = {
  photo_margin: 50, // Margin for the composite photo per side
  window_width: $(window).width(),
  window_height: $(window).height() - 10,
  overlay_delay: 2000,
  next_delay: 10000,
  cheese_delay: 400,
  flash_duration: 1000,
  ready_delay: 2000,
  nice_delay: 5000,

  // The amount of time we should pause between each frame shutter
  // I tend to bump this up when 1) photobooth participants want more
  // time to review their photos between shots, and 2) when I'm shooting
  // with external flash and the flash needs more time to recharge.
  between_snap_delay: 1000,

  // For usability enhancements on iPad, set this to "true"
  is_mobile: false
}

/**
 * Describes the current state of the UI.
 */
var AppState = function() {
  this.reset();
};

AppState.prototype.reset = function() {
  this.current_frame_idx = 0;
  this.zoomed = null;
}


/*
 * STATE MACHINE DEFINITION
 * Keep track of app state and logic.
 *
 * + loading
 *   - connected() -> ready
 * + ready
 *   - ui_button_pressed() (DOM button click) -> waiting_for_photo
 * + waiting_for_photo
 *   - photo_saved() -> review_photo
 * + review_photo
 *   - photo_updated() -> next_photo
 * + next_photo
 *   - continue_partial_set() -> waiting_for_photo
 *   - finish_set() -> ready
 *
 * @param [PhotoView]
 * @param [Socket]            The initialized Socket
 * @param [AppState] appState Global initialized state
 * @param [Config] config     The configuration options passed to the app
 */
var ShmileStateMachine = function(photoView, socket, appState, config, buttonView) {
  this.photoView = photoView;
  this.socket = socket;
  this.appState = appState;
  this.config = config;
  this.buttonView = buttonView

  var self = this;

  this.fsm = StateMachine.create({
    initial: 'loading',
    events: [
      { name: 'connected', from: 'loading', to: 'ready' },
      { name: 'ui_button_pressed', from: 'ready', to: 'waiting_for_photo' },
      { name: 'photo_saved', from: 'waiting_for_photo', to: 'review_photo' },
      { name: 'photo_updated', from: 'review_photo', to: 'next_photo' },
      { name: 'continue_partial_set', from: 'next_photo', to: 'waiting_for_photo' },
      { name: 'finish_set', from: 'next_photo', to: 'review_composited' },
      { name: 'next_set', from: 'review_composited', to: 'ready'}
    ],
    callbacks: {
      onconnected: function() {
        console.log("onconnected");
        self.photoView.animate('in', function() {
          self.buttonView.fadeIn();
        });
      },
      onenterready: function() {
        self.photoView.resetState();
      },
      onleaveready: function() {
      },
      onenterwaiting_for_photo: function(e) {
        cheeseCb = function() {
          self.photoView.modalMessage('Cheese!', self.config.cheese_delay);
          self.photoView.flashStart();
          self.socket.emit('snap', true);
        }
        CameraUtils.snap(self.appState.current_frame_idx, cheeseCb);
      },
      onphoto_saved: function(e, f, t, data) {
        // update UI
        // By the time we get here, the idx has already been updated!!
        self.photoView.flashEnd();
        self.photoView.updatePhotoSet(data.web_url, self.appState.current_frame_idx, function() {
          setTimeout(function() {
            self.fsm.photo_updated();
          }, self.config.between_snap_delay)
        });
      },
      onphoto_updated: function(e, f, t) {
        self.photoView.flashEnd();
        // We're done with the full set.
        var pictures = self.photoView.getPicturesTotal()
        if (self.appState.current_frame_idx == pictures - 1) {
          self.fsm.finish_set();
        }
        // Move the frame index up to the next frame to update.
        else {
          self.appState.current_frame_idx = (self.appState.current_frame_idx + 1) % pictures
          self.fsm.continue_partial_set();
        }
      },
      onenterreview_composited: function(e, f, t) {
        self.socket.emit('composite');
        self.photoView.showOverlay(true);
        setTimeout(function() {
          self.fsm.next_set()
        }, self.config.next_delay);
      },
      onleavereview_composited: function(e, f, t) {
        // Clean up
        self.photoView.animate('out');
        self.photoView.modalMessage('Nice!', self.config.nice_delay, 200, function() {
          self.photoView.slideInNext();
        });
      },
      onchangestate: function(e, f, t) {
        console.log('fsm received event '+ e +', changing state from ' + f + ' to ' + t)
      }
    }
  });
}

/**
 * Proxy object that allows the late initialization of the socket, if one
 * exists at all. In instances where we never initialize the socket, we allow
 * for a fake Socket object using a Backbone Event channel.
 */
var SocketProxy = function() {
  this.socket = null;
  this.fakeSocket = {};
  _.extend(this.fakeSocket, Backbone.Events)
}

SocketProxy.prototype.lateInitialize = function(socket) {
  this.socket = socket;
}

SocketProxy.prototype.on = function(evt, cb) {
  if (this.socket === null) {
    console.log("SocketProxy 'on' delegating to fakeSocket")
    this.fakeSocket.on(evt, cb)
    return
  }
  this.socket.on(evt, cb);
}

SocketProxy.prototype.emit = function(msg, data) {
  if (this.socket === null) {
    console.log("SocketProxy 'emit' delegating to fakeSocket")
    this.fakeSocket.trigger(msg, function() {
      console.log(data)
    });
    return
  }
  this.socket.emit(msg, data);
}

/**
 * Responsible for initializing the connection to socket.io.
 * @param io [Socket]
 * @param fsm [StateMachine]
 */
var SocketLayer = function(io, proxy) {
  this.io = io;
  this.proxy = proxy;
}

/**
 * Attempt a connection to socket.io server.
 * If this fails, will no-op and silently continue.
 */
SocketLayer.prototype.init = function() {
  try {
    this.socket = this.io.connect("/");
    this.proxy.lateInitialize(this.socket);
  } catch(e) {
    console.log("Error initializing socket connection: " + e);
  }
  return this;
}

/**
 * Register bindings and callbacks.
 */
SocketLayer.prototype.register = function(fsm) {
  console.log("register");
  this.fsm = fsm;
  var self = this;

  this.proxy.on('message', function(data) {
    console.log('message evt: data is:' + data);
  });

  this.proxy.on('connect', function() {
    console.log('connected evt');
    self.fsm.connected();
  });

  this.proxy.on('camera_snapped', function() {
    console.log('camera_snapped evt');
    //fsm.camera_snapped();
  })

  this.proxy.on('photo_saved', function(data) {
    console.log('photo_saved evt: ' + data.filename);
    self.fsm.photo_saved(data);
  });
}

var PhotoView = Backbone.View.extend({
  id: "#viewport",

  initialize: function(config, state) {
    this.config = config;
    // this.canvas = new Raphael('viewport', this.config.window_width, this.config.window_height);
    // this.frames = this.canvas.set(); // List of SVG black rects
    // this.images = this.canvas.set(); // List of SVG images
    // this.all = this.canvas.set();
    this.overlayImage = null;
    // this.photoBorder = 0;
    // this.compositeDim = null;
    // this.frameDim = null;
    // this.compositeOrigin = null;
    // this.compositeCenter = null;
    this.state = state;
    // this.all = null;
    this.paper = null;
    // this.totalPictures = 4;
    // this.photoViewLayout = null;
  },

  render: function(template) {
    this.photoViewLayout = new window[template.photoView](this.config);
    // [this.paper, this.all] = this.photoViewLayout.render();
    this.paper = this.photoViewLayout.render(function(overlay) {
      window.p.overlayImage = overlay;
      window.p.overlayImage.hide();
    });



    // this.overlayImage = this.paper.select('#layer3')
    // this.overlayImage.hide();
    // FIXME: balh
    // this.setOverlay(template.overlayImage);

    // this.overlayImage = Snap.select("#layer3")
    // this.overlayImage.hide();
    // var w = this.config.window_width - this.config.photo_margin;
    // var h = this.config.window_height - this.config.photo_margin;
    // this.compositeDim = CameraUtils.scale4x1(w, h);
    // this.compositeOrigin = {
    //     x: (this.config.window_width - this.compositeDim.w) / 2,
    //     y: (this.config.window_height - this.compositeDim.h) / 2
    // };
    // this.compositeCenter = {
    //     x: this.compositeOrigin.x + (this.compositeDim.w/2),
    //     y: this.compositeOrigin.y + (this.compositeDim.h/2)
    // }
    // var r = this.canvas.rect(this.compositeOrigin.x, this.compositeOrigin.y, this.compositeDim.w, this.compositeDim.h);
    //
    // r.attr({'fill': 'white'});
    //
    // this.all.append(r);
    //
    // // Scale the photo padding too
    // this.photoBorder = this.compositeDim.w / 50;
    //
    //     //upper x
    // var frame_x = this.compositeOrigin.x + this.photoBorder;
    // var frame_y = this.compositeOrigin.y + this.photoBorder;
    //
    // var _frame_w = (this.compositeDim.w - (2*this.photoBorder));
    //
    // this.frameDim = {
    //     w: (this.compositeDim.w - (2*this.photoBorder)),
    //     h: _frame_w * 4/6 // TODO: Fixed aspect ratio?
    // };
    // var frame = this.canvas.rect(frame_x, frame_y, this.frameDim.w, this.frameDim.h);
    // frame.attr({'fill': 'black'});
    // var img = this.canvas.image(null, frame_x, frame_y, this.frameDim.w, this.frameDim.h);
    //
    // this.images.push(img);
    // this.frames.push(frame);
    // this.all.append(img);
    // this.all.append(frame);
    //
    // for (var i = 0; i < 3; i++) {
    //   frame = frame.clone();
    //   img = img.clone();
    //   frame.translate(0, this.frameDim.h + this.photoBorder);
    //   img.translate(0, this.frameDim.h + this.photoBorder);
    //   this.frames.push(frame);
    //   this.images.push(img);
    //   this.all.append(frame);
    //   this.all.append(img);
    // }
    //
    // // // Draw the PNG logo overlay.
    // // var o = this.canvas.image(
    // //     '/images/overlay_david.png',
    // //     this.compositeOrigin.x,
    // //     this.compositeOrigin.y,
    // //     this.compositeDim.w,
    // //     this.compositeDim.h);
    // // this.all.append(o);
    // // this.overlayImage = o;

    // Hide everything and move out of sight.
    // this.all.hide();
    // this.all.translate(-this.config.window_width, 0);

    this.paper.hide();
    this.paper.transform('T' + -this.config.window_width +',0');
  },

  // toString: function() {
  //   ret = [];
  //   ret.push("Size of 'all' set: " + this.all.length);
  //   ret.push("Size of 'frames' set: " + this.frames.length);
  //   ret.push("Composite photo is: " + this.all[0].attr('width') + 'x' + this.all[0].attr('height'));
  //   ret.push("Frame photo is: " + this.frameDim.w + 'x' + this.frameDim.h);
  //   return ret.join('\n');
  // },

  /**
   * Updates the image at the set location.
   * @param {String} img_src
   *   The URL of the image resource the browser should fetch and display
   * @param {Integer} idx
   *   Index of frame to update
   * @param cb
   *   The callback to be executed when the UI has finished updating and zooming out.
   */
  updatePhotoSet: function(img_src, idx, cb) {
    // var view = this;
    // var imgEl = view.images[idx];
    // var frameEl = view.frames[idx];

    console.log("idx = " + idx);
    var [imgEl, frameEl] = this.photoViewLayout.updatePhotoSet(img_src, idx);


    imgEl.attr({'src': img_src, 'opacity': 0});
    imgEl.show();

    var afterShowPhoto = function () {
      // We've found and revealed the photo, now hide the old black rect and zoom out
      frameEl.hide();
      p.zoomFrame(idx, 'out', cb);
    }
    imgEl.animate({'opacity': 1}, 200, afterShowPhoto);
  },

  /**
   * For in: assume the view has been rendered and reset to initial state and moved out of sight.
   * Slide in the composite image.
   * For out: assume the composite image is centered. Move out of sight and hide.
   */
  animate: function(dir, cb) {
    if (dir === 'in') {
      this.paper.show();
      // this.all.show();
      // this.all.show();
      // this.images.hide();
      if (this.overlayImage) {
        this.overlayImage.hide();
      }
      this.paper.animate({ transform: 'T0,0'
        // 'translation': this.config.window_width+",0"
      }, 1000,
      // "<>"
      mina.easeInOut
      , cb);
    } else if (dir === 'out') {
      this.paper.animate({
        'transform': 'T'+this.config.window_width+",0"
      }, 1000, mina.easeInOut, cb);
    }
  },

  /**
   * zoomFrame zooms into the indicated frame.
   * Call it once to zoom in, call it again to zoom out.
   *
   * @param idx Frame index
   *   Expect zoomFrame(1) to be matched immediately by zoomFrame(1)
   * frame: 0 (upper left), 1 (upper-right), 2 (lower-left), 3 (lower-right)
   * @param dir 'in' or 'out'
   *   Zoom in or out
   * @param onfinish
   *   Callback executed when the animation is finished.
   *
   * Depends on the presence of the .zoomed object to store zoom info.
   */
   // FIXME: thsi should be a general method
  zoomFrame: function(idx, dir, onFinish) {
    if ((dir === "out" && this.state.zoomed) ||
        (dir === "in" && !this.state.zoomed)) {
      this.state.zoomed = this.photoViewLayout.zoomFrame(idx, dir, this.state, onFinish);
    }
      // var view = this;
      // var composite = this.all[idx];
      //
      // var frame = this.frames[idx];
      // var frameX = frame.attr('x');
      // var frameW = frame.attr('width');
      // var frameY = frame.attr('y');
      // var frameH = frame.attr('height');
      // var centerX = frameX + frameW/2;
      // var centerY = frameY + frameH/2;
      //
      // var animSpeed = 1000;
      //
      // // delta to translate to.
      // var dx = this.compositeCenter.x - centerX;
      // var dy = this.compositeCenter.y - centerY;
      // var scaleFactor = this.compositeDim.h / this.frameDim.h;
      //
      // if (dir === "out" && this.state.zoomed) {
      //     scaleFactor = 1;
      //     dx = -this.state.zoomed.dx;
      //     dy = -this.state.zoomed.dy;
      //     view.all.animate({
      //         'scale': [1, 1, view.compositeCenter.x, view.compositeCenter.y].join(','),
      //     }, animSpeed, 'bounce', function() {
      //         view.all.animate({
      //             'translation': dx+','+dy
      //         }, animSpeed, '<>', onfinish)
      //     });
      //     // Clear the zoom data.
      //     this.state.zoomed = null;
      // } else if (dir !== "out") {
      //     view.all.animate({
      //         'translation': dx+','+dy
      //     }, animSpeed, '<>', function() {
      //         view.all.animate({
      //             'scale': [scaleFactor, scaleFactor, view.compositeCenter.x, view.compositeCenter.y].join(','),
      //         }, animSpeed, 'bounce', onfinish)
      //     });
      //     // Store the zoom data for next zoom.
      //     this.state.zoomed = {
      //         dx: dx,
      //         dy: dy,
      //         scaleFactor: scaleFactor
      //     };
      // }
  },

  /**
   * Reset visibility, location of composite image for next round.
   */
  slideInNext: function() {
      this.resetState();
      this.modalMessage('Next!');
      // this.all.hide();
      this.paper.translate(-this.config.window_width * 2, 0);
      this.photoViewLayout.removeImages();
      // this.all.hide();
      // this.all.translate(-this.config.window_width * 2, 0);
      this.animate('in', function() {
        $('#start-button').fadeIn();
      });
  },

  /**
   * Resets the state variables.
   */
  resetState: function () {
    this.state.reset();
  },

  /**
   * Faux camera flash
   */
  flashEffect: function(duration) {
    if (duration === undefined) { duration = 200; }
    // var rect = this.canvas.rect(0, 0, this.config.window_width, this.config.window_height);
    var rect = this.paper.rect(0, 0, this.config.window_width, this.config.window_height);
    rect.attr({'fill': 'white', 'opacity': 0});
    rect.animate({'opacity': 1}, duration, ">", function() {
      rect.animate({'opacity': 0}, duration, "<");
      rect.remove();
    })
  },

  flashStart: function(duration) {
    if (duration === undefined) { duration = 200; }
    // this.rect = this.canvas.rect(0, 0, this.config.window_width, this.config.window_height);
    this.rect = this.paper.rect(0, 0, this.config.window_width, this.config.window_height);
    this.rect.attr({'fill': 'white', 'opacity': 0});
    this.rect.animate({'opacity': 1}, duration, ">")
  },

  flashEnd: function(duration) {
    if (duration === undefined) { duration = 200; }
    var self = this;
    this.rect.animate({'opacity': 0}, duration, "<", function() {
      self.remove();
    });
  },

  /**
   * Draws a modal with some text.
   */
  modalMessage: function(text, persistTime, animateSpeed, cb) {
      if (animateSpeed === undefined) { var animateSpeed = 200; }
      if (persistTime === undefined) { var persistTime = 500; }

      var sideLength = this.config.window_height * 0.3;
      var x = (this.config.window_width - sideLength)/2;
      var y = (this.config.window_height - sideLength)/2;
      var all = this.paper.group();
      var r = this.paper.rect(x, y,
      // var r = this.canvas.rect(x, y,
          sideLength,
          sideLength,
          15);
      r.attr({'fill': '#222',
              'fill-opacity': 0.7,
              'stroke-color': 'white'});
      all.append(r);
      var txt = this.paper.text(x + sideLength/2, y + sideLength/2, text);
      txt.attr({'fill': 'white',
          'font-size': '50',
          'font-weight': 'bold'
      });
      all.append(txt);
      all.attr({'opacity': 0});
      all.animate({
          'opacity': 1,
          'transform': 's1.5',
          'font-size': '70'
      }, animateSpeed, mina.easeIn);

      // Timer to delete self nodes.
      var t = setTimeout(function(all) {
          // Delete nodes
          // txt.remove();
          // r.remove();
          all.remove();
          if (cb) cb();
      }, persistTime, all);
  },

  /**
   * Applies the final image overlay to the composite image.
   * This will usually contain the wedding logo: 24-bit transparent PNG
   */
  showOverlay: function(animate) {
      this.overlayImage.show();
      if (animate) {
          //this.overlayImage.attr({'opacity':0});
        this.overlayImage.animate({'opacity':1}, this.config.overlay_delay);
      }
  },

  /**
   * Removes the overlay
   */
  hideOverlay: function(animate) {
    var view = this;
    if (animate) {
      this.overlayImage.animate({'opacity':0}, this.config.overlay_delay, function() {
        view.overlayImage.hide();
      });
    } else {
      this.overlayImage.hide();
    }
  },

  setOverlay: function(overlayImage) {
    // Draw the PNG logo overlay.
    var o = this.photoViewLayout.createOverlayImage();
    // if (!this.overlayImage) {
      // this.paper.append(o);
      // this.all.remove(this.overlayImage);
    // }
    o.hide();
    this.overlayImage = o;
  },

  getPicturesTotal: function() {
    return this.photoViewLayout.totalPictures;
  },

  // setPicturesTotal: function(totalPictures) {
  //   this.totalPictures = totalPictures;
  // },

  // setLayout: function(photoViewLayout) {
  //   this.photoViewLayout = photoViewLayout;
  // }

});

var ButtonView = function(fsm) {
  this.fsm = fsm;
}

ButtonView.prototype.render = function() {
  var self = this;
  // init code
  this.startButton = $('button#start-button');
  var buttonX = (Config.window_width - this.startButton.outerWidth())/2;
  var buttonY = (Config.window_height - this.startButton.outerHeight())/2;

  this.startButton.hide();

  // Position the start button in the center
  this.startButton.css({'top': buttonY, 'left': buttonX});

  var buttonTriggerEvt = Config.is_mobile ? "touchend" : "click";

  this.startButton.bind(buttonTriggerEvt, function(e) {
    var button = $(e.currentTarget);
    button.fadeOut(1000);
    $(document).trigger('ui_button_pressed');
  });

  $(document).bind('ui_button_pressed', function() {
    console.log('ui_button_pressed evt');
    self.fsm.ui_button_pressed();
  });
}
ButtonView.prototype.fadeIn = function() {
  this.startButton.fadeIn();
}


// Everything required to set up the app.
$(window).ready(function() {
  var socketProxy = new SocketProxy();
  var appState = new AppState();

  window.io = window.io || undefined;

  var layer = new SocketLayer(window.io, socketProxy)
  layer.init();

  window.p = new PhotoView(window.Config, appState);
  bv = new ButtonView();

  var ssm = new ShmileStateMachine(window.p, socketProxy, appState, window.Config, bv)

  bv.fsm = ssm.fsm;

  window.socketProxy = socketProxy;

  socketProxy.on('template', (template) => {
    console.log("blah " + template.overlayImage);
    layer.register(ssm.fsm);
    bv.render();
    p.render(template);

    // p.setOverlay(template.overlayImage);
    // p.setPicturesTotal(template.photosTotal);
    // p.setLayout(template.photoView);

    ssm.fsm.connected();
  });
});

var PortraitOneByFour = function(config) {
    this.config = config;
    this.paper = new Raphael('viewport', this.config.window_width, this.config.window_height);
    this.frames = this.paper.set(); // List of SVG black rects
    this.images = this.paper.set(); // List of SVG images
    this.all = this.paper.set();
    // this.overlayImage = null;
    this.photoBorder = 0;
    this.compositeDim = null;
    this.frameDim = null;
    this.compositeOrigin = null;
    this.compositeCenter = null;
    // this.state = state;
    this.totalPictures = 4;
    // this.photoViewLayout = null;
  }

PortraitOneByFour.prototype.render = function() {
    var w = this.config.window_width - this.config.photo_margin;
    var h = this.config.window_height - this.config.photo_margin;
    this.compositeDim = CameraUtils.scale4x1(w, h);
    this.compositeOrigin = {
        x: (this.config.window_width - this.compositeDim.w) / 2,
        y: (this.config.window_height - this.compositeDim.h) / 2
    };
    this.compositeCenter = {
        x: this.compositeOrigin.x + (this.compositeDim.w/2),
        y: this.compositeOrigin.y + (this.compositeDim.h/2)
    }
    var r = this.paper.rect(this.compositeOrigin.x, this.compositeOrigin.y, this.compositeDim.w, this.compositeDim.h);

    r.attr({'fill': 'white'});

    this.all.push(r);

    // Scale the photo padding too
    this.photoBorder = this.compositeDim.w / 50;

        //upper x
    var frame_x = this.compositeOrigin.x + this.photoBorder;
    var frame_y = this.compositeOrigin.y + this.photoBorder;

    var _frame_w = (this.compositeDim.w - (2*this.photoBorder));

    this.frameDim = {
        w: (this.compositeDim.w - (2*this.photoBorder)),
        h: _frame_w * 4/6 // TODO: Fixed aspect ratio?
    };
    var frame = this.paper.rect(frame_x, frame_y, this.frameDim.w, this.frameDim.h);
    frame.attr({'fill': 'black'});
    var img = this.paper.image(null, frame_x, frame_y, this.frameDim.w, this.frameDim.h);

    this.images.push(img);
    this.frames.push(frame);
    this.all.push(img);
    this.all.push(frame);

    for (var i = 0; i < 3; i++) {
      frame = frame.clone();
      img = img.clone();
      frame.translate(0, this.frameDim.h + this.photoBorder);
      img.translate(0, this.frameDim.h + this.photoBorder);
      this.frames.push(frame);
      this.images.push(img);
      this.all.push(frame);
      this.all.push(img);
    }

    return [this.paper, this.all];

    // // Draw the PNG logo overlay.
    // var o = this.paper.image(
    //     '/images/overlay_david.png',
    //     this.compositeOrigin.x,
    //     this.compositeOrigin.y,
    //     this.compositeDim.w,
    //     this.compositeDim.h);
    // this.all.push(o);
    // this.overlayImage = o;

    // Hide everything and move out of sight.
    // this.all.hide();
    // this.all.translate(-this.config.window_width, 0);
  }

PortraitOneByFour.prototype.toString = function() {
    ret = [];
    ret.push("Size of 'all' set: " + this.all.length);
    ret.push("Size of 'frames' set: " + this.frames.length);
    ret.push("Composite photo is: " + this.all[0].attr('width') + 'x' + this.all[0].attr('height'));
    ret.push("Frame photo is: " + this.frameDim.w + 'x' + this.frameDim.h);
    return ret.join('\n');
  }

  /**
   * Updates the image at the set location.
   * @param {String} img_src
   *   The URL of the image resource the browser should fetch and display
   * @param {Integer} idx
   *   Index of frame to update
   * @param cb
   *   The callback to be executed when the UI has finished updating and zooming out.
   */
  PortraitOneByFour.prototype.updatePhotoSet = function(img_src, idx, cb) {
    var view = this;
    var imgEl = view.images[idx];
    var frameEl = view.frames[idx];

    return [imgEl, frameEl]
    // imgEl.attr({'src': img_src, 'opacity': 0});
    // imgEl.show();
    //
    // var afterShowPhoto = function () {
    //   // We've found and revealed the photo, now hide the old black rect and zoom out
    //   frameEl.hide();
    //   p.zoomFrame(idx, 'out', cb);
    // }
    // imgEl.animate({'opacity': 1}, 200, afterShowPhoto);
  }



  /**
   * zoomFrame zooms into the indicated frame.
   * Call it once to zoom in, call it again to zoom out.
   *
   * @param idx Frame index
   *   Expect zoomFrame(1) to be matched immediately by zoomFrame(1)
   * frame: 0 (upper left), 1 (upper-right), 2 (lower-left), 3 (lower-right)
   * @param dir 'in' or 'out'
   *   Zoom in or out
   * @param onfinish
   *   Callback executed when the animation is finished.
   *
   * Depends on the presence of the .zoomed object to store zoom info.
   */
  PortraitOneByFour.prototype.zoomFrame = function(idx, dir, state, onfinish) {
      var view = this;
      // var composite = this.all[idx];

      var frame = this.frames[idx];
      var frameX = frame.attr('x');
      var frameW = frame.attr('width');
      var frameY = frame.attr('y');
      var frameH = frame.attr('height');
      var centerX = frameX + frameW/2;
      var centerY = frameY + frameH/2;

      var animSpeed = 1000;

      // delta to translate to.
      var dx = this.compositeCenter.x - centerX;
      var dy = this.compositeCenter.y - centerY;
      var scaleFactor = this.compositeDim.h / this.frameDim.h;

      if (dir === "out" && state.zoomed) {
          scaleFactor = 1;
          dx = -state.zoomed.dx;
          dy = -state.zoomed.dy;
          view.all.animate({
              'scale': [1, 1, view.compositeCenter.x, view.compositeCenter.y].join(','),
          }, animSpeed, 'bounce', //onFinish);
          function() {
              view.all.animate({
                  'translation': dx+','+dy
              }, animSpeed, '<>', onfinish)
          });
          return null;
      } else if (dir !== "out") {
          view.all.animate({
              'translation': dx+','+dy
          }, animSpeed, '<>', function() {
              view.all.animate({
                  'scale': [scaleFactor, scaleFactor, view.compositeCenter.x, view.compositeCenter.y].join(','),
              }, animSpeed, 'bounce', onfinish)
          });
          // Store the zoom data for next zoom.
          return  {
              dx: dx,
              dy: dy,
              scaleFactor: scaleFactor
          };
      }
  }

PortraitOneByFour.prototype.removeImages = function () {
  // this.images.clear();
  for (var i = 0; i < this.totalPictures; i++) {
    this.images.pop();
  }
  this.images.hide();
  this.frames.show();
}

PortraitOneByFour.prototype.createOverlayImage = function(overlayImage) {
  return this.paper.image(
      overlayImage,
      this.compositeOrigin.x,
      this.compositeOrigin.y,
      this.compositeDim.w,
      this.compositeDim.h);
    }

// PortraitOneByFour.prototype.set = function() {
//   return this.paper.set();
// }

var LandscapeTwoByTwo = function(config) {
    this.config = config;
    this.paper = new Raphael('viewport', this.config.window_width, this.config.window_height);
    this.frames = this.paper.set(); // List of SVG black rects
    this.images = this.paper.set(); // List of SVG images
    this.all = this.paper.set();
    // this.overlayImage = null;
    this.photoBorder = 0;
    this.compositeDim = null;
    this.frameDim = null;
    this.compositeOrigin = null;
    this.compositeCenter = null;
    // this.state = state;
    this.totalPictures = 4;
    // this.photoViewLayout = null;
  }

LandscapeTwoByTwo.prototype.render = function() {
  var w = this.config.window_width - this.config.photo_margin;
  var h = this.config.window_height - this.config.photo_margin;
  this.compositeDim = CameraUtils.scale4x6(w, h);
  this.compositeOrigin = {
      x: (this.config.window_width - this.compositeDim.w) / 2,
      y: (this.config.window_height - this.compositeDim.h) / 2
  };
  this.compositeCenter = {
      x: this.compositeOrigin.x + (this.compositeDim.w/2),
      y: this.compositeOrigin.y + (this.compositeDim.h/2)
  }
  var r = this.paper.rect(this.compositeOrigin.x, this.compositeOrigin.y, this.compositeDim.w, this.compositeDim.h);

  r.attr({'fill': 'white'});

  this.all.push(r);

  // Scale the photo padding too
  this.photoBorder = this.compositeDim.w / 50;

  //upper x
  var frame_x = this.compositeOrigin.x + this.photoBorder;
  var frame_y = this.compositeOrigin.y + this.photoBorder;
  this.frameDim = {
      w: (this.compositeDim.w - (3*this.photoBorder))/2,
      h: (this.compositeDim.h - (3*this.photoBorder))/2
  };
  var frame = this.paper.rect(frame_x, frame_y, this.frameDim.w, this.frameDim.h);
  frame.attr({'fill': 'black'});
  var img = this.paper.image(null, frame_x, frame_y, this.frameDim.w, this.frameDim.h);

  this.images.push(img);
  this.frames.push(frame);
  this.all.push(img);
  this.all.push(frame);

  frame = frame.clone();
  img = img.clone();
  frame.translate(this.frameDim.w + this.photoBorder, 0);
  img.translate(this.frameDim.w + this.photoBorder, 0);
  this.frames.push(frame);
  this.images.push(img);
  this.all.push(frame);
  this.all.push(img);

  frame = frame.clone();
  img = img.clone();
  frame.translate(-(this.frameDim.w + this.photoBorder), this.frameDim.h + this.photoBorder);
  img.translate(-(this.frameDim.w + this.photoBorder), this.frameDim.h + this.photoBorder);
  this.frames.push(frame);
  this.images.push(img);
  this.all.push(frame);
  this.all.push(img);

  frame = frame.clone();
  img = img.clone();
  frame.translate(this.frameDim.w + this.photoBorder, 0);
  img.translate(this.frameDim.w + this.photoBorder, 0);
  this.frames.push(frame);
  this.images.push(img);
  this.all.push(frame);
  this.all.push(img);

  return [this.paper, this.all];

}

LandscapeTwoByTwo.prototype.toString = function() {
    ret = [];
    ret.push("Size of 'all' set: " + this.all.length);
    ret.push("Size of 'frames' set: " + this.frames.length);
    ret.push("Composite photo is: " + this.all[0].attr('width') + 'x' + this.all[0].attr('height'));
    ret.push("Frame photo is: " + this.frameDim.w + 'x' + this.frameDim.h);
    return ret.join('\n');
  }

  /**
   * Updates the image at the set location.
   * @param {String} img_src
   *   The URL of the image resource the browser should fetch and display
   * @param {Integer} idx
   *   Index of frame to update
   * @param cb
   *   The callback to be executed when the UI has finished updating and zooming out.
   */
  LandscapeTwoByTwo.prototype.updatePhotoSet = function(img_src, idx, cb) {
    var view = this;
    var imgEl = view.images[idx];
    var frameEl = view.frames[idx];

    return [imgEl, frameEl]
    // imgEl.attr({'src': img_src, 'opacity': 0});
    // imgEl.show();
    //
    // var afterShowPhoto = function () {
    //   // We've found and revealed the photo, now hide the old black rect and zoom out
    //   frameEl.hide();
    //   p.zoomFrame(idx, 'out', cb);
    // }
    // imgEl.animate({'opacity': 1}, 200, afterShowPhoto);
  }



  /**
   * zoomFrame zooms into the indicated frame.
   * Call it once to zoom in, call it again to zoom out.
   *
   * @param idx Frame index
   *   Expect zoomFrame(1) to be matched immediately by zoomFrame(1)
   * frame: 0 (upper left), 1 (upper-right), 2 (lower-left), 3 (lower-right)
   * @param dir 'in' or 'out'
   *   Zoom in or out
   * @param onfinish
   *   Callback executed when the animation is finished.
   *
   * Depends on the presence of the .zoomed object to store zoom info.
   */
  LandscapeTwoByTwo.prototype.zoomFrame = function(idx, dir, state, onfinish) {
    var view = this;
    // var composite = this.all[idx];

    var frame = this.frames[idx];
    var frameX = frame.attr('x');
    var frameW = frame.attr('width');
    var frameY = frame.attr('y');
    var frameH = frame.attr('height');
    var centerX = frameX + frameW/2;
    var centerY = frameY + frameH/2;

    var animSpeed = 700;

    // delta to translate to.
    var dx = this.compositeCenter.x - centerX;
    var dy = this.compositeCenter.y - centerY;
    var scaleFactor = this.compositeDim.w / this.frameDim.w;

    if (dir === "out" && state.zoomed) {
        scaleFactor = 1;
        dx = -state.zoomed.dx;
        dy = -state.zoomed.dy;
        view.all.animate({
            'scale': [1, 1, view.compositeCenter.x, view.compositeCenter.y].join(','),
        }, animSpeed, 'bounce', function() {
            view.all.animate({
                'translation': dx+','+dy
            }, animSpeed, '<>', onfinish)
        });
        // Clear the zoom data.
        return null;
    } else if (dir !== "out") {
        view.all.animate({
            'translation': dx+','+dy
        }, animSpeed, '<>', function() {
            view.all.animate({
                'scale': [scaleFactor, scaleFactor, view.compositeCenter.x, view.compositeCenter.y].join(','),
            }, animSpeed, 'bounce', onfinish)
        });
        // Store the zoom data for next zoom.
        return {
            dx: dx,
            dy: dy,
            scaleFactor: scaleFactor
        };
    }
  }

  LandscapeTwoByTwo.prototype.createOverlayImage = function(overlayImage) {
    return this.paper.image(
        overlayImage,
        this.compositeOrigin.x,
        this.compositeOrigin.y,
        this.compositeDim.w,
        this.compositeDim.h);
      }

LandscapeTwoByTwo.prototype.removeImages = function () {
  // this.images.clear();
  // for (var i = 0; i < this.totalPictures; i++) {
  //   this.images.pop();
  // }
  this.images.hide();
  this.frames.show();
}

var SnapOneByFour = function(config) {
    this.config = config;
    // this.paper = Snap('#viewport', his.config.window_width, this.config.window_height);
    this.paper = Snap();
    this.paper.attr({
      viewBox: [0, 0, 2000, 750]
    });
    Snap.select('#viewport').append(this.paper);
    // this.frames = this.paper.group(); // List of SVG black rects
    // this.images = this.paper.group(); // List of SVG images
    // this.all = this.paper.group();
    // this.overlayImage = null;
    // this.photoBorder = 0;
    // this.compositeDim = null;
    // this.frameDim = null;
    // this.compositeOrigin = null;
    // this.compositeCenter = null;
    // this.state = state;
    this.totalPictures = 3;
    // this.overlay = null;
    // this.photoViewLayout = null;

    // Snap.plugin( function( Snap, Element, Paper, global ) {
    //   Element.prototype.getCenter = function() {
    //     var bbox = this.getBBox();
    //     return [bbox.cx, bbox.cy]
    //   };
    // });

    // Polyfill for getTransformToElement as Chrome 48 has deprecated it, may be able to simplify globalToLocal now and leave out polyfill
    SVGElement.prototype.getTransformToElement = SVGElement.prototype.getTransformToElement || function(elem) {
      return elem.getScreenCTM().inverse().multiply(this.getScreenCTM());
    };

    Snap.plugin( function( Snap, Element, Paper, global ) {
      Element.prototype.hide = function() {
        this.attr({ 'opacity': 0.0 });
        // var bbox = this.getBBox();
        // return [bbox.cx, bbox.cy]
      };
      Element.prototype.show = function() {
        this.attr({ 'opacity': 1.0 });
        // var bbox = this.getBBox();
        // return [bbox.cx, bbox.cy]
      };
      Element.prototype.getCenter = function() {
        var bbox = this.getBBox();
        return {x: bbox.cx, y:bbox.cy};
      };
      Element.prototype.getSize = function() {
        var bbox = this.getBBox();
        return {w: bbox.width, h:bbox.height};
      };
      Element.prototype.getPos = function() {
        var bbox = this.getBBox();
        return {x: bbox.x, y:bbox.y};
      };
      Element.prototype.getTransformRelative = function(relativeObj, type, absolute, xadjust, yadjust) {
        var movex = 0;
        var movey = 0;
        switch (type) {
          case "center":
          var c = relativeObj.getCenter();
          var elpos = this.getPos();
          var elsize = this.getSize();
          var movex = c.x - (elsize.w / 2);
          var movey = c.y - (elsize.h / 2);

          movex = (elpos.x > movex ? 0 - (elpos.x - movex) : movex - elpos.x);
          movey = (elpos.y > movey ? 0 - (elpos.y - movey) : movey - elpos.y);
          break;
          case "topleft":
          var movepos = relativeObj.getPos();
          var elpos = this.getPos();

          movex = (elpos.x > movepos.x ? 0 - (elpos.x - movepos.x) : movepos.x - elpos.x);
          movey = (elpos.y > movepos.y ? 0 - (elpos.y - movepos.y) : movepos.y - elpos.y);
          break;
          case "bottomleft":
          var movepos = relativeObj.getBBox();
          var elpos = this.getPos();

          movex = (elpos.x > movepos.x ? 0 - (elpos.x - movepos.x) : movepos.x - elpos.x);
          movey = (elpos.y > movepos.y2 ? 0 - (elpos.y - movepos.y2) : movepos.y2 - elpos.y);
          break;
          case "topright":
          var movepos = relativeObj.getPos();
          var rsize = relativeObj.getSize();
          var elsize = this.getSize();
          var elpos = this.getPos();

          movex = (elpos.x > movepos.x ? 0 - (elpos.x - movepos.x) : movepos.x - elpos.x);
          movey = (elpos.y > movepos.y ? 0 - (elpos.y - movepos.y) : movepos.y - elpos.y);
          movex += rsize.w - elsize.w;
          break;
          case "bottomright":
          var movepos = relativeObj.getBBox();
          var rsize = relativeObj.getSize();
          var elsize = this.getSize();
          var elpos = this.getPos();

          movex = (elpos.x > movepos.x2 ? 0 - (elpos.x - movepos.x2) : movepos.x2 - elpos.x);
          movey = (elpos.y > movepos.y2 ? 0 - (elpos.y - movepos.y2) : movepos.y2 - elpos.y);
          break;
          case "topcenter":
          var c = relativeObj.getCenter();
          var rpos = relativeObj.getPos();
          var elpos = this.getPos();
          var elsize = this.getSize();
          var movex = c.x - (elsize.w / 2);

          movex = (elpos.x > movex ? 0 - (elpos.x - movex) : movex - elpos.x);
          movey = (elpos.y > rpos.y ? 0 - (elpos.y - rpos.y) : rpos.y - elpos.y);
          break;
          case "bottomcenter":
          var c = relativeObj.getCenter();
          var rpos = relativeObj.getBBox();
          var elpos = this.getPos();
          var elsize = this.getSize();
          var movex = c.x - (elsize.w / 2);

          movex = (elpos.x > movex ? 0 - (elpos.x - movex) : movex - elpos.x);
          movey = (elpos.y > rpos.y2 ? 0 - (elpos.y - rpos.y2) : rpos.y2 - elpos.y);
          break;
          case "leftcenter":
          var c = relativeObj.getCenter();
          var rpos = relativeObj.getPos();
          var elpos = this.getPos();
          var elsize = this.getSize();
          var movey = c.y - (elsize.h / 2);

          movex = (elpos.x > rpos.x ? 0 - (elpos.x - rpos.x) : rpos.x - elpos.x);
          movey = (elpos.y > movey ? 0 - (elpos.y - movey) : movey - elpos.y);
          break;
          case "rightcenter":
          var c = relativeObj.getCenter();
          var rbox = relativeObj.getBBox();
          var elpos = this.getPos();
          var elsize = this.getSize();
          var movey = c.y - (elsize.h / 2);

          movex = (elpos.x > rbox.x2 ? 0 - (elpos.x - rbox.x2) : rbox.x2 - elpos.x);
          movey = (elpos.y > movey ? 0 - (elpos.y - movey) : movey - elpos.y);
          break;
          default:
          console.log("ERROR: Unknown transform type in getTransformRelative!");
          break;
        }

        if (typeof(xadjust) === 'undefined') xadjust = 0;
        if (typeof(yadjust) === 'undefined') yadjust = 0;
        movex = movex + xadjust;
        movey = movey + yadjust;

        return (absolute ? "T"+movex+","+movey : "t"+movex+","+movey);
      };

      Element.prototype.getCenterPoint = function( x, y ) {
        var pt = this.paper.node.createSVGPoint();
        var center = this.getCenter();
        pt.x = center.x; pt.y = center.y;
        return pt.matrixTransform( this.paper.node.getScreenCTM().inverse());
      };

      Element.prototype.globalToLocal = function( globalPoint ) {
        var globalToLocal = this.node.getTransformToElement( this.paper.node ).inverse();
        globalToLocal.e = globalToLocal.f = 0;
        return globalPoint.matrixTransform( globalToLocal );
      };

      Element.prototype.zoomToFit = function() {
        //paper -> global?
        //var pt1 = frame1.getCursorPoint(paper.getCenterPoint().x,paper.getCenterPoint().y)
        // var pt = frame1.globalToLocal(pt1)
        // undefined
        // var t = "t" + [pt.x, pt.y]
        // undefined
        // t
        // "t354.1203918457031,132.8743133544922"
        // window.p.photoViewLayout.paper.animate({transform: t}, 1000, mina.easeinout);


        var centerPoint = this.getCenterPoint();

        var paperPoint = this.paper.getCenterPoint()
        var pt = this.paper.node.createSVGPoint();

        pt.x = paperPoint.x - centerPoint.x;
        pt.y = paperPoint.y - centerPoint.y;

        var localPt = this.globalToLocal( pt );
        var localMatrix = this.transform().localMatrix;

        // return this.transform( localMatrix.toTransformString() + "t" + [  localPt.x, localPt.y ] );
        return  localMatrix.toTransformString() + "t" + [  localPt.x, localPt.y ] ;
      };


      Element.prototype.ztf = function (stuff) {
        // paper -> global?
        var centerPoint = stuff.getCenterPoint();
        var pt1 = this.getCursorPoint(centerPoint.x, centerPoint.y)
        var pt = this.globalToLocal(pt1)
        // undefined
        var t = "t" + [pt.x, pt.y]
        return t;
        // undefined
        // t
        // "t354.1203918457031,132.8743133544922"
        // window.p.photoViewLayout.paper.animate({transform: t}, 1000, mina.easeinout);
      }
      Element.prototype.getCursorPoint = function( x, y ) {
        var pt = this.paper.node.createSVGPoint();
        pt.x = x; pt.y = y;
        return pt.matrixTransform( this.paper.node.getScreenCTM().inverse());
      };

      Element.prototype.altDrag = function() {
        return this.drag( altMoveDrag, altStartDrag );
      };

      function altMoveDrag( xxdx, xxdy, ax, ay ) {
        var tdx, tdy;
        var cursorPoint = this.getCursorPoint( ax, ay );
        var pt = this.paper.node.createSVGPoint();

        pt.x = cursorPoint.x - this.data('op').x;
        pt.y = cursorPoint.y - this.data('op').y;

        var localPt = this.globalToLocal( pt );

        this.transform( this.data('ot').toTransformString() + "t" + [  localPt.x, localPt.y ] );

      };

      function altStartDrag( x, y, ev ) {
        this.data('ibb', this.getBBox());
        this.data('op', this.getCursorPoint( x, y ));
        this.data('ot', this.transform().localMatrix);
      };
    });

  }

SnapOneByFour.prototype.render = function(cb) {
  var snap = this.paper;
  Snap.load("/images/drawing.svg", function(data){
    var el = data.select("svg");
  //   el.attr({'id':'paper'
  // // });
  // // , 'width':window.Config.window_width - 50
  // , 'width': "95%"
  // , 'height': "95%", 'display': "block", 'margin': "auto"});
  // ,'height':window.Config.window_height - 50});
    // el.transform('t0,'+0+'s'+compositeDim.w/755.91);

    snap.append(el)
    if (cb) {
      var overlay = el.select('#layer3');
      cb(overlay);
    }
  });
  return this.paper;


    // var w = this.config.window_width - this.config.photo_margin;
    // var h = this.config.window_height - this.config.photo_margin;
    // this.compositeDim = CameraUtils.scale4x1(w, h);
    // this.compositeOrigin = {
    //     x: (this.config.window_width - this.compositeDim.w) / 2,
    //     y: (this.config.window_height - this.compositeDim.h) / 2
    // };
    // this.compositeCenter = {
    //     x: this.compositeOrigin.x + (this.compositeDim.w/2),
    //     y: this.compositeOrigin.y + (this.compositeDim.h/2)
    // }
    // var r = this.paper.rect(this.compositeOrigin.x, this.compositeOrigin.y, this.compositeDim.w, this.compositeDim.h);
    //
    // r.attr({'fill': 'white'});
    //
    // this.paper.append(r);
    //
    // // Scale the photo padding too
    // this.photoBorder = this.compositeDim.w / 50;
    //
    //     //upper x
    // var frame_x = this.compositeOrigin.x + this.photoBorder;
    // var frame_y = this.compositeOrigin.y + this.photoBorder;
    //
    // var _frame_w = (this.compositeDim.w - (2*this.photoBorder));
    //
    // this.frameDim = {
    //     w: (this.compositeDim.w - (2*this.photoBorder)),
    //     h: _frame_w * 4/6 // TODO: Fixed aspect ratio?
    // };
    // var frame = this.paper.rect(frame_x, frame_y, this.frameDim.w, this.frameDim.h);
    // frame.attr({'fill': 'black'});
    // var img = this.paper.image(null, frame_x, frame_y, this.frameDim.w, this.frameDim.h);
    //
    // this.images.append(img);
    // this.frames.append(frame);
    // // this.all.append(img);
    // // this.all.append(frame);
    //
    // for (var i = 1; i < 4; i++) {
    //   frame = frame.clone();
    //   img = img.clone();
    //   frame.transform('t0,'+(i*(this.frameDim.h + this.photoBorder)));
    //   img.transform('t0,'+(i*(this.frameDim.h + this.photoBorder)));
    //   this.frames.append(frame);
    //   this.images.append(img);
    //   // this.all.append(frame);
    //   // this.all.append(img);
    // }
    //
    // // return [this.paper, this.all];
    // return this.paper;
    //
    // // // Draw the PNG logo overlay.
    // // var o = this.paper.image(
    // //     '/images/overlay_david.png',
    // //     this.compositeOrigin.x,
    // //     this.compositeOrigin.y,
    // //     this.compositeDim.w,
    // //     this.compositeDim.h);
    // // this.all.push(o);
    // // this.overlayImage = o;
    //
    // // Hide everything and move out of sight.
    // // this.all.hide();
    // // this.all.translate(-this.config.window_width, 0);
  }

SnapOneByFour.prototype.toString = function() {
    ret = [];
    ret.push("Size of 'all' set: " + this.all.length);
    ret.push("Size of 'frames' set: " + this.frames.length);
    ret.push("Composite photo is: " + this.all[0].attr('width') + 'x' + this.all[0].attr('height'));
    ret.push("Frame photo is: " + this.frameDim.w + 'x' + this.frameDim.h);
    return ret.join('\n');
  }

  /**
   * Updates the image at the set location.
   * @param {String} img_src
   *   The URL of the image resource the browser should fetch and display
   * @param {Integer} idx
   *   Index of frame to update
   * @param cb
   *   The callback to be executed when the UI has finished updating and zooming out.
   */
  SnapOneByFour.prototype.updatePhotoSet = function(img_src, idx, cb) {
    var view = this;
    var frameEl = view.select('#frame'+(idx + 1));
    var imgEl = frameEl.clone();

    return [imgEl, frameEl]
    // imgEl.attr({'src': img_src, 'opacity': 0});
    // imgEl.show();
    //
    // var afterShowPhoto = function () {
    //   // We've found and revealed the photo, now hide the old black rect and zoom out
    //   frameEl.hide();
    //   p.zoomFrame(idx, 'out', cb);
    // }
    // imgEl.animate({'opacity': 1}, 200, afterShowPhoto);
  }



  /**
   * zoomFrame zooms into the indicated frame.
   * Call it once to zoom in, call it again to zoom out.
   *
   * @param idx Frame index
   *   Expect zoomFrame(1) to be matched immediately by zoomFrame(1)
   * frame: 0 (upper left), 1 (upper-right), 2 (lower-left), 3 (lower-right)
   * @param dir 'in' or 'out'
   *   Zoom in or out
   * @param onfinish
   *   Callback executed when the animation is finished.
   *
   * Depends on the presence of the .zoomed object to store zoom info.
   */
  SnapOneByFour.prototype.zoomFrame = function(idx, dir, state, onfinish) {
      var view = this.paper;
      // var composite = this.all[idx];

      var bbox = view.select('#frame' + (idx + 1)).getBBox();
      var frameX = bbox.x;//frame.attr('x');
      var frameW = bbox.width;//frame.attr('width');
      var frameY = bbox.y;//frame.attr('y');
      var frameH = bbox.height;//frame.attr('height');
      var centerX = bbox.cx;//frameX + frameW/2;
      var centerY = bbox.cy;//frameY + frameH/2;

      var animSpeed = 1000;

      // delta to translate to.
      // var dx = (window.Config.window_width/2) - centerX;
      // var dy = (window.Config.window_height/2) - centerY;

      var svg = Snap.select('svg');
      var b = svg.getBBox();

      var compositeCenter = { x: b.cx,
                              y: b.cy };
      // var compositeCenter = { x: window.Config.window_width / 2,
      //                         y: window.Config.window_height / 2 };

      var dx = compositeCenter.x - centerX;
      var dy =  compositeCenter.y - centerY;
      var scaleFactor = b.width / frameW;
      if (dir === "out" && state.zoomed) {
          scaleFactor = 1;
          dx = -state.zoomed.dx;
          dy = -state.zoomed.dy;
          view.animate({
              transform: 's' + [1, 1, compositeCenter.x, compositeCenter.y].join(','),
          }, animSpeed, mina.bounce, //onFinish);
          function() {
              view.animate({
                  'translation': dx+','+dy
              }, animSpeed, mina.easeInOut, onfinish)
          });
          return null;
      } else if (dir !== "out") {
          view.animate({
              transform: 't'+ dx+','+ dy
              // transform: 's' + [1, 1, centerX, centerY].join(','),
          }, animSpeed, mina.easeInOut);//, function() {
          //     view.animate({
          //         transform: 's' + [scaleFactor, scaleFactor, compositeCenter.x, compositeCenter.y].join(','),
          //     }, animSpeed, mina.bounce, onfinish)
          // });
          // Store the zoom data for next zoom.
          return  {
              dx: dx,
              dy: dy,
              scaleFactor: scaleFactor
          };
      }
  }

SnapOneByFour.prototype.removeImages = function () {
  // // this.images.clear();
  // for (var i = 0; i < this.totalPictures; i++) {
  //   this.images.pop();
  // }
  // this.images.hide();
  // this.frames.show();
}

SnapOneByFour.prototype.createOverlayImage = function() {
  return this.paper.select('#layer3');
  // return this.overlay;
  // return this.paper.image(
    //   overlayImage,
    //   this.compositeOrigin.x,
    //   this.compositeOrigin.y,
    //   this.compositeDim.w,
    //   this.compositeDim.h);
  }

// SnapOneByFour.prototype.set = function() {
//   return this.paper.set();
// }
