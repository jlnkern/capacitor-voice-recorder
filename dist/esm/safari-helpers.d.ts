/**
 * Safari-specific helper functions to handle MediaRecorder limitations
 */
export declare const isSafari: () => boolean;
export declare const isSafariVersion: (version: number) => boolean;
/**
 * Safari has known issues with MediaRecorder API for longer recordings
 * This function provides Safari-specific MediaRecorder options
 */
export declare const getSafariMediaRecorderOptions: () => {
    mimeType?: undefined;
    audioBitsPerSecond?: undefined;
} | {
    mimeType: string;
    audioBitsPerSecond: number;
};
/**
 * Safari-specific chunk handling to prevent data loss
 */
export declare const handleSafariChunk: (chunk: Blob, existingChunks: Blob[]) => Blob[];
/**
 * Safari-specific blob creation with fallback
 */
export declare const createSafariBlob: (chunks: Blob[], mimeType: string) => Blob;
/**
 * Safari-specific function to ensure final chunk is captured
 */
export declare const ensureFinalChunk: (mediaRecorder: MediaRecorder) => Promise<void>;
