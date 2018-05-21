var StripOneByThree = function(config) {
    this.photoBorder = 0;
    this.totalPictures = 3;
    this.skipFrame = 1 - 1;
    this.finalSizeRatio = 2/6;
  }

StripOneByThree.prototype.render = function(stuff) {
    var compositeDim = stuff.compositeDim;
    var paper = stuff.paper;
    var compositeOrigin = stuff.compositeOrigin;
    var frames = stuff.frames;
    var images = stuff.images;
    var all = stuff.all;

    // Scale the photo padding too
    this.photoBorder = compositeDim.w / 50;

        //upper x
    var frame_x = compositeOrigin.x + this.photoBorder;
    var frame_y = compositeOrigin.y + this.photoBorder;

    var _frame_w = (compositeDim.w - (2*this.photoBorder));

    var frameDim = {
        w: _frame_w, //(compositeDim.w - (2*this.photoBorder)),
        h: _frame_w * 4/6 // TODO: Fixed aspect ratio?
    };
    var frame = paper.rect(frame_x, frame_y, frameDim.w, frameDim.h);
    frame.attr({'fill': 'black'});
    var img = paper.image(null, frame_x, frame_y, frameDim.w, frameDim.h);

    images.push(img);
    frames.push(frame);
    all.push(img);
    all.push(frame);

    for (var i = 0; i < 2; i++) {
      if (i == this.skipFrame) {
        frame.translate(0, frameDim.h + this.photoBorder);
        img.translate(0, frameDim.h + this.photoBorder);
      }
      frame = frame.clone();
      img = img.clone();
      frame.translate(0, frameDim.h + this.photoBorder);
      img.translate(0, frameDim.h + this.photoBorder);
      frames.push(frame);
      images.push(img);
      all.push(frame);
      all.push(img);
    }

    return frameDim;
  }
