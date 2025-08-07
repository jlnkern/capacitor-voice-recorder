'use strict';

var core = require('@capacitor/core');
var write_blob = require('capacitor-blob-writer');

const RecordingStatus = {
    RECORDING: 'RECORDING',
    PAUSED: 'PAUSED',
    NONE: 'NONE',
};

const VoiceRecorder = core.registerPlugin('VoiceRecorder', {
    web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.VoiceRecorderWeb()),
});

const successResponse = () => ({ value: true });
const failureResponse = () => ({ value: false });
const missingPermissionError = () => new Error('MISSING_PERMISSION');
const alreadyRecordingError = () => new Error('ALREADY_RECORDING');
const deviceCannotVoiceRecordError = () => new Error('DEVICE_CANNOT_VOICE_RECORD');
const failedToRecordError = () => new Error('FAILED_TO_RECORD');
const emptyRecordingError = () => new Error('EMPTY_RECORDING');
const recordingHasNotStartedError = () => new Error('RECORDING_HAS_NOT_STARTED');
const failedToFetchRecordingError = () => new Error('FAILED_TO_FETCH_RECORDING');
const couldNotQueryPermissionStatusError = () => new Error('COULD_NOT_QUERY_PERMISSION_STATUS');

/**
 * Safari-specific helper functions to handle MediaRecorder limitations
 */
