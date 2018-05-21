var LandscapeOneByThree = function(config) {
  this.totalPictures = 3;
  this.size =  {w: 2000, h: 750};
  this.frameSize = {w: 633.33, h:422.22}
  this.frameSpacing = 50;
  this.finalSizeRatio = 8/3;
}

LandscapeOneByThree.prototype.render = function(stuff) {
  var compositeDim = stuff.compositeDim;
  var paper = stuff.paper;
  var compositeOrigin = stuff.compositeOrigin;
  var frames = stuff.frames;
  var images = stuff.images;
  var all = stuff.all;

  var scaleFactor = compositeDim.h / this.size.h;

  var frameDim = {
    w: scaleFactor * this.frameSize.w,
    h: scaleFactor * this.frameSize.h
  }
  var spacing = this.frameSpacing * scaleFactor;
  var frame = paper.rect(compositeOrigin.x, compositeOrigin.y + spacing, frameDim.w, frameDim.h);
  frame.attr({'fill': 'black', 'id': 'frame0'});
  var img = paper.image(null, compositeOrigin.x, compositeOrigin.y + spacing, frameDim.w, frameDim.h);

  images.push(img);
  frames.push(frame);
  all.push(img);
  all.push(frame);

  for (var i = 1; i < 3; i++) {
    frame = frame.clone();
    img = img.clone();
    frame.translate(spacing + frameDim.w, 0);
    frame.attr({'id': 'frame' + i});
    img.translate(spacing + frameDim.w, 0);
    frames.push(frame);
    images.push(img);
    all.push(frame);
    all.push(img);
  }

  return frameDim;
}
