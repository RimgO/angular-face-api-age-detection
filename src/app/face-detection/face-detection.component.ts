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
const THRESHOLD_STILL = 3; // 静止判定の閾値(回)
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
  
    //内部変数の初期化
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
            // Set the flag to true when a face is detected
            this.wasLastDetectionSuccessful = true;
            
            const { age, gender, expressions } = resizedDetections[0];
  
            this.ngZone.run(() => {
              this.age = Math.round(age);
              this.gender = gender;
              this.mood = this.getMaxExpression(expressions);
              this.prevPosition = { x: resizedDetections[0].detection.box.x, y: resizedDetections[0].detection.box.y };
              if(this.age!==null && this.age_buf){
                this.age_buf.push(this.age);
                //バッファが10個以上の場合、中央値を計算してバッファをシフト
                if (this.age_buf.length >= BUFF_WINDOW_SIZE) { 
                  this.median_age = this.getMediumOrMode(this.age_buf);
                  this.age_buf.shift();
                }
              }
              if(this.gender!==null && this.gender_buf){
                this.gender_buf.push(this.gender);
                //バッファが10個以上の場合、中央値を計算してバッファをシフト
                if (this.gender_buf.length >= BUFF_WINDOW_SIZE) { 
                  this.mode_gender = this.getMediumOrMode(this.gender_buf);
                  this.gender_buf.shift();
                }
              }
              if(this.mood!==null && this.mood_buf){
                this.mood_buf.push(this.mood);
                //バッファが10個以上の場合、中央値を計算してバッファをシフト
                if (this.mood_buf.length >= BUFF_WINDOW_SIZE) { 
                  this.mode_mood = this.getMediumOrMode(this.mood_buf);
                  this.mood_buf.shift();
                }  
              }              
            });
  
            const currentTime = Date.now();
            if (currentTime - this.lastUploadTime >= this.uploadInterval) {
              if (currentTime - this.lastRecognitionTime >= this.recognitionInterval) {
                //face rcognition
                try {
                  const detection = await detectFace(video);

                  if (detection) {
                    const { x, y } = detection.detection.box;
                    if (this.prevPosition) {
                      const dx = Math.abs(x - this.prevPosition.x);
                      const dy = Math.abs(y - this.prevPosition.y);
              
                      if (dx < THRESHOLD_MOVEMENT && dy < THRESHOLD_MOVEMENT) {
                          //年齢がからでない場合のみカウント
                          if(this.median_age !== null){
                            this.stillCounter++; // 動いてなければカウント
                          }
                      } else {
                          this.stillCounter = 0; // 動いていたらリセット
                      }
                    }
                    this.prevPosition = { x, y };

                    const resultFace = await recognizeFace(detection.descriptor);
                    console.log('Recognition isKnownFace:', resultFace.isKnownFace,resultFace.name, resultFace.distance);
                    if (!resultFace.isKnownFace || resultFace.name==undefined) { //顔が認識されたが名前が不明の場合
                      this.recognizestate = false;
                      //動かずに連続N回認識されたら登録
                      if(this.stillCounter > THRESHOLD_STILL) {
                        console.error('Count Full. Let me Register');
                        try {
                            const now = new Date(); // 現在の日時のDateオブジェクトを作成
                            const yyyy = now.getFullYear();
                            const mm = ('00' + (now.getMonth() + 1)).slice(-2);
                            const dd = ('00' + now.getDate()).slice(-2);
                            const hh = ('00' + now.getHours()).slice(-2);
                            const mi = ('00' + now.getMinutes()).slice(-2);
                            const ss = ('00' + now.getSeconds()).slice(-2);

                            const newName = `${yyyy}${mm}${dd}_${hh}${mi}${ss}_${this.median_age}_${this.mode_gender}`;
                            console.log('Registering face with name:', newName);
                            registerFace(detection.descriptor, newName.trim());
                            this.recognizedname = newName;  //暫定の名前を設定
                            this.hasExactName = false;  //本当の名前は不明のためfalse
                            this.recognizestate = true; //名前は知らないが顔は覚えた状態
                        } catch (error) {
                          console.error('Error On Recognizing:', error);
                        }
                      }
                    } else { //顔が認識された場合
                      this.recognizestate = true;
                      this.resultname = resultFace.name;
                      if (!this.hasExactName){
                        this.recognizedname = resultFace.name;
                      }
                      console.log('Face Has ExactName?:', resultFace.name, this.hasExactName, this.recognizedname);
                      //暫定の名前が設定されていたら更新
                      if (resultFace.name != null){
                        if(resultFace.name.endsWith('male')) {
                          this.updateNameForCurrentFace(detection.descriptor, resultFace.name);
                          //this.hasExactName = true;
                          //this.updatename = this.updatename;
                        }
                      }
                    }                    
                  } else {  //顔が認識されなかった場合
                    this.stillCounter = 0;
                    this.resultname = null;
                    this.recognizestate = false;
                  }
                  if (this.age !== null && this.mood !== null && this.gender !== null && this.recognizestate == true) {
                    try {
                      // Capture image and prepare data
                      const imageBlob = await this.getVideoBlob(video);
                      const formData = new FormData();
                      formData.append('file', imageBlob, 'image.png');
                      formData.append('age', this.median_age);
                      formData.append('gender', this.mode_gender);
                      formData.append('mood', this.mode_mood);
                      // Face recognition
                      formData.append('recognizestate', this.recognizestate?.toString());
                      formData.append('recognizedname', this.recognizedname || this.resultname || 'unKnown');
      
                      // Upload data
                      this.lastUploadTime = currentTime;
                      const result = await axios.post(`${this.serverUrl}/upload`, formData);
                      console.log('Data uploaded:', result.data);
                    } catch (error) {
                      console.error('Error uploading data:', error);
                    }
                  } else {
                    console.log('Skipping upload due to null values');
                  }
    
                } // upload interval check
                catch (error) {
                console.error('Error On Face Detecting:', error);
                }            
                this.lastRecognitionTime = currentTime;
              } // upload interval check
            } // recognition interval check

          } else {  //顔が検出されなかった場合
            // log output for the 1st time only
            if (this.wasLastDetectionSuccessful) {
              console.log('No face detected - face was lost');
              this.wasLastDetectionSuccessful = false;
            }

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
        } catch (error) {
          console.error('Error While Detecting:', error);
        }
      }, 500);
  
      // Cleanup on component destroy
      return () => clearInterval(intervalId);
    });
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
