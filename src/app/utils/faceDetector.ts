import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

/**
 * 顔検出のためのクラス
 * MediaPipe Face Landmarkerを使用して顔の検出を行います
 */
export class FaceDetector {
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitialized: boolean = false;
  
  /**
   * 顔検出器を初期化します
   */
  async initialize(): Promise<void> {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      console.warn('FaceDetector can only be initialized in a browser environment');
      return;
    }

    try {
      console.log('Initializing FaceDetector...');
      
      const vision = await FilesetResolver.forVisionTasks(
        "assets/wasm"  // Use local path instead of CDN
      );
      
      this.faceLandmarker = await FaceLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: "assets/models/face_landmarker.task",
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        }
      );
      
      this.isInitialized = true;
      console.log('FaceDetector initialized successfully');
    } catch (error) {
      console.error('Error initializing FaceDetector:', error);
      throw error;
    }
  }
  
  /**
   * 顔が検出されているかどうかを判定します
   * @param video 検出対象のビデオ要素
   * @returns 顔が検出されていればtrue、そうでなければfalse
   */
  async detectFace(video: HTMLVideoElement): Promise<boolean> {
    if (!this.isInitialized || !this.faceLandmarker) {
      console.warn('FaceDetector is not initialized');
      return false;
    }
    
    // Check if video has valid dimensions and is ready
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      console.warn('Video not ready or has invalid dimensions');
      return false;
    }
    
    try {
      const result = await this.faceLandmarker.detectForVideo(video, performance.now());
      return result.faceLandmarks.length > 0;
    } catch (error) {
      console.error('Error detecting face:', error);
      return false;
    }
  }
  
  /**
   * 顔検出器が初期化されているかどうかを返します
   * @returns 初期化されていればtrue、そうでなければfalse
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
