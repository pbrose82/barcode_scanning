/**
 * Mobile Barcode Scanner functionality for Alchemy Barcode Scanner
 * Uses QuaggaJS for scanning barcodes on mobile devices
 * Includes QR code scanning support and enhanced error handling
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
let scannerViewport;

// Scanner state
let isScanning = false;
let scannerInitialized = false;
let lastDetectedCode = null;
let detectionConfidence = 0;
let scannerStreams = [];
let scannerMediaStream = null;
let locksDetections = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Mobile scanner script loaded');
    
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
    scannerViewport = document.getElementById('scanner-viewport');
    
    // Check if required elements exist
    if (!scannerModal) {
        console.error('Scanner modal element not found');
        return;
    }
    
    if (!scannerViewport) {
        console.error('Scanner viewport element not found');
        // Try to create the viewport if it doesn't exist
        const modalBody = scannerModal.querySelector('.modal-body');
        if (modalBody) {
            console.log('Creating scanner viewport element');
            scannerViewport = document.createElement('div');
            scannerViewport.id = 'scanner-viewport';
            scannerViewport.style.width = '100%';
            scannerViewport.style.height = '300px';
            
            // Add viewport to modal
            const scannerContainer = modalBody.querySelector('#scanner-container');
            if (scannerContainer) {
                scannerContainer.appendChild(scannerViewport);
            } else {
                console.error('Scanner container not found');
            }
        }
    }
    
    // Check for QuaggaJS
    if (!window.Quagga) {
        console.error('QuaggaJS library not loaded');
        // Try to load Quagga dynamically
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.8.2/dist/quagga.min.js';
        script.onload = function() {
            console.log('QuaggaJS loaded dynamically');
        };
        script.onerror = function() {
            console.error('Failed to load QuaggaJS dynamically');
        };
        document.head.appendChild(script);
    } else {
        console.log('QuaggaJS already loaded');
    }
    
    // Only setup scanner on mobile devices
    const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobileDevice && scannerModal) {
        // Setup scanner when modal is shown
        scannerModal.addEventListener('shown.bs.modal', function() {
            console.log('Scanner modal shown, initializing scanner');
            setTimeout(initScanner, 500); // Slight delay to ensure modal is fully shown
        });
        
        scannerModal.addEventListener('hidden.bs.modal', function() {
            console.log('Scanner modal hidden, stopping scanner');
            stopScanner();
        });
        
        // Close button handler
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                console.log('Close button clicked');
                // Close the modal
                const modal = bootstrap.Modal.getInstance(scannerModal);
                if (modal) {
                    modal.hide();
                } else {
                    // Fallback if modal instance not available
                    scannerModal.classList.remove('show');
                    scannerModal.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) backdrop.remove();
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
                if (barcodeResult) barcodeResult.style.display = 'none';
                if (scannerViewport) scannerViewport.style.display = 'block';
                
                // Reset detections
                lastDetectedCode = null;
                detectionConfidence = 0;
                locksDetections = false;
                
                // Resume Quagga
                if (window.Quagga && scannerInitialized) {
                    window.Quagga.start();
                    isScanning = true;
                    updateStatus('Scanning...');
                } else {
                    initScanner();  // Re-initialize if needed
                }
            });
        }
    } else {
        console.log('Not a mobile device or scanner modal not found');
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
        showManualInput('Scanner library not available. Please enter the barcode manually.');
        return;
    }
    
    // Check for viewport
    if (!scannerViewport) {
        console.error('Scanner viewport not found');
        updateStatus('Error: Scanner viewport not found');
        showManualInput('Scanner configuration error. Please enter the barcode manually.');
        return;
    }
    
    // Ensure viewport is visible
    scannerViewport.style.display = 'block';
    
    // First, check if we have camera access permission
    checkCameraPermission()
        .then(hasPermission => {
            if (hasPermission) {
                startScanner();
            } else {
                updateStatus('Camera permission denied');
                showManualInput('Camera access denied. Please enable camera permissions or enter the barcode manually.');
            }
        })
        .catch(error => {
            console.error('Camera permission check failed:', error);
            updateStatus('Error accessing camera');
            showManualInput('Camera access error: ' + error.message + '. Please enter the barcode manually.');
        });
}

/**
 * Check if we have camera permission
 */
