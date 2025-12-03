export const handleChunk = (chunk, existingChunks) => {
    if (chunk && chunk.size > 0) {
        try {
            if (chunk.type && chunk.type.startsWith('audio/')) {
                console.log('Adding valid chunk with size:', chunk.size);
                return [...existingChunks, chunk];
            }
        }
        catch (error) {
            console.warn('Chunk validation failed:', error);
        }
    }
    else {
        console.warn('Received empty or invalid chunk');
    }
    return existingChunks;
};
export const createBlob = (chunks, mimeType) => {
    console.log('Creating blob from', chunks.length, 'chunks');
    try {
        const blob = new Blob(chunks, { type: mimeType });
        console.log('Blob created successfully with size:', blob.size);
        return blob;
    }
    catch (error) {
        console.warn('Blob creation failed with primary mime type, trying fallback');
        const fallbackBlob = new Blob(chunks, { type: 'audio/webm' });
        console.log('Fallback blob created with size:', fallbackBlob.size);
        return fallbackBlob;
    }
};
export const ensureFinalChunk = async (mediaRecorder) => {
    try {
        mediaRecorder.requestData();
        await new Promise(resolve => setTimeout(resolve, 150));
        console.log('Final chunk request completed');
    }
    catch (error) {
        console.warn('Final chunk request failed:', error);
    }
};
//# sourceMappingURL=audio-helpers.js.map