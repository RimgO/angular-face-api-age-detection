/**
 * モデルキャッシュのためのクラス
 * IndexedDBを使用してMediaPipeのモデルをローカルにキャッシュします
 */
export class ModelCache {
    private dbName = 'mediapipe-models';
    private dbVersion = 1;
    private storeName = 'models';
    
    /**
     * IndexedDBを初期化します
     * @returns 初期化されたIndexedDBのインスタンス
     */
    async initializeDB(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        
        request.onerror = (event) => {
          console.error('IndexedDB initialization error:', event);
          reject('IndexedDB initialization error');
        };
        
        request.onsuccess = (event) => {
          resolve(request.result);
        };
        
        request.onupgradeneeded = (event) => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'modelPath' });
          }
        };
      });
    }
    
    /**
     * モデルをキャッシュに保存します
     * @param modelPath モデルのパス
     * @param modelData モデルのデータ
     */
    async saveModel(modelPath: string, modelData: ArrayBuffer): Promise<void> {
      try {
        const db = await this.initializeDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);
          
          const request = store.put({
            modelPath,
            data: modelData,
            timestamp: Date.now()
          });
          
          request.onsuccess = () => {
            console.log(`Model saved to cache: ${modelPath}`);
            resolve();
          };
          
          request.onerror = (event) => {
            console.error('Error saving model to cache:', event);
            reject('Error saving model to cache');
          };
        });
      } catch (error) {
        console.error('Error in saveModel:', error);
        throw error;
      }
    }
    
    /**
     * キャッシュからモデルを取得します
     * @param modelPath モデルのパス
     * @returns モデルのデータ、キャッシュになければnull
     */
    async getModel(modelPath: string): Promise<ArrayBuffer | null> {
      try {
        const db = await this.initializeDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([this.storeName], 'readonly');
          const store = transaction.objectStore(this.storeName);
          
          const request = store.get(modelPath);
          
          request.onsuccess = () => {
            if (request.result) {
              console.log(`Model found in cache: ${modelPath}`);
              resolve(request.result.data);
            } else {
              console.log(`Model not found in cache: ${modelPath}`);
              resolve(null);
            }
          };
          
          request.onerror = (event) => {
            console.error('Error getting model from cache:', event);
            reject('Error getting model from cache');
          };
        });
      } catch (error) {
        console.error('Error in getModel:', error);
        return null;
      }
    }
    
    /**
     * モデルをロードします（キャッシュにあればそこから、なければダウンロード）
     * @param modelPath モデルのパス
     * @returns モデルのデータ
     */
    async loadModel(modelPath: string): Promise<ArrayBuffer> {
      try {
        // まずキャッシュを確認
        const cachedModel = await this.getModel(modelPath);
        if (cachedModel) {
          console.log(`Model loaded from cache: ${modelPath}`);
          return cachedModel;
        }
        
        // キャッシュになければダウンロード
        console.log(`Downloading model: ${modelPath}`);
        const response = await fetch(modelPath);
        if (!response.ok) {
          throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
        }
        
        const modelData = await response.arrayBuffer();
        
        // キャッシュに保存
        await this.saveModel(modelPath, modelData);
        
        return modelData;
      } catch (error) {
        console.error('Error loading model:', error);
        throw error;
      }
    }
  }
  