function checkCameraPermission() {
    return new Promise((resolve, reject) => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('MediaDevices API not supported');
            reject(new Error('Your browser does not support camera access'));
            return;
        }
        
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
    console.log('Starting Quagga scanner with viewport:', scannerViewport);
    
    try {
        // Configure Quagga 
        window.Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: scannerViewport,
                constraints: {
                    width: { min: 640 },
                    height: { min: 480 },
                    aspectRatio: { min: 1, max: 2 },
                    facingMode: "environment" // Use the back camera
                }
            },
            locator: {
                patchSize: "medium",
                halfSample: true,
                debug: {
                    showCanvas: false,
                    showPatches: false,
                    showFoundPatches: false
                }
            },
            numOfWorkers: 2, // Reduced for better compatibility
            frequency: 10,
            decoder: {
                readers: [
                    "qr_code_reader",  // Added QR code reader support!
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
                updateStatus('Scanner initialization failed: ' + err.message);
                showManualInput('Could not start the scanner. Please enter the barcode manually.');
                return;
            }
            
            console.log('Quagga initialized successfully');
            scannerInitialized = true;
            isScanning = true;
            updateStatus('Scanning...');
            
            // Start Quagga
            window.Quagga.start();
            
            // Save the video streams for later cleanup
            const videoElements = scannerViewport.querySelectorAll('video');
            videoElements.forEach(video => {
                if (video.srcObject) {
                    scannerStreams.push(video.srcObject);
                }
            });
            
            // Setup detection event handler
            window.Quagga.onDetected(handleBarcodeDetection);
            
            // Optional: Setup processing event for debugging
            window.Quagga.onProcessed(function(result) {
                // This is called for each processing cycle
                // You can use this to display debug information
            });
        });
    } catch (e) {
        console.error('Exception during Quagga initialization:', e);
        updateStatus('Scanner error: ' + e.message);
        showManualInput('Scanner error occurred. Please enter the barcode manually.');
    }
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
    // Lower threshold slightly for QR codes with simple content
    if (confidence < 0.08) {
        return;
    }
    
    // If this is a new code or a higher confidence detection
    if (code !== lastDetectedCode || confidence > detectionConfidence) {
        lastDetectedCode = code;
        detectionConfidence = confidence;
        
        // Show the detected code
        if (detectedCodeElement) detectedCodeElement.textContent = code;
        
        // If confidence is high enough, show the success UI
        // Lower threshold for simple QR codes like "FG1.1"
        if (confidence > 0.40) {
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
    if (window.Quagga && isScanning) {
        window.Quagga.pause();
        isScanning = false;
    }
    
    // Hide the scanner viewport
    if (scannerViewport) scannerViewport.style.display = 'none';
    
    // Update UI
    updateStatus('Barcode detected!');
    if (addCodeBtn) addCodeBtn.disabled = false;
    if (barcodeResult) barcodeResult.style.display = 'block';
    
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
    try {
        const modal = bootstrap.Modal.getInstance(scannerModal);
        if (modal) {
            modal.hide();
        } else {
            // Fallback if modal instance not available
            scannerModal.classList.remove('show');
            scannerModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
        }
    } catch (error) {
        console.error('Error closing modal:', error);
        // If all else fails, just reload the page
        // window.location.reload();
    }
}

/**
 * Stop the scanner and clean up resources
 */
function stopScanner() {
    console.log('Stopping scanner...');
    
    // Stop Quagga
    if (window.Quagga && scannerInitialized) {
        try {
            window.Quagga.stop();
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
function showManualInput(message) {
    // Hide the scanner viewport
    if (scannerViewport) {
        scannerViewport.style.display = 'none';
    }
    
    // Show an alert about manual input
    const scannerContainer = document.getElementById('scanner-container');
    if (scannerContainer) {
        // Remove any existing alert
        const existingAlert = scannerContainer.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        // Create new alert
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-warning m-3';
        alertDiv.innerHTML = `
            <h5><i class="fas fa-exclamation-triangle"></i> Camera Access Error</h5>
            <p>${message || 'Could not access the camera. Please allow camera access or enter the barcode manually.'}</p>
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
    console.log('Scanner status:', message);
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
    try {
        const flash = document.createElement('div');
        flash.className = 'success-flash';
        document.body.appendChild(flash);
        
        // Remove after animation completes
        setTimeout(() => {
            if (document.body.contains(flash)) {
                document.body.removeChild(flash);
            }
        }, 500);
    } catch (e) {
        console.warn('Error showing success flash:', e);
    }
}
