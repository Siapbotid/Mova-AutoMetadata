const fs = require('fs');
const path = require('path');

class CSVManager {
    constructor(exiftool) {
        this.exiftool = exiftool;
    }

    async removeExistingCSVFiles(selectedFiles) {
        try {
            // Get the first selected file to determine the directory
            if (selectedFiles.length > 0) {
                const firstFile = selectedFiles[0];
                const sourceDir = path.dirname(firstFile);
                const successDir = path.join(sourceDir, 'success');
                const csvDir = path.join(successDir, 'CSV');
                
                // Only remove metadata CSV (shutterstock.csv is no longer generated)
                const metadataPath = path.join(csvDir, 'metadata.csv');
                
                if (fs.existsSync(metadataPath)) {
                    fs.unlinkSync(metadataPath);
                    console.log('Removed existing metadata.csv');
                }
            }
        } catch (error) {
            console.error('Error removing existing CSV files:', error);
        }
    }
    
    async generateCSVFiles(successDir) {
        try {
            // Create CSV directory if it doesn't exist
            const csvDir = path.join(successDir, 'CSV');
            if (!fs.existsSync(csvDir)) {
                fs.mkdirSync(csvDir, { recursive: true });
            }
            
            // Initialize metadata CSV file with headers if it doesn't exist
            const metadataPath = path.join(csvDir, 'metadata.csv');
            
            // Get all files in the success directory (excluding the CSV directory)
            const files = fs.readdirSync(successDir)
                .filter(file => {
                    const filePath = path.join(successDir, file);
                    return fs.statSync(filePath).isFile() && !file.endsWith('.csv'); // Only include media files, not CSV files
                })
                .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())); // Sort alphabetically
            
            // Recreate the CSV file completely to avoid duplicates
            let csvContent = 'Filename,Title,Description,Keywords\n';
            
            // Process all files in the success directory
            for (const file of files) {
                const filePath = path.join(successDir, file);
                
                try {
                    // Read metadata from the file
                    const metadata = await this.exiftool.read(filePath);
                    
                    // Extract relevant data
                    const filename = path.basename(filePath);
                    const title = metadata.Title || '';
                    const description = metadata.Description || '';
                    const keywords = metadata.Keywords || '';
                    
                    // Escape fields for CSV (handle commas, quotes, etc.)
                    const escapedFilename = this.escapeCSV(filename);
                    const escapedTitle = this.escapeCSV(title);
                    const escapedDescription = this.escapeCSV(description);
                    
                    // Debug: Log what we're writing to CSV
                    console.log('CSV - Writing description:', escapedDescription);
                    
                    const escapedKeywords = this.escapeCSV(keywords);
                    
                    // Add to CSV content
                    csvContent += `${escapedFilename},${escapedTitle},${escapedDescription},${escapedKeywords}\n`;
                    
                } catch (error) {
                    console.error(`Error processing metadata for CSV: ${file}`, error);
                    // Continue with other files even if one fails
                }
            }
            
            // Write the complete CSV file (this replaces any existing file)
            fs.writeFileSync(metadataPath, csvContent);
            
            console.log(`Generated metadata.csv with ${files.length} entries in ${csvDir}`);
            
        } catch (error) {
            console.error('Error generating CSV files:', error);
            // Don't throw error to avoid breaking the main process
        }
    }
    
    async appendToCSV(processedFiles, successDir, analysisData = null) {
        try {
            console.log('DEBUG: appendToCSV called with:', processedFiles.length, 'files');
            console.log('DEBUG: successDir:', successDir);
            
            // Create CSV directory if it doesn't exist
            const csvDir = path.join(successDir, 'CSV');
            console.log('DEBUG: csvDir path:', csvDir);
            
            if (!fs.existsSync(csvDir)) {
                fs.mkdirSync(csvDir, { recursive: true });
                console.log('DEBUG: Created CSV directory');
            }
            
            const metadataPath = path.join(csvDir, 'metadata.csv');
            console.log('DEBUG: CSV file path:', metadataPath);
            
            // Initialize CSV file with headers if it doesn't exist
            if (!fs.existsSync(metadataPath)) {
                fs.writeFileSync(metadataPath, 'Filename,Title,Description,Keywords\n');
                console.log('Created new metadata.csv with headers');
            }
            
            let csvContent = '';
            
            // Process only the newly completed files
            for (const filePath of processedFiles) {
                try {
                    const filename = path.basename(filePath);
                    let title = '';
                    let description = '';
                    let keywords = '';
                    
                    // For single file processing with analysis data, use it directly
                    if (analysisData && processedFiles.length === 1) {
                        title = analysisData.title || '';
                        description = analysisData.description || '';
                        keywords = Array.isArray(analysisData.keywords) ? 
                            analysisData.keywords.join(', ') : 
                            (analysisData.keywords || '');
                    } else {
                        // For batch processing or when no analysis data, read from file
                        const metadata = await this.exiftool.read(filePath);
                        title = metadata.Title || '';
                        description = metadata.Description || '';
                        keywords = metadata.Keywords || '';
                    }
                    
                    // Escape fields for CSV (handle commas, quotes, etc.)
                    const escapedFilename = this.escapeCSV(filename);
                    const escapedTitle = this.escapeCSV(title);
                    const escapedDescription = this.escapeCSV(description);
                    const escapedKeywords = this.escapeCSV(keywords);
                    
                    // Add to CSV content
                    csvContent += `${escapedFilename},${escapedTitle},${escapedDescription},${escapedKeywords}\n`;
                    
                } catch (error) {
                    console.error(`Error processing metadata for CSV: ${path.basename(filePath)}`, error);
                    // Continue with other files even if one fails
                }
            }
            
            // Append the new entries to the CSV file
            if (csvContent) {
                fs.appendFileSync(metadataPath, csvContent);
                console.log(`Appended ${processedFiles.length} entries to metadata.csv`);
            }
            
        } catch (error) {
            console.error('Error appending to CSV file:', error);
            // Don't throw error to avoid breaking the main process
        }
    }
    
    // Helper method to escape CSV fields
    escapeCSV(field) {
        if (field === null || field === undefined) {
            return '';
        }
        
        const stringField = String(field);
        // If the field contains commas, quotes, or newlines, wrap it in quotes
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            // Double up any quotes within the field
            return '"' + stringField.replace(/"/g, '""') + '"';
        }
        return stringField;
    }
}

module.exports = CSVManager;