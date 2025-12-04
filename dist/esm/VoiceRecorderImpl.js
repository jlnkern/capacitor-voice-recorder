import write_blob from 'capacitor-blob-writer';
import { RecordingStatus } from './definitions';
import { alreadyRecordingError, couldNotQueryPermissionStatusError, deviceCannotVoiceRecordError, emptyRecordingError, failedToFetchRecordingError, failedToRecordError, failureResponse, missingPermissionError, recordingHasNotStartedError, successResponse, } from './predefined-web-responses';
import { handleChunk, createBlob } from './audio-helpers';
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
export class VoiceRecorderImpl {
    constructor() {
        this.mediaRecorder = null;
        this.chunks = [];
        this.pendingResult = neverResolvingPromise();
        this.safariDataInterval = null;
        this.errorMessage = null;
    }
    static async canDeviceVoiceRecord() {
        var _a;
        if (((_a = navigator === null || navigator === void 0 ? void 0 : navigator.mediaDevices) === null || _a === void 0 ? void 0 : _a.getUserMedia) == null || VoiceRecorderImpl.getSupportedMimeType() == null) {
            return failureResponse();
        }
        else {
            return successResponse();
        }
    }
    async startRecording(options) {
        this.resetErrorMessage();
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
        this.chunks = [];
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
        if ((MediaRecorder === null || MediaRecorder === void 0 ? void 0 : MediaRecorder.isTypeSupported) == null)
            return null;
        const foundSupportedType = Object.keys(POSSIBLE_MIME_TYPES).find((type) => MediaRecorder.isTypeSupported(type));
        return foundSupportedType !== null && foundSupportedType !== void 0 ? foundSupportedType : null;
    }
    onSuccessfullyStartedRecording(stream, options) {
        this.pendingResult = new Promise((resolve, reject) => {
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.onerror = (event) => {
                this.addErrorMessage('MediaRecorder error:', event, true);
                this.prepareInstanceForNextOperation();
                reject(failedToRecordError());
            };
            this.mediaRecorder.onstop = async () => {
                var _a, _b, _c, _d;
                console.log('media recorder stopped');
                try {
                    console.log('Final data request in onstop handler');
                    (_a = this.mediaRecorder) === null || _a === void 0 ? void 0 : _a.requestData();
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                catch (error) {
                    this.addErrorMessage('Final data request in onstop failed:', error, true);
                }
                const mimeType = VoiceRecorderImpl.getSupportedMimeType();
                if (mimeType == null) {
                    this.prepareInstanceForNextOperation();
                    reject(failedToFetchRecordingError());
                    return;
                }
                if (this.chunks.length === 0) {
                    this.addErrorMessage('No chunks available for recording', true);
                    this.prepareInstanceForNextOperation();
                    reject(emptyRecordingError());
                    return;
                }
                console.log('Processing', this.chunks.length, 'chunks for final blob');
                let firstChunk = this.chunks[0];
                const blobVoiceRecording = createBlob(this.chunks, firstChunk.type);
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
                    const subDirectory = (_d = (_c = (_b = options.subDirectory) === null || _b === void 0 ? void 0 : _b.match(/^\/?(.+[^/])\/?$/)) === null || _c === void 0 ? void 0 : _c[1]) !== null && _d !== void 0 ? _d : '';
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
                const recordingDuration = 1;
                console.log('line 203');
                this.prepareInstanceForNextOperation();
                console.log('line 205');
                resolve({ value: { recordDataBase64, mimeType, msDuration: recordingDuration * 1000, path } });
            };
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('ondataavailable', event);
                if (event.data && event.data.size > 0) {
                    this.chunks = handleChunk(event.data, this.chunks);
                }
            };
            this.chunks = [];
            // Request data more frequently to avoid chunk loss
            const timeslice = 1000; // Request data every second in Safari
            this.mediaRecorder.start(timeslice);
            // Additional safety mechanism for longer recordings
            this.safariDataInterval = window.setInterval(() => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    try {
                        this.mediaRecorder.requestData();
                    }
                    catch (error) {
                        this.addErrorMessage('Data request failed:', error, true);
                    }
                }
            }, 2000); // Request data every 2 seconds as additional safety
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
                this.addErrorMessage('While trying to stop a media recorder, an error was thrown' + error.message, true);
            }
        }
        // Clear data interval
        if (this.safariDataInterval) {
            clearInterval(this.safariDataInterval);
            this.safariDataInterval = null;
        }
        this.pendingResult = neverResolvingPromise();
        this.mediaRecorder = null;
        // this.chunks = [];
    }
    addErrorMessage(message, error, isWarning = false) {
        if (message == null) {
            message = '';
        }
        if (error instanceof Error) {
            message += ' ' + error.message;
        }
        if (isWarning) {
            this.errorMessage += `[WARNING] ${message}`;
            console.warn(message);
        }
        else {
            this.errorMessage += `[ERROR] ${message}`;
            console.error(message);
        }
    }
    resetErrorMessage() {
        this.errorMessage = null;
    }
    getErrorMessage() {
        return this.errorMessage;
    }
}
//# sourceMappingURL=VoiceRecorderImpl.js.map