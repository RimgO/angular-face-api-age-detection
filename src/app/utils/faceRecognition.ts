import * as faceapi from 'face-api.js';
import { FaceData, RecognitionState } from '../../types/FaceData';

let faceDataStore: FaceData[] = [];
const RECOGNITION_THRESHOLD = 0.6;

// Add function to initialize faceDataStore
export const initializeFaceDataStore = (faces: FaceData[]) => {
  faceDataStore = faces.map(face => ({
    ...face,
    descriptor: new Float32Array(Object.values(face.descriptor)) // Convert object to Float32Array
  }));
};

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
    // Ensure both descriptors are Float32Array and have the same length
    if (faceData.descriptor.length !== descriptor.length) {
      console.error('Descriptor length mismatch:', faceData.descriptor.length, descriptor.length);
      continue;
    }

    try {
      const distance = faceapi.euclideanDistance(
        Array.from(descriptor), 
        Array.from(faceData.descriptor)
      );
      if (distance < minDistance) {
        minDistance = distance;
        matchedName = faceData.name;
      }
    } catch (error) {
      console.error('Error calculating distance:', error);
      continue;
    }
  }

  if (minDistance < RECOGNITION_THRESHOLD && matchedName) {
    return {
      isKnownFace: true,
      name: matchedName,
      distance: minDistance
    };
  }

  return {
    isKnownFace: false,
    distance: minDistance
  };
};

export function registerFace(descriptor: Float32Array, name: string): FaceData {
  const newFace: FaceData = {
    descriptor: new Float32Array(Array.from(descriptor)), // Ensure clean copy
    name: name
  };
  faceDataStore.push(newFace);
  return newFace;
}

export function updateFace(descriptor: Float32Array, oldName: string, newName: string): FaceData {
  const index = faceDataStore.findIndex(face => face.name === oldName);
  if (index !== -1) {
    const updatedFace: FaceData = {
      descriptor: new Float32Array(Array.from(descriptor)), // Ensure clean copy
      name: newName
    };
    faceDataStore[index] = updatedFace;
    return updatedFace;
  }
  throw new Error('Face not found');
}

export function getFaceDataStore(): FaceData[] {
  return faceDataStore;
}

export const getFaceByName = (name: string): FaceData | undefined => {
  return faceDataStore.find(face => face.name === name);
};