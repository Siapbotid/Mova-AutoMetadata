const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { ffmpegAvailable, ffmpeg } = require('./ffmpeg-config');

class FileUtils {
    constructor() {
        this.supportedImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'];
        this.supportedVideoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp'];
        this.supportedVectorExtensions = ['.svg', '.ai', '.eps', '.pdf'];
    }

    isImageFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.supportedImageExtensions.includes(ext);
    }

    isVideoFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.supportedVideoExtensions.includes(ext);
    }

    isVectorFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.supportedVectorExtensions.includes(ext);
    }

    async generateThumbnail(filePath, outputPath, size = 300) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            
            if (this.isVideoFile(filePath)) {
                return await this.generateVideoThumbnail(filePath, outputPath, size);
            } else if (this.isVectorFile(filePath)) {
                return await this.generateVectorThumbnail(filePath, outputPath, size);
            } else if (this.isImageFile(filePath)) {
                return await this.generateImageThumbnail(filePath, outputPath, size);
            } else {
                throw new Error(`Unsupported file type: ${ext}`);
            }
        } catch (error) {
            console.error(`Error generating thumbnail for ${path.basename(filePath)}:`, error);
            // Generate a placeholder thumbnail
            return await this.generatePlaceholderThumbnail(outputPath, size);
        }
    }

    async generateVideoThumbnail(filePath, outputPath, size = 300) {
        return new Promise((resolve, reject) => {
            if (!ffmpegAvailable) {
                console.warn('FFmpeg not available, cannot generate video thumbnail');
                return this.generatePlaceholderThumbnail(outputPath, size).then(resolve).catch(reject);
            }

            try {
                ffmpeg(filePath)
                    .screenshots({
                        timestamps: ['10%'],
                        filename: path.basename(outputPath),
                        folder: path.dirname(outputPath),
                        size: `${size}x${size}`
                    })
                    .on('end', () => {
                        console.log(`Video thumbnail generated: ${path.basename(outputPath)}`);
                        resolve(outputPath);
                    })
                    .on('error', (err) => {
                        console.error(`Error generating video thumbnail for ${path.basename(filePath)}:`, err);
                        // Fallback to placeholder
                        this.generatePlaceholderThumbnail(outputPath, size).then(resolve).catch(reject);
                    });
            } catch (error) {
                console.error(`FFmpeg error for ${path.basename(filePath)}:`, error);
                this.generatePlaceholderThumbnail(outputPath, size).then(resolve).catch(reject);
            }
        });
    }

    async generateVectorThumbnail(filePath, outputPath, size = 300) {
        try {
            // For vector files, we'll create a placeholder since Sharp doesn't handle SVG/AI/EPS well
            console.log(`Generating placeholder for vector file: ${path.basename(filePath)}`);
            return await this.generatePlaceholderThumbnail(outputPath, size, 'VECTOR');
        } catch (error) {
            console.error(`Error generating vector thumbnail for ${path.basename(filePath)}:`, error);
            return await this.generatePlaceholderThumbnail(outputPath, size);
        }
    }

    async generateImageThumbnail(filePath, outputPath, size = 300) {
        try {
            await sharp(filePath)
                .resize(size, size, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 80 })
                .toFile(outputPath);
            
            console.log(`Image thumbnail generated: ${path.basename(outputPath)}`);
            return outputPath;
        } catch (error) {
            console.error(`Error generating image thumbnail for ${path.basename(filePath)}:`, error);
            return await this.generatePlaceholderThumbnail(outputPath, size);
        }
    }

    async generatePlaceholderThumbnail(outputPath, size = 300, type = 'FILE') {
        try {
            // Create a simple colored rectangle as placeholder
            const color = type === 'VECTOR' ? '#FF6B6B' : type === 'VIDEO' ? '#4ECDC4' : '#95E1D3';
            
            await sharp({
                create: {
                    width: size,
                    height: size,
                    channels: 3,
                    background: color
                }
            })
            .jpeg({ quality: 80 })
            .toFile(outputPath);
            
            console.log(`Placeholder thumbnail generated: ${path.basename(outputPath)}`);
            return outputPath;
        } catch (error) {
            console.error(`Error generating placeholder thumbnail:`, error);
            throw error;
        }
    }

    async resizeImage(inputPath, maxWidth = 1024, maxHeight = 1024, quality = 85) {
        try {
            const tempPath = inputPath + '.temp.jpg';
            
            await sharp(inputPath)
                .resize(maxWidth, maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality })
                .toFile(tempPath);
            
            // Read the resized image as base64
            const resizedBuffer = fs.readFileSync(tempPath);
            const base64 = resizedBuffer.toString('base64');
            
            // Clean up temp file
            fs.unlinkSync(tempPath);
            
            return base64;
        } catch (error) {
            console.error(`Error resizing image ${path.basename(inputPath)}:`, error);
            throw error;
        }
    }

    getSupportedExtensions() {
        return [
            ...this.supportedImageExtensions,
            ...this.supportedVideoExtensions,
            ...this.supportedVectorExtensions
        ];
    }
}

module.exports = FileUtils;