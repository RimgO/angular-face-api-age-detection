import * as faceapi from 'face-api.js';
import { FaceData, RecognitionState } from '../../types/FaceData';

let faceDataStore: FaceData[] = [];
const RECOGNITION_THRESHOLD = 0.6;

export const initializeFaceApi = async () => {
  try {
    await Promise.all([
      faceapi.nets.faceRecognitionNet.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
      faceapi.nets.ssdMobilenetv1.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models')
    ]);
    console.log('Models loaded successfully');
  } catch (error) {
    console.error('Error loading models:', error);
    throw new Error('Failed to load face-api.js models');
  }
};

export const detectFace = async (imageElement: HTMLImageElement | HTMLVideoElement): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection; }, faceapi.FaceLandmarks68>> | null> => {
    const detection = await faceapi.detectSingleFace(imageElement)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection || null;
  };

export const recognizeFace = async (descriptor: Float32Array): Promise<RecognitionState> => {
  if (faceDataStore.length === 0) {
    return { isKnownFace: false };
  }

  let minDistance = Infinity;
  let matchedName: string | undefined;

  for (const faceData of faceDataStore) {
    const distance = faceapi.euclideanDistance(descriptor, faceData.descriptor);
    if (distance < minDistance) {
      minDistance = distance;
      matchedName = faceData.name;
    }
  }

  if (minDistance < RECOGNITION_THRESHOLD) {
    return {
      isKnownFace: true,
      name: matchedName,
      distance: minDistance
    };
  }

  return {
    isKnownFace: true,
    distance: minDistance
  };
};

export const registerFace = (descriptor: Float32Array, name: string): void => {
  // Remove any existing face data with the same name
  faceDataStore = faceDataStore.filter(face => face.name !== name);
  // Add the new face data
  faceDataStore.push({ descriptor, name });
};

export const updateFace = (descriptor: Float32Array, oldName: string, newName: string): boolean => {
  const index = faceDataStore.findIndex(face => face.name === oldName);
  if (index === -1) return false;
  
  faceDataStore[index] = { descriptor, name: newName }; // Update face data with new name
  return true;
};

export const getFaceByName = (name: string): FaceData | undefined => {
  return faceDataStore.find(face => face.name === name);
};