const isSafari = () => {
    return true;
    //   return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};
/**
 * Safari-specific chunk handling to prevent data loss
 */
const handleSafariChunk = (chunk, existingChunks) => {
    // Safari-specific: Validate chunk before adding
    if (chunk && chunk.size > 0) {
        // Safari sometimes sends empty or corrupted chunks
        try {
            // Additional validation for Safari
            if (chunk.type && chunk.type.startsWith('audio/')) {
                console.log('Safari: Adding valid chunk with size:', chunk.size);
                return [...existingChunks, chunk];
            }
        }
        catch (error) {
            console.warn('Safari chunk validation failed:', error);
        }
    }
    else {
        console.warn('Safari: Received empty or invalid chunk');
    }
    return existingChunks;
};
/**
 * Safari-specific blob creation with fallback
 */
const createSafariBlob = (chunks, mimeType) => {
    console.log('Safari: Creating blob from', chunks.length, 'chunks');
    // Safari-specific: Use fallback mime type if primary fails
    try {
        const blob = new Blob(chunks, { type: mimeType });
        console.log('Safari: Blob created successfully with size:', blob.size);
        return blob;
    }
    catch (error) {
        console.warn('Safari blob creation failed with primary mime type, trying fallback');
        const fallbackBlob = new Blob(chunks, { type: 'audio/webm' });
        console.log('Safari: Fallback blob created with size:', fallbackBlob.size);
        return fallbackBlob;
    }
};

// import getBlobDuration from 'get-blob-duration';
// these mime types will be checked one by one in order until one of them is found to be supported by the current browser
const POSSIBLE_MIME_TYPES = {
    'audio/aac': '.aac',
    'audio/mp4': '.mp3',
    'audio/webm;codecs=opus': '.ogg',
    'audio/webm': '.ogg',
    'audio/ogg;codecs=opus': '.ogg',
};
const neverResolvingPromise = () => new Promise(() => undefined);
class VoiceRecorderImpl {
    constructor() {
        this.mediaRecorder = null;
        this.chunks = [];
        this.pendingResult = neverResolvingPromise();
        this.isSafariBrowser = isSafari();
        this.safariDataInterval = null;
    }
    static async canDeviceVoiceRecord() {
        var _a;
        if (((_a = navigator === null || navigator === undefined ? undefined : navigator.mediaDevices) === null || _a === undefined ? undefined : _a.getUserMedia) == null || VoiceRecorderImpl.getSupportedMimeType() == null) {
            return failureResponse();
        }
        else {
            return successResponse();
        }
    }
    async startRecording(options) {
        if (this.mediaRecorder != null) {
            throw alreadyRecordingError();
        }
        const deviceCanRecord = await VoiceRecorderImpl.canDeviceVoiceRecord();
        if (!deviceCanRecord.value) {
            throw deviceCannotVoiceRecordError();
        }
        const havingPermission = await VoiceRecorderImpl.hasAudioRecordingPermission().catch(() => successResponse());
        if (!havingPermission.value) {
            throw missingPermissionError();
        }
        return navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => this.onSuccessfullyStartedRecording(stream, options))
            .catch(this.onFailedToStartRecording.bind(this));
    }
    async stopRecording() {
        console.log('stopRecording');
        if (this.mediaRecorder == null) {
            throw recordingHasNotStartedError();
        }
        try {
            // Safari-specific: Clear any ongoing data interval
            if (this.safariDataInterval) {
                clearInterval(this.safariDataInterval);
                this.safariDataInterval = null;
            }
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
            return this.pendingResult;
        }
        catch (ignore) {
            throw failedToFetchRecordingError();
        }
        finally {
            this.prepareInstanceForNextOperation();
        }
    }
    static async hasAudioRecordingPermission() {
        if (navigator.permissions.query == null) {
            if (navigator.mediaDevices == null) {
                return Promise.reject(couldNotQueryPermissionStatusError());
            }
            return navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then(() => successResponse())
                .catch(() => {
                throw couldNotQueryPermissionStatusError();
            });
        }
        return navigator.permissions
            .query({ name: 'microphone' })
            .then((result) => ({ value: result.state === 'granted' }))
            .catch(() => {
            throw couldNotQueryPermissionStatusError();
        });
    }
    static async requestAudioRecordingPermission() {
        const havingPermission = await VoiceRecorderImpl.hasAudioRecordingPermission().catch(() => failureResponse());
        if (havingPermission.value) {
            return successResponse();
        }
        return navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then(() => successResponse())
            .catch(() => failureResponse());
    }
    pauseRecording() {
        if (this.mediaRecorder == null) {
            throw recordingHasNotStartedError();
        }
        else if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            return Promise.resolve(successResponse());
        }
        else {
            return Promise.resolve(failureResponse());
        }
    }
    resumeRecording() {
        if (this.mediaRecorder == null) {
            throw recordingHasNotStartedError();
        }
        else if (this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            return Promise.resolve(successResponse());
        }
        else {
            return Promise.resolve(failureResponse());
        }
    }
    getCurrentStatus() {
        if (this.mediaRecorder == null) {
            return Promise.resolve({ status: RecordingStatus.NONE });
        }
        else if (this.mediaRecorder.state === 'recording') {
            return Promise.resolve({ status: RecordingStatus.RECORDING });
        }
        else if (this.mediaRecorder.state === 'paused') {
            return Promise.resolve({ status: RecordingStatus.PAUSED });
        }
        else {
            return Promise.resolve({ status: RecordingStatus.NONE });
        }
    }
    static getSupportedMimeType() {
        if ((MediaRecorder === null || MediaRecorder === undefined ? undefined : MediaRecorder.isTypeSupported) == null)
            return null;
        const foundSupportedType = Object.keys(POSSIBLE_MIME_TYPES).find((type) => MediaRecorder.isTypeSupported(type));
        return foundSupportedType !== null && foundSupportedType !== undefined ? foundSupportedType : null;
    }
    onSuccessfullyStartedRecording(stream, options) {
        this.pendingResult = new Promise((resolve, reject) => {
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                this.prepareInstanceForNextOperation();
                reject(failedToRecordError());
            };
            this.mediaRecorder.onstop = async () => {
                var _a, _b, _c, _d;
                console.log('media recorder stopped');
                // // Safari-specific: Ensure final chunk is captured before stopping
                // if (this.isSafariBrowser && this.mediaRecorder) {
                //   await ensureFinalChunk(this.mediaRecorder);
                // }
                // Safari-specific: One more final data request to catch any remaining chunks
                if (this.isSafariBrowser) {
                    try {
                        console.log('Safari: Final data request in onstop handler');
                        (_a = this.mediaRecorder) === null || _a === void 0 ? void 0 : _a.requestData();
                        // Give Safari time to process any final chunks
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    catch (error) {
                        console.warn('Safari final data request in onstop failed:', error);
                    }
                }
                const mimeType = VoiceRecorderImpl.getSupportedMimeType();
                if (mimeType == null) {
                    this.prepareInstanceForNextOperation();
                    reject(failedToFetchRecordingError());
                    return;
                }
                // Safari-specific: Ensure we have chunks before creating blob
                if (this.chunks.length === 0) {
                    console.warn('No chunks available for Safari recording');
                    this.prepareInstanceForNextOperation();
                    reject(emptyRecordingError());
                    return;
                }
                console.log('Safari: Processing', this.chunks.length, 'chunks for final blob');
                let firstChunk = this.chunks[0];
                const blobVoiceRecording = createSafariBlob(this.chunks, firstChunk.type);
                console.log('blobVoiceRecording', blobVoiceRecording);
                if (blobVoiceRecording.size <= 0) {
                    this.prepareInstanceForNextOperation();
                    reject(emptyRecordingError());
                    return;
                }
                console.log('line 181');
                let path;
                let recordDataBase64;
                if (options != null) {
                    const subDirectory = (_d = (_c = (_b = options.subDirectory) === null || _b === undefined ? undefined : _b.match(/^\/?(.+[^/])\/?$/)) === null || _c === undefined ? undefined : _c[1]) !== null && _d !== undefined ? _d : '';
                    path = `${subDirectory}/recording-${new Date().getTime()}${POSSIBLE_MIME_TYPES[mimeType]}`;
                    await write_blob({
                        blob: blobVoiceRecording,
                        directory: options.directory,
                        fast_mode: true,
                        path,
                        recursive: true,
                    });
                }
                else {
                    console.log('line 196');
                    recordDataBase64 = await VoiceRecorderImpl.blobToBase64(blobVoiceRecording);
                }
                console.log('line 200');
                // const recordingDuration = await getBlobDuration(blobVoiceRecording);
                // console.log('recording duration', recordingDuration);
                const recordingDuration = 1;
                console.log('line 203');
                this.prepareInstanceForNextOperation();
                console.log('line 205');
                resolve({ value: { recordDataBase64, blobVoiceRecording, mimeType, msDuration: recordingDuration * 1000, path } });
            };
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('ondataavailable', event);
                if (event.data && event.data.size > 0) {
                    this.chunks = handleSafariChunk(event.data, this.chunks);
                }
            };
            // Safari-specific handling: Request data more frequently to avoid chunk loss
            const timeslice = this.isSafariBrowser ? 1000 : undefined; // Request data every second in Safari
            this.mediaRecorder.start(timeslice);
            // Safari-specific: Additional safety mechanism for longer recordings
            if (this.isSafariBrowser) {
                this.safariDataInterval = window.setInterval(() => {
                    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                        try {
                            // Force data availability in Safari
                            this.mediaRecorder.requestData();
                        }
                        catch (error) {
                            console.warn('Safari data request failed:', error);
                        }
                    }
                }, 2000); // Request data every 2 seconds as additional safety
            }
            console.log('started recording');
        });
        return successResponse();
    }
    onFailedToStartRecording() {
        this.prepareInstanceForNextOperation();
        throw failedToRecordError();
    }
    static blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const recordingResult = String(reader.result);
                const splitResult = recordingResult.split('base64,');
                const toResolve = splitResult.length > 1 ? splitResult[1] : recordingResult;
                resolve(toResolve.trim());
            };
            reader.readAsDataURL(blob);
        });
    }
    prepareInstanceForNextOperation() {
        if (this.mediaRecorder != null && this.mediaRecorder.state === 'recording') {
            try {
                this.mediaRecorder.stop();
            }
            catch (error) {
                console.warn('While trying to stop a media recorder, an error was thrown', error);
            }
        }
        // Safari-specific: Clear data interval
        if (this.safariDataInterval) {
            clearInterval(this.safariDataInterval);
            this.safariDataInterval = null;
        }
        this.pendingResult = neverResolvingPromise();
        this.mediaRecorder = null;
        // this.chunks = [];
    }
}

