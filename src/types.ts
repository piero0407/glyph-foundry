export type Glyph = {
  id: number;
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  matchConfidence?: number;
};

export type AtlasImage = {
  name: string;
  width: number;
  height: number;
  image: HTMLImageElement;
  pixels: ImageData;
};

export type DetectionSettings = {
  alphaThreshold: number;
  padding: number;
  minArea: number;
  advanceAdjustment: number;
};
