/**
 * Mobile Barcode Scanner functionality for Alchemy Barcode Scanner
 * Uses QuaggaJS for scanning barcodes on mobile devices
 */

// Scanner-related DOM elements
let scannerModal;
let scannerStatus;
let addCodeBtn;
let barcodeResult;
let detectedCodeElement;
let useDetectedCodeBtn;
let scanAnotherBtn;
let manualBarcodeInput;
let manualBarcodeBtn;
let closeBtn;

// Scanner state
let isScanning = false;
let scannerInitialized = false;
let lastDetectedCode = null;
let detectionConfidence = 0;
let scannerStreams = [];
let scannerMediaStream = null;
let locksDetections = false;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize scanner elements
    scannerModal = document.getElementById('mobileScannerModal');
    scannerStatus = document.getElementById('scanner-status');
    addCodeBtn = document.getElementById('add-code-btn');
    barcodeResult = document.getElementById('barcode-result');
    detectedCodeElement = document.getElementById('detected-code');
    useDetectedCodeBtn = document.getElementById('use-detected-code-btn');
    scanAnotherBtn = document.getElementById('scan-another-btn');
    manualBarcodeInput = document.getElementById('manual-barcode-input');
    manualBarcodeBtn = document.getElementById('manual-barcode-btn');
    closeBtn = document.getElementById('close-scanner-btn');
    
    // Only setup scanner on mobile devices
    const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobileDevice && scannerModal) {
        // Setup scanner when modal is shown
        scannerModal.addEventListener('shown.bs.modal', initScanner);
        scannerModal.addEventListener('hidden.bs.modal', stopScanner);
        
        // Close button handler
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                // Close the modal
                const modal = bootstrap.Modal.getInstance(scannerModal);
                if (modal) {
                    modal.hide();
                }
            });
        }
        
        // Manual barcode input
        if (manualBarcodeBtn) {
            manualBarcodeBtn.addEventListener('click', function() {
                const code = manualBarcodeInput.value.trim();
                if (code) {
                    useBarcode(code);
                }
            });
        }
        
        // Detected code actions
        if (useDetectedCodeBtn) {
            useDetectedCodeBtn.addEventListener('click', function() {
                if (lastDetectedCode) {
                    useBarcode(lastDetectedCode);
                }
            });
        }
        
        if (scanAnotherBtn) {
            scanAnotherBtn.addEventListener('click', function() {
                // Hide result and resume scanning
                barcodeResult.style.display = 'none';
                document.getElementById('scanner-viewport').style.display = 'block';
                
                // Reset detections
                lastDetectedCode = null;
                detectionConfidence = 0;
                locksDetections = false;
                
                // Resume Quagga
                if (Quagga && scannerInitialized) {
                    Quagga.start();
                    isScanning = true;
                    updateStatus('Scanning...');
                } else {
                    initScanner();  // Re-initialize if needed
                }
            });
        }
    }
});

/**
 * Initialize the barcode scanner using Quagga
 */
function initScanner() {
    console.log('Initializing mobile scanner...');
    
    // Reset states
    lastDetectedCode = null;
    detectionConfidence = 0;
    isScanning = false;
    scannerInitialized = false;
    locksDetections = false;
    
    // Reset UI
    if (scannerStatus) updateStatus('Initializing camera...');
    if (barcodeResult) barcodeResult.style.display = 'none';
    if (addCodeBtn) addCodeBtn.disabled = true;
    
    // Check for Quagga
    if (!window.Quagga) {
        console.error('Quagga not loaded');
        updateStatus('Error: Scanner library not loaded');
        return;
    }
    
    // Check for necessary DOM elements
    if (!document.getElementById('scanner-viewport')) {
        console.error('Scanner viewport not found');
        updateStatus('Error: Scanner viewport not found');
        return;
    }
    
    // First, check if we have camera access permission
    checkCameraPermission()
        .then(hasPermission => {
            if (hasPermission) {
                startScanner();
            } else {
                updateStatus('Camera permission denied');
                showManualInput();
            }
        })
        .catch(error => {
            console.error('Camera permission check failed:', error);
            updateStatus('Error accessing camera');
            showManualInput();
        });
}

/**
 * Check if we have camera permission
 */
function checkCameraPermission() {
    return new Promise((resolve, reject) => {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                // Store the stream so we can stop it later
                scannerMediaStream = stream;
                
                // Clean up the temporary stream
                stream.getTracks().forEach(track => track.stop());
                
                resolve(true);
            })
            .catch(error => {
                console.error('Camera permission check failed:', error);
                if (error.name === 'NotAllowedError') {
                    resolve(false);
                } else {
                    reject(error);
                }
            });
    });
}

/**
 * Start the Quagga barcode scanner
 */
