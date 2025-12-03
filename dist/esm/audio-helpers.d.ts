export declare const handleChunk: (chunk: Blob, existingChunks: Blob[]) => Blob[];
export declare const createBlob: (chunks: Blob[], mimeType: string) => Blob;
export declare const ensureFinalChunk: (mediaRecorder: MediaRecorder) => Promise<void>;
