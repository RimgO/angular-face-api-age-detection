import { Component, OnInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { NgIf } from '@angular/common';
import * as faceapi from 'face-api.js';
// Import the environment
import { environment } from '../../environments/environment';

import { initializeFaceApi, detectFace, recognizeFace, registerFace, updateFace } from '../utils/faceRecognition';
import { FaceData, RecognitionState } from '../../types/FaceData';
import axios from 'axios';

let faceDataStore: FaceData[] = [];
const RECOGNITION_THRESHOLD = 0.6;
const THRESHOLD_MOVEMENT = 50; // 位置変化の閾値(px)
const THRESHOLD_STILL = 2; // 静止判定の閾値(回)
const BUFF_WINDOW_SIZE = 10; // バッファサイズ

@Component({
  selector: 'app-face-detection',
  templateUrl: './face-detection.component.html',
  styleUrls: ['./face-detection.component.css'],
  standalone: true,
  imports: [NgIf]
})
export class FaceDetectionComponent implements OnInit {
  @ViewChild('video', { static: true }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvasElement!: ElementRef<HTMLCanvasElement>;

  // Initialize with value from environment
  private serverPort: number = environment.serverPort;
  private get serverUrl(): string {
    return `http://localhost:${this.serverPort}`;
  }

  age: number | null = null;
  mood: string | null = null;
  gender: string | null = null;

  age_buf: Array<number>  | null = null;
  mood_buf: Array<string>  | null = null;
  gender_buf: Array<string>  | null = null;

  private uploadInterval: number = 1000; // ミリ秒単位
  private lastUploadTime: number = 0;

  private prevPosition: { x: number; y: number; } | null = null;
  private stillCounter = 0;

  resultname: string | null = null;

  recognizestate : boolean | null = null;
  recognizedname: string | null = null;
  updatename: string | null = null;

  private recognitionInterval: number = 10000; // ミリ秒単位
  private lastRecognitionTime: number = 0;

  private hasExactName: boolean = false;

  median_age: any;
  mode_gender: any;
  mode_mood: any;

  private errorState: boolean = false;
  private errorMessage: string = '';

  private wasLastDetectionSuccessful = false;

  constructor(private ngZone: NgZone) { }

  async ngOnInit() {
    console.log('FaceDetectionComponent initialized');
    try {
      // Check for environment variable port configuration
      this.initializeServerPort();
      
      //Face Recognitionの初期化
      await initializeFaceApi();

      await this.loadModels();
      console.log('Models loaded successfully');
      await this.startVideo();
      console.log('Video started');
      this.detect();
      console.log('Detection started');

      this.uploadInterval = 1 * 1000; // 秒からミリ秒に変換
    } catch (error) {
      console.error('Error in ngOnInit:', error);
    }
  }

  async loadModels() {
    const MODEL_URL = '/assets/models/';
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
  }

  startVideo() {
    return navigator.mediaDevices.getUserMedia({ video: {} })
      .then(stream => {
        if (this.videoElement.nativeElement) {
          this.videoElement.nativeElement.srcObject = stream;
        }
      })
      .catch(err => console.error(err));
  }

  getMediumOrMode(array: any){
    if (array.length === 0) return null;
    //数値の場合は中央値を計算
    if (typeof array[0] === 'number'){
      return Math.round(array.sort((a: number, b: number) => a-b)[Math.floor(array.length/2)])
    }
    //文字列の場合は最頻値を計算
    else if (typeof array[0] === 'string'){
      const frequency: { [key: string]: number } = {};
      array.forEach((element: string) => {
        frequency[element] = (frequency[element] || 0) + 1;
      });
      return Object.keys(frequency).reduce((a, b) => frequency[a] > frequency[b] ? a : b);
    }
    else{
      return null;
    }
  }

  detect() {
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);
    
    this.resetInternalVariables();
  
    this.ngZone.runOutsideAngular(() => {
      const intervalId = setInterval(async () => {
        try {
          const detections = await faceapi.detectAllFaces(video)
            .withFaceExpressions()
            .withAgeAndGender();
  
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          faceapi.draw.drawDetections(canvas, resizedDetections);
  
          if (resizedDetections.length > 0) {
            this.handleFaceDetection(resizedDetections, video);
          } else {
            this.handleNoFaceDetected();
          }
        } catch (error) {
          console.error('Error While Detecting:', error);
        }
      }, 500);
  
      // Cleanup on component destroy
      return () => clearInterval(intervalId);
    });
  }

  private resetInternalVariables() {
    this.age_buf = [];
    this.gender_buf = [];
    this.mood_buf = [];
    this.median_age = null;
    this.mode_gender = null;
    this.mode_mood = null;
    this.resultname = null;
    this.recognizestate = false;
    this.recognizedname = null;
    this.hasExactName = false;
  }
  
  private handleFaceDetection(resizedDetections: any, video: HTMLVideoElement) {
    // Set the flag to true when a face is detected
    this.wasLastDetectionSuccessful = true;
    
    const { age, gender, expressions } = resizedDetections[0];
    const currentTime = Date.now();
  
    this.ngZone.run(() => {
      this.updateFaceAttributes(age, gender, expressions, resizedDetections[0]);
    });
  
    // Check if it's time to perform face recognition and data upload
    if (currentTime - this.lastUploadTime >= this.uploadInterval) {
      if (currentTime - this.lastRecognitionTime >= this.recognitionInterval) {
        this.performFaceRecognition(video, currentTime);
      }
    }
  }
  
  private updateFaceAttributes(age: number, gender: string, expressions: any, detection: any) {
    this.age = Math.round(age);
    this.gender = gender;
    this.mood = this.getMaxExpression(expressions);
    this.prevPosition = { x: detection.detection.box.x, y: detection.detection.box.y };
    
    this.updateBufferedValues();
  }
  
  private updateBufferedValues() {
    if (this.age !== null && this.age_buf) {
      this.age_buf.push(this.age);
      if (this.age_buf.length >= BUFF_WINDOW_SIZE) { 
        this.median_age = this.getMediumOrMode(this.age_buf);
        this.age_buf.shift();
      }
    }
    
    if (this.gender !== null && this.gender_buf) {
      this.gender_buf.push(this.gender);
      if (this.gender_buf.length >= BUFF_WINDOW_SIZE) { 
        this.mode_gender = this.getMediumOrMode(this.gender_buf);
        this.gender_buf.shift();
      }
    }
    
    if (this.mood !== null && this.mood_buf) {
      this.mood_buf.push(this.mood);
      if (this.mood_buf.length >= BUFF_WINDOW_SIZE) { 
        this.mode_mood = this.getMediumOrMode(this.mood_buf);
        this.mood_buf.shift();
      }
    }
  }
  
  private async performFaceRecognition(video: HTMLVideoElement, currentTime: number) {
    try {
      const detection = await detectFace(video);
      
      if (detection) {
        await this.processDetectedFace(detection, currentTime);
      } else {
        this.handleNoFaceRecognized();
      }
      
      this.lastRecognitionTime = currentTime;
    } catch (error) {
      console.error('Error On Face Detecting:', error);
    }
  }
  
  private async processDetectedFace(detection: any, currentTime: number) {
    this.updateMovementTracking(detection);
    
    const resultFace = await recognizeFace(detection.descriptor);
    console.log('Recognition isKnownFace:', resultFace.isKnownFace, resultFace.name, resultFace.distance);
    
    if (!resultFace.isKnownFace || resultFace.name === undefined) {
      await this.handleUnknownFace(detection);
    } else {
      this.handleKnownFace(resultFace, detection);
    }
    await this.attemptDataUpload(detection, currentTime);
  }
  
  private updateMovementTracking(detection: any) {
    const { x, y } = detection.detection.box;
    if (this.prevPosition) {
      const dx = Math.abs(x - this.prevPosition.x);
      const dy = Math.abs(y - this.prevPosition.y);
  
      if (dx < THRESHOLD_MOVEMENT && dy < THRESHOLD_MOVEMENT) {
        if (this.median_age !== null) {
          this.stillCounter++; // Increment if not moving
        }
      } else {
        this.stillCounter = 0; // Reset if moving
      }
    }
    this.prevPosition = { x, y };
  }
  
  private async handleUnknownFace(detection: any) {
    this.recognizestate = false;
    
    // Register face if still for N consecutive detections
    if (this.stillCounter > THRESHOLD_STILL) {
      console.error('Count Full. Let me Register');
      try {
        const newName = this.generateTimestampName();
        console.log('Registering face with name:', newName);
        registerFace(detection.descriptor, newName.trim());
        this.recognizedname = newName;
        this.hasExactName = false;
        this.recognizestate = true;
      } catch (error) {
        console.error('Error On Recognizing:', error);
      }
    }
  }
  
  private generateTimestampName(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = ('00' + (now.getMonth() + 1)).slice(-2);
    const dd = ('00' + now.getDate()).slice(-2);
    const hh = ('00' + now.getHours()).slice(-2);
    const mi = ('00' + now.getMinutes()).slice(-2);
    const ss = ('00' + now.getSeconds()).slice(-2);
  
    return `${yyyy}${mm}${dd}_${hh}${mi}${ss}_${this.median_age}_${this.mode_gender}`;
  }
  
  private handleKnownFace(resultFace: any, detection: any) {
    this.recognizestate = true;
    this.resultname = resultFace.name;
    
    if (!this.hasExactName) {
      this.recognizedname = resultFace.name;
    }
    
    console.log('Face Has ExactName?:', resultFace.name, this.hasExactName, this.recognizedname);
    
    if (resultFace.name != null && resultFace.name.endsWith('male')) {
      this.updateNameForCurrentFace(detection.descriptor, resultFace.name);
    }
  }
  
  private handleNoFaceRecognized() {
    this.stillCounter = 0;
    this.resultname = null;
    this.recognizestate = false;
  }
  
  private async attemptDataUpload(detection: any, currentTime: number) {
    if (this.age !== null && this.mood !== null && this.gender !== null && this.recognizestate !== false) {
      try {
        const imageBlob = await this.getVideoBlob(this.videoElement.nativeElement);
        const formData = new FormData();
        formData.append('file', imageBlob, 'image.png');
        formData.append('age', this.median_age);
        formData.append('gender', this.mode_gender);
        formData.append('mood', this.mode_mood);
        formData.append('recognizestate', this.recognizestate?.toString() || 'false');
        formData.append('recognizedname', this.recognizedname || this.resultname || 'unKnown');
  
        this.lastUploadTime = currentTime;
        const result = await axios.post(`${this.serverUrl}/upload`, formData);
        console.log('Data uploaded:', result.data);
      } catch (error) {
        console.error('Error uploading data:', error);
      }
    } else {
      console.log('Skipping upload due to null values');
    }
  }
  
  private handleNoFaceDetected() {
    const currentTime = Date.now();
    
    // Log output and attempt data upload only for the 1st time face is lost
    if (this.wasLastDetectionSuccessful) {
      console.log('No face detected - face was lost');
      this.wasLastDetectionSuccessful = false;
      
      // Send null detection data once when face disappears
      this.attemptDataUploadWhenFaceLost(currentTime);
    }
  
    this.resetAllFaceData();
  }
  
  // New method to handle data upload when face is lost
  private async attemptDataUploadWhenFaceLost(currentTime: number) {
    try {
      //const imageBlob = await this.getVideoBlob(this.videoElement.nativeElement);
      const formData = new FormData();
      formData.append('age', this.median_age || ''),
      formData.append('gender', this.mode_gender || ''),
      formData.append('mood', this.mode_mood || ''),
      formData.append('recognizestate', 'lost'),
      formData.append('recognizedname', this.recognizedname || this.resultname || 'unKnown')

      this.lastUploadTime = currentTime;
      const result = await axios.post(`${this.serverUrl}/upload`, formData);
      console.log('Data uploaded:', result.data);
    } catch (error) {
      console.error('Error uploading data:', error);
    }    
  }
  
  private resetAllFaceData() {
    this.age = null;
    this.mood = null;
    this.gender = null;
    this.age_buf = [];
    this.gender_buf = [];
    this.mood_buf = [];
    this.median_age = null;
    this.mode_gender = null;
    this.mode_mood = null;
    this.recognizestate = null;
    this.recognizedname = null;
  }

  getMaxExpression(expressions: faceapi.FaceExpressions): string {
    return Object.entries(expressions).reduce((max, [expression, probability]) =>
      probability > max.probability ? { expression, probability } : max,
      { expression: '', probability: -1 }
    ).expression;
  }

  getVideoBlob(video: HTMLVideoElement): Promise<Blob> {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (blob) {
            resolve(blob);
          }
        }, 'image/png');
      }
    });
  }


  // 現在認識している顔に対応する名前を更新するメソッド
  async updateNameForCurrentFace(descriptor: Float32Array, oldName: string) {
    //update-name apiで設定されている名前を取得
    let data = '';
    const response = await axios.get(`${this.serverUrl}/getupdatename`)
      .then(response => {
        data = response.data.updatename;
      })
      .catch(error => {
        console.error('There was an error!', error);
        // エラー状態の管理追加
        this.errorState = true;
        this.errorMessage = error.message;
        // UIへのエラー表示
        // エラーリカバリー処理
      });
    // Update name
    console.log('Updating name for current face:', data);
    if (data != null && data.trim() !== 'NotYet') {
      this.hasExactName = true;
      this.updatename = data.trim();
      try{
        console.log('Updating face with name:', this.updatename);
        updateFace(descriptor, oldName, this.updatename);
        this.recognizedname = this.updatename;
      } catch (error) {
        console.error('Error updating face:', error);
      }
      // Clear the update name
      await axios.post(`${this.serverUrl}/clearupdatename`)
        .catch(error => {
          console.error('Error clearing update name:', error);
          // エラー状態の管理追加
          this.errorState = true;
          this.errorMessage = error.message;
          // UIへのエラー表示
          // エラーリカバリー処理
        });
    }
  }

  // アップロード間隔を設定するメソッド
  async setUploadInterval(seconds: number) {
    const response = await fetch(`${this.serverUrl}/set-interval/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interval: seconds }),
    });
    const data = await response.json();
    this.uploadInterval = seconds * 1000;
  }

  // 顔認証の間隔を設定するメソッド
  async setRecognitionInterval(seconds: number) {
    const response = await fetch(`${this.serverUrl}/set-recognition-interval/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interval: seconds }),
    });
    const data = await response.json();
    this.recognitionInterval = seconds * 1000;
  }  

  // Initialize server port from environment variable
  private initializeServerPort() {
    try {
      // Start with the environment value
      this.serverPort = environment.serverPort;
      
      // Then try URL parameters for overrides (useful for testing)
      const urlParams = new URLSearchParams(window.location.search);
      const paramPort = urlParams.get('serverPort');
      if (paramPort && !isNaN(Number(paramPort))) {
        this.serverPort = Number(paramPort);
      }
      console.log(`Using server port: ${this.serverPort}`);
    } catch (error) {
      console.log(`Using default server port: ${this.serverPort}`);
    }
  }
}
