import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * 上半身検出のためのクラス
 * MediaPipe Pose Landmarkerを使用して上半身の検出を行います
 */
export class UpperBodyDetector {
  private poseLandmarker: PoseLandmarker | null = null;
  private isInitialized: boolean = false;
  
  /**
   * 上半身検出器を初期化します
   */
  async initialize(): Promise<void> {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      console.warn('UpperBodyDetector can only be initialized in a browser environment');
      return;
    }

    try {
      console.log('Initializing UpperBodyDetector...');
      
      const vision = await FilesetResolver.forVisionTasks(
        "assets/wasm"  // Use local path instead of CDN
      );
      
      this.poseLandmarker = await PoseLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: "assets/models/pose_landmarker.task",  // Remove leading slash
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        }
      );
      
      this.isInitialized = true;
      console.log('UpperBodyDetector initialized successfully');
    } catch (error) {
      console.error('Error initializing UpperBodyDetector:', error);
      throw error;
    }
  }
  
  /**
   * 上半身が検出されているかどうかを判定します
   * @param video 検出対象のビデオ要素
   * @returns 上半身が検出されていればtrue、そうでなければfalse
   */
  async detectUpperBody(video: HTMLVideoElement): Promise<boolean> {
    if (!this.isInitialized || !this.poseLandmarker) {
      console.warn('UpperBodyDetector is not initialized');
      return false;
    }
    
    // Check if video has valid dimensions and is ready
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      console.warn('Video not ready or has invalid dimensions');
      return false;
    }
    
    try {
      const result = await this.poseLandmarker.detectForVideo(video, performance.now());
      
      if (result.landmarks.length === 0) {
        return false;
      }
      
      // 上半身の主要なランドマークポイントが検出されているかチェック
      const landmarks = result.landmarks[0];
      
      // 必要な上半身のランドマークが存在するか確認
      // 左肩(11)、右肩(12)、左肘(13)、右肘(14)のいずれかが検出されていれば上半身あり
      const upperBodyLandmarks = [11, 12, 13, 14];
      const detectedUpperBodyLandmarks = upperBodyLandmarks.filter(
        index => landmarks[index] && landmarks[index].visibility > 0.5
      );
      
      return detectedUpperBodyLandmarks.length >= 2; // 少なくとも2つのランドマークが検出されていれば上半身あり
    } catch (error) {
      console.error('Error detecting upper body:', error);
      return false;
    }
  }
  
  /**
   * 上半身検出器が初期化されているかどうかを返します
   * @returns 初期化されていればtrue、そうでなければfalse
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
