export interface FaceData {
    descriptor: Float32Array;
    name?: string;
  }
  
  export interface RecognitionState {
    isKnownFace: boolean;
    name?: string;
    distance?: number;
  }