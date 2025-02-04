import { Component, OnInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { NgIf } from '@angular/common';
import * as faceapi from 'face-api.js';
import axios from 'axios';

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

  age: number | null = null;
  mood: string | null = null;
  gender: string | null = null;
  private uploadInterval: number = 1000; // ミリ秒単位
  private lastUploadTime: number = 0;

  constructor(private ngZone: NgZone) { }

  async ngOnInit() {
    console.log('FaceDetectionComponent initialized');
    try {
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

  detect() {
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);
  
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
            const { age, gender, expressions } = resizedDetections[0];
  
            this.ngZone.run(() => {
              this.age = Math.round(age);
              this.gender = gender;
              this.mood = this.getMaxExpression(expressions);
            });
  
            const currentTime = Date.now();
            if (currentTime - this.lastUploadTime >= this.uploadInterval) {
              if (this.age !== null && this.mood !== null && this.gender !== null) {
                // Capture image and prepare data
                const imageBlob = await this.getVideoBlob(video);
                const formData = new FormData();
                formData.append('file', imageBlob, 'image.png');
                formData.append('age', this.age.toString());
                formData.append('gender', this.gender);
                formData.append('mood', this.mood);
  
                // Upload data
                this.lastUploadTime = currentTime;
                const result = await axios.post('http://localhost:8000/upload', formData);
                console.log('Data uploaded:', result.data);
              } else {
                console.log('Skipping upload due to null values'
                );
              }
            }
          }
        } catch (error) {
          console.error('Error uploading data:', error);
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

  // インターバルを設定するメソッド
  async setUploadInterval(seconds: number) {
    const response = await fetch('http://localhost:8000/set-interval/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interval: seconds }),
    });
    const data = await response.json();
    this.uploadInterval = seconds * 1000;
  }
}
