class ProgressManager {
    constructor() {
        this.startTime = null;
        this.processedCount = 0;
        this.totalCount = 0;
        this.lastUpdateTime = Date.now();
        this.processingRates = [];
        this.maxRateHistory = 10;
    }

    updateProgress(current, total, status = 'Processing') {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        const progressContainer = document.querySelector('.progress-container');
        
        // Update progress fill
        document.getElementById('progressFill').style.width = `${percentage}%`;
        
        // Update text elements
        document.getElementById('progressText').textContent = `${current}/${total} Media`;
        document.getElementById('progressPercentage').textContent = `${Math.round(percentage)}%`;
        document.getElementById('progressStatus').textContent = status;
        
        // Update container class based on status
        progressContainer.className = 'progress-container';
        if (current >= total) {
            progressContainer.classList.add('completed');
            document.getElementById('progressStatus').textContent = 'Completed';
        } else {
            progressContainer.classList.add('processing');
        }
        
        // Update progress stats
        this.updateProgressStats(current, total);
    }

    updateProgressStats(current, total) {
        const now = Date.now();
        
        // Initialize start time on first call
        if (!this.startTime) {
            this.startTime = now;
            this.lastUpdateTime = now;
            return;
        }
        
        // Calculate elapsed time and processing rate
        const elapsed = (now - this.startTime) / 1000; // seconds
        const timeSinceLastUpdate = (now - this.lastUpdateTime) / 1000;
        
        if (timeSinceLastUpdate >= 1 && current > 0) { // Update every second
            // Calculate speed (files per minute)
            const speedPerSecond = current / elapsed;
            const speedPerMinute = Math.round(speedPerSecond * 60);
            
            // Update speed display
            document.getElementById('progressSpeed').textContent = `${speedPerMinute} files/min`;
            
            // Calculate ETA
            const remaining = total - current;
            if (speedPerSecond > 0 && remaining > 0) {
                const etaSeconds = remaining / speedPerSecond;
                const etaMinutes = Math.floor(etaSeconds / 60);
                const etaSecondsRemainder = Math.floor(etaSeconds % 60);
                document.getElementById('progressETA').textContent = 
                    `ETA: ${etaMinutes}:${etaSecondsRemainder.toString().padStart(2, '0')}`;
            } else {
                document.getElementById('progressETA').textContent = 'ETA: --';
            }
            
            this.lastUpdateTime = now;
        }
    }

    resetProgressStats() {
        this.startTime = null;
        this.lastUpdateTime = null;
        
        // Reset display elements
        document.getElementById('progressETA').textContent = 'ETA: --';
        document.getElementById('progressSpeed').textContent = '-- files/min';
        document.getElementById('progressStatus').textContent = 'Ready';
        document.querySelector('.progress-container').className = 'progress-container';
    }

    hideProgress() {
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
        this.resetProgressStats();
    }
}

module.exports = ProgressManager;