function startScanner() {
    // Configure Quagga 
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.getElementById('scanner-viewport'),
            constraints: {
                width: window.innerWidth,
                height: window.innerHeight,
                facingMode: "environment" // Use the back camera
            }
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        numOfWorkers: 4,
        frequency: 10,
        decoder: {
            readers: [
                "code_128_reader",
                "ean_reader",
                "ean_8_reader",
                "code_39_reader",
                "code_39_vin_reader",
                "codabar_reader",
                "upc_reader",
                "upc_e_reader",
                "i2of5_reader"
            ],
            debug: {
                showCanvas: false,
                showPatches: false,
                showFoundPatches: false,
                showSkeleton: false,
                showLabels: false,
                showPatchLabels: false,
                showRemainingPatchLabels: false
            }
        },
        locate: true
    }, function(err) {
        if (err) {
            console.error('Error initializing Quagga:', err);
            updateStatus('Scanner initialization failed');
            showManualInput();
            return;
        }
        
        console.log('Quagga initialized successfully');
        scannerInitialized = true;
        isScanning = true;
        updateStatus('Scanning...');
        
        // Start Quagga
        Quagga.start();
        
        // Save the video streams for later cleanup
        const videoElements = document.querySelectorAll('#scanner-viewport video');
        videoElements.forEach(video => {
            if (video.srcObject) {
                scannerStreams.push(video.srcObject);
            }
        });
        
        // Setup detection event handler
        Quagga.onDetected(handleBarcodeDetection);
        
        // Optional: Setup processing event for debugging
        Quagga.onProcessed(function(result) {
            // This is called for each processing cycle
            // You can use this to display debug information
        });
    });
}

/**
 * Handle barcode detection from Quagga
 */
function handleBarcodeDetection(result) {
    // Check if we're already handling a detection
    if (locksDetections) return;
    
    const code = result.codeResult.code;
    const confidence = result.codeResult.confidence;
    
    console.log(`Detected code: ${code} (confidence: ${confidence})`);
    
    // Only process codes with good confidence (0-1 scale)
    if (confidence < 0.10) {
        return;
    }
    
    // If this is a new code or a higher confidence detection
    if (code !== lastDetectedCode || confidence > detectionConfidence) {
        lastDetectedCode = code;
        detectionConfidence = confidence;
        
        // Show the detected code
        detectedCodeElement.textContent = code;
        
        // If confidence is high enough, show the success UI
        if (confidence > 0.60) {
            locksDetections = true;
            handleSuccessfulScan(code);
        }
    }
}

/**
 * Handle a successfully scanned barcode
 */
function handleSuccessfulScan(code) {
    console.log('Successfully scanned barcode:', code);
    
    // Play success sound
    playBeepSound();
    
    // Show success flash animation
    showSuccessFlash();
    
    // Pause Quagga
    if (Quagga && isScanning) {
        Quagga.pause();
        isScanning = false;
    }
    
    // Hide the scanner viewport
    document.getElementById('scanner-viewport').style.display = 'none';
    
    // Update UI
    updateStatus('Barcode detected!');
    addCodeBtn.disabled = false;
    barcodeResult.style.display = 'block';
    
    // For convenient single-scanning, enable auto-use after short delay
    setTimeout(function() {
        if (lastDetectedCode === code) {
            useBarcode(code);
        }
    }, 1500);
}

/**
 * Use a barcode (add it to the list)
 */
function useBarcode(code) {
    // Add the barcode to the input field
    const barcodeInput = document.getElementById('barcode-input');
    if (barcodeInput) {
        barcodeInput.value = code;
        
        // Click the add button to process the barcode
        const addButton = document.getElementById('add-barcode');
        if (addButton) {
            addButton.click();
        }
    }
    
    // Close the scanner modal
    const modal = bootstrap.Modal.getInstance(scannerModal);
    if (modal) {
        modal.hide();
    }
}

/**
 * Stop the scanner and clean up resources
 */
function stopScanner() {
    console.log('Stopping scanner...');
    
    // Stop Quagga
    if (Quagga && scannerInitialized) {
        try {
            Quagga.stop();
        } catch (e) {
            console.error('Error stopping Quagga:', e);
        }
    }
    
    // Stop video streams
    scannerStreams.forEach(stream => {
        if (stream && stream.getTracks) {
            stream.getTracks().forEach(track => track.stop());
        }
    });
    
    // Clear streams array
    scannerStreams = [];
    
    // Reset state
    isScanning = false;
    scannerInitialized = false;
    updateStatus('Initializing...');
}

/**
 * Show the manual input section
 */
function showManualInput() {
    // Hide the scanner viewport
    const viewport = document.getElementById('scanner-viewport');
    if (viewport) {
        viewport.style.display = 'none';
    }
    
    // Show an alert about manual input
    const scannerContainer = document.getElementById('scanner-container');
    if (scannerContainer) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-warning m-3';
        alertDiv.innerHTML = `
            <h5><i class="fas fa-exclamation-triangle"></i> Camera Access Error</h5>
            <p>Could not access the camera. Please allow camera access or enter the barcode manually.</p>
        `;
        scannerContainer.appendChild(alertDiv);
    }
    
    // Focus on manual input
    if (manualBarcodeInput) {
        manualBarcodeInput.focus();
    }
}

/**
 * Update the scanner status display
 */
function updateStatus(message) {
    if (scannerStatus) {
        scannerStatus.innerHTML = message;
    }
}

/**
 * Play a beep sound for successful scan
 */
function playBeepSound() {
    try {
        const audio = new Audio('data:audio/mp3;base64,SUQzAwAAAAAAJlRQRTEAAAAcAAAAU291bmRKYXkuY29tIFNvdW5kIEVmZmVjdHMA//uSwAAAAAABLBQAAAMBUVTEFDQABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7ksH/g8AAAaQcAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
        console.warn('Unable to play beep sound:', e);
    }
}

/**
 * Show success flash animation
 */
function showSuccessFlash() {
    // Create flash element
    const flash = document.createElement('div');
    flash.className = 'success-flash';
    document.body.appendChild(flash);
    
    // Remove after animation completes
    setTimeout(() => {
        document.body.removeChild(flash);
    }, 500);
}
