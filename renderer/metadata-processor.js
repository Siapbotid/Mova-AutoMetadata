const fs = require('fs');
const path = require('path');

class MetadataProcessor {
    constructor(exiftool) {
        this.exiftool = exiftool;
    }

    async writeMetadata(filePath, analysis) {
        try {
            console.log(`Writing metadata to: ${path.basename(filePath)}`);
            
            // Debug: Log what we're about to write
            console.log('Writing metadata for:', path.basename(filePath));
            console.log('Description to write:', analysis.description);
            
            // Prepare metadata object
            const metadata = {
                Title: analysis.title,
                Description: analysis.description,
                Keywords: Array.isArray(analysis.keywords) ? analysis.keywords.join(', ') : analysis.keywords,
                Subject: Array.isArray(analysis.keywords) ? analysis.keywords.join(', ') : analysis.keywords,
                'XMP:Title': analysis.title,
                'XMP:Description': analysis.description,
                'XMP:Keywords': Array.isArray(analysis.keywords) ? analysis.keywords : [analysis.keywords],
                'XMP:Subject': Array.isArray(analysis.keywords) ? analysis.keywords : [analysis.keywords],
                'IPTC:ObjectName': analysis.title,
                'IPTC:Caption-Abstract': analysis.description,
                'IPTC:Keywords': Array.isArray(analysis.keywords) ? analysis.keywords : [analysis.keywords]
            };
            
            console.log('Metadata to write:', metadata);
            
            // Write metadata using ExifTool
            await this.exiftool.write(filePath, metadata);
            
            console.log(`Successfully wrote metadata to: ${path.basename(filePath)}`);
            
            // Clean up backup files created by ExifTool
            await this.cleanupBackupFiles(filePath);
            
        } catch (error) {
            console.error(`Error writing metadata to ${path.basename(filePath)}:`, error);
            throw error;
        }
    }

    async cleanupBackupFiles(filePath) {
        try {
            // ExifTool creates backup files with _original suffix
            const backupExtensions = ['_original', '.original', '_backup'];
            const dir = path.dirname(filePath);
            const baseName = path.basename(filePath, path.extname(filePath));
            const ext = path.extname(filePath);
            
            for (const backupExt of backupExtensions) {
                const backupPath = path.join(dir, `${baseName}${backupExt}${ext}`);
                if (fs.existsSync(backupPath)) {
                    try {
                        fs.unlinkSync(backupPath);
                        console.log(`Cleaned up backup file: ${path.basename(backupPath)}`);
                    } catch (cleanupError) {
                        console.warn(`Could not clean up backup file ${path.basename(backupPath)}:`, cleanupError.message);
                    }
                }
            }
            
            // Also check for files without extension backup
            const backupPathNoExt = `${filePath}_original`;
            if (fs.existsSync(backupPathNoExt)) {
                try {
                    fs.unlinkSync(backupPathNoExt);
                    console.log(`Cleaned up backup file: ${path.basename(backupPathNoExt)}`);
                } catch (cleanupError) {
                    console.warn(`Could not clean up backup file ${path.basename(backupPathNoExt)}:`, cleanupError.message);
                }
            }
            
        } catch (error) {
            console.warn(`Error during backup cleanup for ${path.basename(filePath)}:`, error.message);
            // Don't throw error as this is not critical
        }
    }
}

module.exports = MetadataProcessor;