class VoiceRecorderWeb extends core.WebPlugin {
    constructor() {
        super(...arguments);
        this.voiceRecorderInstance = new VoiceRecorderImpl();
    }
    canDeviceVoiceRecord() {
        return VoiceRecorderImpl.canDeviceVoiceRecord();
    }
    hasAudioRecordingPermission() {
        return VoiceRecorderImpl.hasAudioRecordingPermission();
    }
    requestAudioRecordingPermission() {
        return VoiceRecorderImpl.requestAudioRecordingPermission();
    }
    startRecording(options) {
        return this.voiceRecorderInstance.startRecording(options);
    }
    stopRecording() {
        return this.voiceRecorderInstance.stopRecording();
    }
    pauseRecording() {
        return this.voiceRecorderInstance.pauseRecording();
    }
    resumeRecording() {
        return this.voiceRecorderInstance.resumeRecording();
    }
    getCurrentStatus() {
        return this.voiceRecorderInstance.getCurrentStatus();
    }
}

var web = /*#__PURE__*/Object.freeze({
    __proto__: null,
    VoiceRecorderWeb: VoiceRecorderWeb
});

exports.RecordingStatus = RecordingStatus;
exports.VoiceRecorder = VoiceRecorder;
//# sourceMappingURL=plugin.cjs.js.map
