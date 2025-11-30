const fs = require('fs');
const path = require('path');

function resolveAsarPath(p) {
    if (!p) return p;
    if (p.includes('app.asar')) {
        const unpackedPath = p.replace('app.asar', 'app.asar.unpacked');
        if (fs.existsSync(unpackedPath)) {
            return unpackedPath;
        }
    }
    return p;
}

class FFmpegConfig {
    constructor() {
        this.ffmpegPath = null;
        this.ffprobePath = null;
        this.ffmpegAvailable = false;
        this.ffmpeg = null;
        
        this.initialize();
    }

    initialize() {
        try {
            // Check if we're in development or production
            const isDev = process.env.NODE_ENV === 'development' || !process.resourcesPath;
            
            console.log('=== FFmpeg Detection Debug ===');
            console.log('NODE_ENV:', process.env.NODE_ENV);
            console.log('process.resourcesPath:', process.resourcesPath);
            console.log('isDev:', isDev);
            console.log('process.execPath:', process.execPath);
            
            // Try development mode first (ffmpeg-static/ffprobe-static)
            let foundInDev = false;
            try {
                this.ffmpegPath = require('ffmpeg-static');
                this.ffprobePath = require('ffprobe-static').path;
                console.log('Development ffmpegPath:', this.ffmpegPath);
                console.log('Development ffprobePath:', this.ffprobePath);
                this.ffmpegPath = resolveAsarPath(this.ffmpegPath);
                this.ffprobePath = resolveAsarPath(this.ffprobePath);
                console.log('Resolved development ffmpegPath:', this.ffmpegPath);
                console.log('Resolved development ffprobePath:', this.ffprobePath);
                
                // Verify files exist
                if (fs.existsSync(this.ffmpegPath) && fs.existsSync(this.ffprobePath)) {
                    this.ffmpegAvailable = true;
                    foundInDev = true;
                    console.log('Development mode: FFmpeg and ffprobe found successfully');
                }
            } catch (devError) {
                console.warn('Development mode: Failed to load ffmpeg-static or ffprobe-static:', devError.message);
            }
            
            // If development mode failed, try production mode (bundled executables)
            if (!foundInDev) {
                console.log('Trying production mode: Looking for bundled FFmpeg and ffprobe...');
                
                // Reset paths
                this.ffmpegPath = null;
                this.ffprobePath = null;
                
                // Try to find bundled FFmpeg and ffprobe
                const possibleFFmpegPaths = [
                    path.join(process.resourcesPath, 'ffmpeg.exe'),
                    path.join(path.dirname(process.execPath), 'resources', 'ffmpeg.exe'),
                    path.join(process.resourcesPath, '..', 'ffmpeg.exe'),
                    path.join(path.dirname(process.execPath), 'ffmpeg.exe')
                ];
                
                const possibleFFprobePaths = [
                    path.join(process.resourcesPath, 'ffprobe.exe'),
                    path.join(path.dirname(process.execPath), 'resources', 'ffprobe.exe'),
                    path.join(process.resourcesPath, '..', 'ffprobe.exe'),
                    path.join(path.dirname(process.execPath), 'ffprobe.exe')
                ];
                
                console.log('Checking FFmpeg paths:', possibleFFmpegPaths);
                console.log('Checking ffprobe paths:', possibleFFprobePaths);
                
                // Find FFmpeg
                for (const testPath of possibleFFmpegPaths) {
                    console.log('Testing FFmpeg path:', testPath, 'exists:', fs.existsSync(testPath));
                    if (fs.existsSync(testPath)) {
                        this.ffmpegPath = testPath;
                        console.log('Found bundled FFmpeg at:', testPath);
                        break;
                    }
                }
                
                // Find ffprobe
                for (const testPath of possibleFFprobePaths) {
                    console.log('Testing ffprobe path:', testPath, 'exists:', fs.existsSync(testPath));
                    if (fs.existsSync(testPath)) {
                        this.ffprobePath = testPath;
                        console.log('Found bundled ffprobe at:', testPath);
                        break;
                    }
                }
                
                // Both are required
                if (this.ffmpegPath && this.ffprobePath) {
                    this.ffmpegAvailable = true;
                    console.log('Production mode: Both FFmpeg and ffprobe found successfully');
                } else {
                    console.warn('Production mode: FFmpeg or ffprobe not found in packaged app. Video processing will be disabled.');
                    console.warn('FFmpeg found:', !!this.ffmpegPath, 'at:', this.ffmpegPath);
                    console.warn('ffprobe found:', !!this.ffprobePath, 'at:', this.ffprobePath);
                }
            }
        } catch (error) {
            console.warn('FFmpeg setup failed:', error.message);
            console.error('FFmpeg setup error details:', error);
            this.ffmpegAvailable = false;
        }

        console.log('=== Final FFmpeg Status ===');
        console.log('ffmpegAvailable:', this.ffmpegAvailable);
        console.log('ffmpegPath:', this.ffmpegPath);
        console.log('ffprobePath:', this.ffprobePath);

        // Only set up fluent-ffmpeg if both FFmpeg and ffprobe are available
        if (this.ffmpegAvailable) {
            try {
                this.ffmpeg = require('fluent-ffmpeg');
                this.ffmpeg.setFfmpegPath(this.ffmpegPath);
                this.ffmpeg.setFfprobePath(this.ffprobePath);
                console.log('FFmpeg configured successfully with path:', this.ffmpegPath);
                console.log('ffprobe configured successfully with path:', this.ffprobePath);
            } catch (error) {
                console.warn('Failed to configure fluent-ffmpeg:', error.message);
                this.ffmpegAvailable = false;
            }
        }
    }

    isAvailable() {
        return this.ffmpegAvailable;
    }

    getFFmpeg() {
        return this.ffmpeg;
    }

    getFFmpegPath() {
        return this.ffmpegPath;
    }

    getFFprobePath() {
        return this.ffprobePath;
    }
}

// Create singleton instance
const ffmpegConfig = new FFmpegConfig();

module.exports = {
    ffmpegConfig,
    ffmpegAvailable: ffmpegConfig.isAvailable(),
    ffmpeg: ffmpegConfig.getFFmpeg(),
    ffmpegPath: ffmpegConfig.getFFmpegPath(),
    ffprobePath: ffmpegConfig.getFFprobePath()
};