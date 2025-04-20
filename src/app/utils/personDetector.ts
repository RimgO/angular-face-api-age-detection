import { UpperBodyDetector } from './upperBodyDetector';
import { FaceDetector } from './faceDetector';

/**
 * 人物検出のためのクラス
 * 顔と上半身の検出結果を組み合わせて、同一人物かどうかを判定します
 */
export class PersonDetector {
  private faceDetector: FaceDetector;
  private upperBodyDetector: UpperBodyDetector;
  private lastFaceDetectionTime: number = 0;
  private faceDetectionTimeout: number = 5000; // 5秒間顔が検出されなくても上半身が検出されていれば人物あり
  private isInitialized: boolean = false;
  
  /**
   * PersonDetectorのコンストラクタ
   */
  constructor() {
    this.faceDetector = new FaceDetector();
    this.upperBodyDetector = new UpperBodyDetector();
  }
  
  /**
   * 人物検出器を初期化します
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing PersonDetector...');
      
      // 顔検出器と上半身検出器を並列に初期化
      await Promise.all([
        this.faceDetector.initialize(),
        this.upperBodyDetector.initialize()
      ]);
      
      this.isInitialized = true;
      console.log('PersonDetector initialized successfully');
    } catch (error) {
      console.error('Error initializing PersonDetector:', error);
      throw error;
    }
  }
  
  /**
   * 人物が検出されているかどうかを判定します
   * 顔が検出されている、または最近顔が検出されていて上半身が検出されている場合は人物ありと判定
   * @param video 検出対象のビデオ要素
   * @returns 人物が検出されていればtrue、そうでなければfalse
   */
  async detectPerson(video: HTMLVideoElement): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn('PersonDetector is not initialized');
      return false;
    }
    
    try {
      const currentTime = Date.now();
      const hasFace = await this.faceDetector.detectFace(video);
      const hasUpperBody = await this.upperBodyDetector.detectUpperBody(video);
      
      if (hasFace) {
        this.lastFaceDetectionTime = currentTime;
      }
      
      // 顔が検出されている、または
      // 顔が最近検出されていて、かつ上半身が検出されている場合は人物あり
      const isPerson = hasFace || (
        currentTime - this.lastFaceDetectionTime < this.faceDetectionTimeout && 
        hasUpperBody
      );
      
      // デバッグ情報
      console.log(`Person detection: hasFace=${hasFace}, hasUpperBody=${hasUpperBody}, isPerson=${isPerson}`);
      
      return isPerson;
    } catch (error) {
      console.error('Error detecting person:', error);
      return false;
    }
  }
  
  /**
   * 顔検出のタイムアウト時間を設定します
   * @param timeout タイムアウト時間（ミリ秒）
   */
  setFaceDetectionTimeout(timeout: number): void {
    this.faceDetectionTimeout = timeout;
  }
  
  /**
   * 人物検出器が初期化されているかどうかを返します
   * @returns 初期化されていればtrue、そうでなければfalse
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
