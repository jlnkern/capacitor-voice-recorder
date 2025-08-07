/**
 * Safari-specific helper functions to handle MediaRecorder limitations
 */

export const isSafari = (): boolean => {
    return true;
//   return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

export const isSafariVersion = (version: number): boolean => {
  const userAgent = navigator.userAgent;
  const safariMatch = userAgent.match(/Version\/(\d+)/);
  if (safariMatch) {
    return parseInt(safariMatch[1]) >= version;
  }
  return false;
};

/**
 * Safari has known issues with MediaRecorder API for longer recordings
 * This function provides Safari-specific MediaRecorder options
 */
export const getSafariMediaRecorderOptions = () => {
  if (!isSafari()) {
    return {};
  }

  return {
    // Safari-specific options
    mimeType: 'audio/webm;codecs=opus', // Better Safari support
    audioBitsPerSecond: 128000, // Lower bitrate for better Safari compatibility
  };
};

/**
 * Safari-specific chunk handling to prevent data loss
 */
export const handleSafariChunk = (chunk: Blob, existingChunks: Blob[]): Blob[] => {
  if (!isSafari()) {
    return [...existingChunks, chunk];
  }

  // Safari-specific: Validate chunk before adding
  if (chunk && chunk.size > 0) {
    // Safari sometimes sends empty or corrupted chunks
    try {
      // Additional validation for Safari
      if (chunk.type && chunk.type.startsWith('audio/')) {
        console.log('Safari: Adding valid chunk with size:', chunk.size);
        return [...existingChunks, chunk];
      }
    } catch (error) {
      console.warn('Safari chunk validation failed:', error);
    }
  } else {
    console.warn('Safari: Received empty or invalid chunk');
  }
  
  return existingChunks;
};

/**
 * Safari-specific blob creation with fallback
 */
export const createSafariBlob = (chunks: Blob[], mimeType: string): Blob => {
  if (!isSafari()) {
    return new Blob(chunks, { type: mimeType });
  }

  console.log('Safari: Creating blob from', chunks.length, 'chunks');
  
  // Safari-specific: Use fallback mime type if primary fails
  try {
    const blob = new Blob(chunks, { type: mimeType });
    console.log('Safari: Blob created successfully with size:', blob.size);
    return blob;
  } catch (error) {
    console.warn('Safari blob creation failed with primary mime type, trying fallback');
    const fallbackBlob = new Blob(chunks, { type: 'audio/webm' });
    console.log('Safari: Fallback blob created with size:', fallbackBlob.size);
    return fallbackBlob;
  }
};

/**
 * Safari-specific function to ensure final chunk is captured
 */
export const ensureFinalChunk = async (mediaRecorder: MediaRecorder): Promise<void> => {
  if (!isSafari()) {
    return;
  }

  try {
    // Request any remaining data
    mediaRecorder.requestData();
    
    // Give Safari time to process the final chunk
    await new Promise(resolve => setTimeout(resolve, 150));
    
    console.log('Safari: Final chunk request completed');
  } catch (error) {
    console.warn('Safari final chunk request failed:', error);
  }
}; 