var LandscapeTwoByTwo = function(config) {
    this.photoBorder = 0;
    this.totalPictures = 4;
    this.finalSizeRatio = 6/4;
  }

LandscapeTwoByTwo.prototype.render = function(stuff) {
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
  this.frameDim = {
      w: (compositeDim.w - (3*this.photoBorder))/2,
      h: (compositeDim.h - (3*this.photoBorder))/2
  };
  var frame = paper.rect(frame_x, frame_y, this.frameDim.w, this.frameDim.h);
  frame.attr({'fill': 'black'});
  var img = paper.image(null, frame_x, frame_y, this.frameDim.w, this.frameDim.h);
  img.rotate(180);
  images.push(img);
  frames.push(frame);
  all.push(img);
  all.push(frame);

  frame = frame.clone();
  img = img.clone();
  frame.translate(this.frameDim.w + this.photoBorder, 0);
  img.translate(this.frameDim.w + this.photoBorder, 0);
  frames.push(frame);
  images.push(img);
  all.push(frame);
  all.push(img);

  frame = frame.clone();
  img = img.clone();
  frame.translate(-(this.frameDim.w + this.photoBorder), this.frameDim.h + this.photoBorder);
  img.translate(-(this.frameDim.w + this.photoBorder), this.frameDim.h + this.photoBorder);
  frames.push(frame);
  images.push(img);
  all.push(frame);
  all.push(img);

  frame = frame.clone();
  img = img.clone();
  frame.translate(this.frameDim.w + this.photoBorder, 0);
  img.translate(this.frameDim.w + this.photoBorder, 0);
  frames.push(frame);
  images.push(img);
  all.push(frame);
  all.push(img);

  return this.frameDim;

}
