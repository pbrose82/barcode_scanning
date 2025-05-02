/**
 * Mobile Barcode Scanner for Alchemy Barcode Scanner
 * Uses HTML5-QRCode library which is more reliable than QuaggaJS
 */

// Scanner-related elements
let scannerModal;
let scannerContainer;
let barcodeInput;
let addBarcodeButton;
let cameraButton;
let manualInput;
let scannerStatus;
let html5QrScanner = null;

// Scanner state
let lastScannedCode = null;
let isScanning = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Mobile scanner script loaded');
    
    // Find required elements
    scannerModal = document.getElementById('mobileScannerModal');
    barcodeInput = document.getElementById('barcode-input');
    addBarcodeButton = document.getElementById('add-barcode');
    manualInput = document.getElementById('manual-barcode-input');
    
    // Only proceed on mobile devices
    const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobileDevice && scannerModal) {
        console.log('Mobile device detected, setting up scanner');
        
        // Make sure we have the required container for the scanner
        scannerContainer = document.getElementById('scanner-container');
        if (!scannerContainer) {
            console.log('Creating scanner container');
            scannerContainer = document.createElement('div');
            scannerContainer.id = 'scanner-container';
            scannerContainer.style.width = '100%';
            scannerContainer.style.height = '300px';
            scannerContainer.style.position = 'relative';
            scannerContainer.style.backgroundColor = '#000';
            
            // Add it to the modal body
            const modalBody = scannerModal.querySelector('.modal-body');
            if (modalBody) {
                modalBody.prepend(scannerContainer);
            }
        }
        
        // Create reader div if it doesn't exist
        let readerDiv = document.getElementById('qr-reader');
        if (!readerDiv) {
            console.log('Creating QR reader div');
            readerDiv = document.createElement('div');
            readerDiv.id = 'qr-reader';
            readerDiv.style.width = '100%';
            readerDiv.style.height = '100%';
            scannerContainer.appendChild(readerDiv);
        }
        
        // Load HTML5-QRCode library if not already loaded
        if (!window.Html5Qrcode) {
            console.log('Loading HTML5-QRCode library');
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
            document.head.appendChild(script);
            
            script.onload = function() {
                console.log('HTML5-QRCode library loaded');
                setupScannerEvents();
            };
            
            script.onerror = function() {
                console.error('Failed to load HTML5-QRCode library');
                showManualInput('Failed to load scanner library. Please enter barcode manually.');
            };
        } else {
            console.log('HTML5-QRCode already loaded');
            setupScannerEvents();
        }
        
        // Create status element if it doesn't exist
        scannerStatus = document.getElementById('scanner-status');
        if (!scannerStatus) {
            console.log('Creating scanner status element');
            scannerStatus = document.createElement('div');
            scannerStatus.id = 'scanner-status';
            scannerStatus.style.position = 'absolute';
            scannerStatus.style.top = '10px';
            scannerStatus.style.left = '0';
            scannerStatus.style.right = '0';
            scannerStatus.style.textAlign = 'center';
            scannerStatus.style.color = 'white';
            scannerStatus.style.zIndex = '10';
            scannerStatus.style.padding = '8px';
            scannerStatus.innerHTML = 'Initializing...';
            scannerContainer.appendChild(scannerStatus);
        }
        
        // Add scan area overlay
        let scanAreaOverlay = document.getElementById('scan-area-overlay');
        if (!scanAreaOverlay) {
            console.log('Creating scan area overlay');
            scanAreaOverlay = document.createElement('div');
            scanAreaOverlay.id = 'scan-area-overlay';
            scanAreaOverlay.style.position = 'absolute';
            scanAreaOverlay.style.top = '50%';
            scanAreaOverlay.style.left = '50%';
            scanAreaOverlay.style.width = '70%';
            scanAreaOverlay.style.height = '25%';
            scanAreaOverlay.style.transform = 'translate(-50%, -50%)';
            scanAreaOverlay.style.border = '2px solid #00A86B';
            scanAreaOverlay.style.borderRadius = '8px';
            scanAreaOverlay.style.boxShadow = '0 0 0 4000px rgba(0, 0, 0, 0.5)';
            scanAreaOverlay.style.pointerEvents = 'none';
            scanAreaOverlay.style.zIndex = '9';
            scannerContainer.appendChild(scanAreaOverlay);
            
            // Add scan line animation
            const scanLine = document.createElement('div');
            scanLine.style.position = 'absolute';
            scanLine.style.top = '50%';
            scanLine.style.left = '0';
            scanLine.style.right = '0';
            scanLine.style.height = '2px';
            scanLine.style.backgroundColor = 'rgba(0, 168, 107, 0.5)';
            scanLine.style.animation = 'scan-line 2s linear infinite';
            scanAreaOverlay.appendChild(scanLine);
            
            // Add animation style
            const style = document.createElement('style');
            style.textContent = `
                @keyframes scan-line {
                    0% {
                        top: 10%;
                    }
                    50% {
                        top: 90%;
                    }
                    100% {
                        top: 10%;
                    }
                }
                
                .success-flash {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 168, 107, 0.3);
                    z-index: 9999;
                    pointer-events: none;
                    animation: success-flash 0.5s ease-out;
                    opacity: 0;
                }
                
                @keyframes success-flash {
                    0% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add help text
        let helpText = document.getElementById('scan-help-text');
        if (!helpText) {
            console.log('Creating help text');
            helpText = document.createElement('div');
            helpText.id = 'scan-help-text';
            helpText.style.position = 'absolute';
            helpText.style.bottom = '20px';
            helpText.style.left = '0';
            helpText.style.right = '0';
            helpText.style.textAlign = 'center';
            helpText.style.color = 'white';
            helpText.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
            helpText.style.padding = '10px';
            helpText.style.fontSize = '14px';
            helpText.style.fontWeight = '500';
            helpText.innerHTML = 'Position the barcode within the green box';
            scannerContainer.appendChild(helpText);
        }
        
        // Create manual input section if it doesn't exist
        if (!document.getElementById('manual-input-section')) {
            console.log('Creating manual input section');
            const manualInputSection = document.createElement('div');
            manualInputSection.id = 'manual-input-section';
            manualInputSection.className = 'p-3';
            manualInputSection.innerHTML = `
                <div class="mb-3">
                    <label for="manual-barcode-input" class="form-label">Or enter barcode manually:</label>
                    <div class="input-group">
                        <input type="text" class="form-control" id="manual-barcode-input" placeholder="Enter barcode here">
                        <button class="btn btn-primary" id="manual-barcode-btn">Add</button>
                    </div>
                </div>
                
                <div id="barcode-result" style="display: none;" class="text-center py-3">
                    <div class="alert alert-success">
                        <p class="mb-1">Barcode detected:</p>
                        <p class="detected-code" id="detected-code">CODE123</p>
                    </div>
                    
                    <button class="btn btn-success" id="use-detected-code-btn">
                        <i class="fas fa-check"></i> Use This Code
                    </button>
                    <button class="btn btn-secondary ms-2" id="scan-another-btn">
                        <i class="fas fa-redo"></i> Scan Again
                    </button>
                </div>
            `;
            
            // Insert after scanner container
            scannerContainer.insertAdjacentElement('afterend', manualInputSection);
        }
    }
});

/**
 * Set up scanner events
 */
function setupScannerEvents() {
    console.log('Setting up scanner events');
    
    // Setup modal events
    if (scannerModal) {
        scannerModal.addEventListener('shown.bs.modal', function() {
            console.log('Scanner modal shown, initializing scanner');
            setTimeout(startScanner, 500);
        });
        
        scannerModal.addEventListener('hidden.bs.modal', function() {
            console.log('Scanner modal hidden, stopping scanner');
            stopScanner();
        });
    }
    
    // Setup manual input button
    const manualBarcodeBtn = document.getElementById('manual-barcode-btn');
    if (manualBarcodeBtn) {
        manualBarcodeBtn.addEventListener('click', function() {
            const manualBarcodeInput = document.getElementById('manual-barcode-input');
            if (manualBarcodeInput && manualBarcodeInput.value.trim()) {
                console.log('Using manually entered barcode:', manualBarcodeInput.value.trim());
                useBarcode(manualBarcodeInput.value.trim());
            }
        });
    }
    
    // Setup detected code buttons
    const useDetectedCodeBtn = document.getElementById('use-detected-code-btn');
    if (useDetectedCodeBtn) {
        useDetectedCodeBtn.addEventListener('click', function() {
            if (lastScannedCode) {
                console.log('Using detected barcode:', lastScannedCode);
                useBarcode(lastScannedCode);
            }
        });
    }
    
    const scanAnotherBtn = document.getElementById('scan-another-btn');
    if (scanAnotherBtn) {
        scanAnotherBtn.addEventListener('click', function() {
            console.log('Scan another clicked, restarting scanner');
            // Hide result
            const barcodeResult = document.getElementById('barcode-result');
            if (barcodeResult) {
                barcodeResult.style.display = 'none';
            }
            
            // Restart scanner
            startScanner();
        });
    }
    
    // Setup close button
    const closeBtn = document.getElementById('close-scanner-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            console.log('Close button clicked');
            closeScanner();
        });
    }
}

/**
 * Start the barcode scanner
 */
function startScanner() {
    updateStatus('Initializing camera...');
    
    // Check if HTML5-QRCode is loaded
    if (!window.Html5Qrcode) {
        console.error('HTML5-QRCode library not loaded');
        updateStatus('Scanner library not loaded');
        showManualInput('Scanner library not available. Please enter barcode manually.');
        return;
    }
    
    // Check if we already have a scanner instance
    if (html5QrScanner) {
        stopScanner();
    }
    
    // Get reader element
    const readerElement = document.getElementById('qr-reader');
    if (!readerElement) {
        console.error('QR reader element not found');
        updateStatus('Scanner initialization failed');
        showManualInput('Scanner configuration error. Please enter barcode manually.');
        return;
    }
    
    try {
        // Create new scanner instance
        html5QrScanner = new Html5Qrcode("qr-reader");
        
        // Calculate optimal camera dimensions
        const containerWidth = readerElement.clientWidth || 320;
        const containerHeight = readerElement.clientHeight || 240;
        
        // Configuration for the scanner
        const config = {
            fps: 10,
            qrbox: {
                width: Math.min(containerWidth, 300) * 0.7,
                height: Math.min(containerHeight, 300) * 0.3
            },
            aspectRatio: containerWidth / containerHeight,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E
            ],
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true
        };
        
        // Success callback
        const qrCodeSuccessCallback = (decodedText, decodedResult) => {
            console.log(`Code detected: ${decodedText}`, decodedResult);
            
            // Stop scanning
            stopScanner(false);
            
            // Handle the scanned code
            handleSuccessfulScan(decodedText);
        };
        
        // Start scanner with user's camera
        html5QrScanner.start(
            { facingMode: "environment" }, // Prefer back camera
            config,
            qrCodeSuccessCallback,
            onScanError
        ).then(() => {
            // Successfully started scanning
            console.log("QR Code scanner started");
            isScanning = true;
            updateStatus('Scanning...');
        }).catch((err) => {
            // Start failed
            console.error(`Unable to start scanning: ${err}`);
            updateStatus('Scanner initialization failed');
            showManualInput(`Could not start the scanner: ${err}. Please enter barcode manually.`);
        });
    } catch (error) {
        console.error('Error creating HTML5-QRCode scanner:', error);
        updateStatus('Scanner initialization failed');
        showManualInput('Scanner initialization error. Please enter barcode manually.');
    }
}

/**
 * Handle scan errors (just log them)
 */
function onScanError(errorMessage) {
    // Don't need to do anything - errors are expected when no code is detected
    // console.error(`Scan error: ${errorMessage}`);
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
 * Handle a successfully scanned barcode
 */
function handleSuccessfulScan(code) {
    console.log('Successfully scanned barcode:', code);
    lastScannedCode = code;
    
    // Play success sound
    playBeepSound();
    
    // Show success flash animation
    showSuccessFlash();
    
    // Update UI
    updateStatus('Barcode detected!');
    
    // Show result
    const barcodeResult = document.getElementById('barcode-result');
    const detectedCodeElement = document.getElementById('detected-code');
    
    if (barcodeResult) {
        barcodeResult.style.display = 'block';
    }
    
    if (detectedCodeElement) {
        detectedCodeElement.textContent = code;
    }
    
    // For convenient single-scanning, enable auto-use after short delay
    setTimeout(function() {
        if (lastScannedCode === code) {
            useBarcode(code);
        }
    }, 1500);
}

/**
 * Use a barcode (add it to the list)
 */
function useBarcode(code) {
    // Add the barcode to the input field
    if (barcodeInput) {
        barcodeInput.value = code;
        
        // Click the add button to process the barcode
        if (addBarcodeButton) {
            addBarcodeButton.click();
        }
    }
    
    // Close the scanner modal
    closeScanner();
}

/**
 * Stop the scanner
 */
function stopScanner(resetUI = true) {
    console.log('Stopping scanner');
    
    if (html5QrScanner && isScanning) {
        html5QrScanner.stop().then(() => {
            console.log('QR Code scanner stopped');
        }).catch((err) => {
            console.error('Error stopping QR Code scanner:', err);
        });
        
        isScanning = false;
    }
    
    // Reset UI if needed
    if (resetUI) {
        updateStatus('Initializing...');
        
        // Hide scan result
        const barcodeResult = document.getElementById('barcode-result');
        if (barcodeResult) {
            barcodeResult.style.display = 'none';
        }
    }
}

/**
 * Close the scanner modal
 */
function closeScanner() {
    // Stop the scanner
    stopScanner();
    
    // Close the modal
    try {
        const modal = bootstrap.Modal.getInstance(scannerModal);
        if (modal) {
            modal.hide();
        } else {
            // Fallback
            scannerModal.classList.remove('show');
            scannerModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
        }
    } catch (error) {
        console.error('Error closing modal:', error);
    }
}

/**
 * Show manual input when scanner fails
 */
function showManualInput(message) {
    console.log('Showing manual input with message:', message);
    
    // Hide reader if available
    const readerElement = document.getElementById('qr-reader');
    if (readerElement) {
        readerElement.style.display = 'none';
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
    const manualBarcodeInput = document.getElementById('manual-barcode-input');
    if (manualBarcodeInput) {
        manualBarcodeInput.focus();
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
