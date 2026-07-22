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
  mappingSource?: "ordered" | "manual" | "recognized";
  matchConfidence?: number;
  matchProvider?: "template-v1" | "tesseract-v7";
  recognitionStatus?: "matched" | "ambiguous" | "empty" | "error";
  recognitionError?: string;
  groupingStatus?: "certain" | "ambiguous";
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
