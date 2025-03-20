/**
 * Main script for Alchemy Barcode Scanner application
 * This script handles handheld barcode scanner input, location selection, and record updates
 */

// Debug console messages to check if the script is loading
console.log('Scanner.js is loading...');

// Wait for the DOM to be fully loaded before executing
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing application...');
    
    // Get tenant information from the global variable (set in the HTML template)
    const tenant = window.tenantInfo ? window.tenantInfo.tenant : 'default';
    const tenantName = window.tenantInfo ? window.tenantInfo.tenantName : 'Default';
    
    console.log(`Running in tenant: ${tenant} (${tenantName})`);
    
    // Debug check to see if elements are found correctly
    console.log('Elements check:', {
        'barcodeInput': document.getElementById('barcode-input'),
        'addBarcodeBtn': document.getElementById('add-barcode'),
        'scannedItems': document.getElementById('scanned-items'),
        'locationSelect': document.getElementById('location-select'),
        'sublocationSelect': document.getElementById('sublocation-select'),
        'updateButton': document.getElementById('update-button'),
        'resetButton': document.getElementById('reset-button')
    });
    
    // Define variables for various HTML elements
    const barcodeInput = document.getElementById('barcode-input');
    const addBarcodeBtn = document.getElementById('add-barcode');
    const scannedItems = document.getElementById('scanned-items');
    const locationSelect = document.getElementById('location-select');
    const sublocationSelect = document.getElementById('sublocation-select');
    const updateButton = document.getElementById('update-button');
    const resetButton = document.getElementById('reset-button');
    const processingStatus = document.getElementById('processing-status');
    const statusText = document.getElementById('status-text');
    const progressBar = document.getElementById('progress-bar');
    const updateResults = document.getElementById('update-results');
    const resultsContent = document.getElementById('results-content');

    // No maximum limit for barcodes
    
    // Flag to prevent automatic refocus during dropdown interaction
    let isSelectingLocation = false;
    
    // Array to store scanned record IDs
    let recordIds = [];
    
    // Store location data
    let locationData = [];
    
    // Initialize the app
    init();
    
    function init() {
        console.log('Initializing application...');
        
        // Load locations
        fetchLocations();
        
        // Add event listeners - with error checking
        if (addBarcodeBtn) {
            addBarcodeBtn.addEventListener('click', addBarcode);
            console.log('Add barcode button event listener attached');
        } else {
            console.error('Add barcode button not found!');
        }
        
        if (locationSelect) {
            // Fix for dropdown closing too quickly
            locationSelect.addEventListener('mousedown', function(e) {
                console.log('Location select mousedown');
                isSelectingLocation = true;
            });
            
            locationSelect.addEventListener('focus', function(e) {
                console.log('Location select focused');
                isSelectingLocation = true;
            });
            
            locationSelect.addEventListener('blur', function(e) {
                console.log('Location select blurred');
                // Delay to make sure the change event fires first
                setTimeout(() => {
                    isSelectingLocation = false;
                }, 200);
            });
            
            locationSelect.addEventListener('change', handleLocationChange);
            console.log('Location select event listeners attached');
        } else {
            console.error('Location select not found!');
        }
        
        if (sublocationSelect) {
            // Similar handling for sublocation select
            sublocationSelect.addEventListener('mousedown', function(e) {
                isSelectingLocation = true;
            });
            
            sublocationSelect.addEventListener('focus', function(e) {
                isSelectingLocation = true;
            });
            
            sublocationSelect.addEventListener('blur', function(e) {
                setTimeout(() => {
                    isSelectingLocation = false;
                }, 200);
            });
        }
        
        if (updateButton) {
            updateButton.addEventListener('click', updateRecordLocations);
            console.log('Update button event listener attached');
        } else {
            console.error('Update button not found!');
        }
        
        if (resetButton) {
            resetButton.addEventListener('click', resetApp);
            console.log('Reset button event listener attached');
        } else {
            console.error('Reset button not found!');
        }
        
        // Handle barcode input with Enter key (common for barcode scanners)
        if (barcodeInput) {
            barcodeInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent form submission
                    addBarcode();
                }
            });
            
            // Automatically focus the input field for scanner
            barcodeInput.focus();
            
            // When input field loses focus, focus it again (helps with scanning multiple barcodes)
            barcodeInput.addEventListener('blur', function() {
                // Short timeout to allow for button clicks
                setTimeout(() => {
                    // Only re-focus if we're not using dropdowns
                    if (!isSelectingLocation) {
                        console.log('Re-focusing barcode input');
                        barcodeInput.focus();
                    }
                }, 200);
            });
            
            console.log('Barcode input event listeners attached');
        } else {
            console.error('Barcode input not found!');
        }
        
        // Update UI based on initial state
        updateUI();
        
        console.log('Application initialized');
    }
    
    // Fetch available locations from the server
    function fetchLocations() {
        console.log('Fetching locations...');
        
        if (!locationSelect) {
            console.error('Cannot fetch locations: locationSelect element not found');
            return;
        }
        
        // Show loading state
        locationSelect.innerHTML = '<option value="">Loading locations...</option>';
        
        // Try both endpoints for reliability
        fetch(`/get-locations/${tenant}`)
            .then(response => {
                console.log('Fetch response:', response);
                if (!response.ok) {
                    throw new Error(`API returned status code ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Locations fetched:', data);
                
                // Validate location data format
                if (!Array.isArray(data)) {
                    console.error("Locations data is not an array:", data);
                    throw new Error("Locations data is not an array");
                }
                
                // Store location data globally
                locationData = data;
                
                // Populate dropdown
                populateLocations(data);
            })
            .catch(error => {
                console.error('Error fetching locations:', error);
                
                // Try fallback to test locations if real locations fail
                console.log('Trying test locations instead...');
                fetch(`/get-test-locations/${tenant}`)
                    .then(response => response.json())
                    .then(data => {
                        console.log('Test locations fetched:', data);
                        locationData = data;
                        populateLocations(data);
                    })
                    .catch(fallbackError => {
                        console.error('Error fetching test locations:', fallbackError);
                        // Show error in dropdown
                        locationSelect.innerHTML = '<option value="">Failed to load locations</option>';
                        
                        // Show error notification
                        showNotification('Failed to load locations. Please try refreshing the page.', 'error');
                    });
            });
    }
    
    // Populate the location dropdown
    function populateLocations(locations) {
        console.log('Populating location dropdown with', locations.length, 'locations');
        
        if (!locationSelect) {
            console.error('Cannot populate locations: locationSelect element not found');
            return;
        }
        
        // Clear existing options
        locationSelect.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Select Location --';
        locationSelect.appendChild(defaultOption);
        
        // Add location options
        if (locations && locations.length > 0) {
            locations.forEach(location => {
                // Make sure location has required properties
                if (location && location.id && location.name) {
                    const option = document.createElement('option');
                    option.value = location.id;
                    option.textContent = location.name;
                    locationSelect.appendChild(option);
                } else {
                    console.warn('Invalid location data:', location);
                }
            });
            console.log('Added', locations.length, 'locations to dropdown');
        } else {
            console.warn('No locations available to populate dropdown');
            // Add a message if no locations
            const noLocationsOption = document.createElement('option');
            noLocationsOption.value = '';
            noLocationsOption.textContent = 'No locations available';
            noLocationsOption.disabled = true;
            locationSelect.appendChild(noLocationsOption);
        }
    }
    
    // Handle location change
    function handleLocationChange() {
        console.log('Location changed to:', locationSelect.value);
        const selectedLocationId = locationSelect.value;
        
        if (!sublocationSelect) {
            console.error('Cannot handle location change: sublocationSelect element not found');
            return;
        }
        
        // Clear sublocation dropdown
        sublocationSelect.innerHTML = '';
        const defaultSubOption = document.createElement('option');
        defaultSubOption.value = '';
        defaultSubOption.textContent = '-- Select Sublocation --';
        sublocationSelect.appendChild(defaultSubOption);
        
        // Disable sublocation dropdown if no location selected
        if (!selectedLocationId) {
            sublocationSelect.disabled = true;
            return;
        }
        
        // Find selected location
        const selectedLocation = locationData.find(loc => loc.id === selectedLocationId);
        console.log('Selected location:', selectedLocation);
        
        // If location has sublocations, populate and enable the dropdown
        if (selectedLocation && selectedLocation.sublocations && Array.isArray(selectedLocation.sublocations) && selectedLocation.sublocations.length > 0) {
            console.log('Populating', selectedLocation.sublocations.length, 'sublocations');
            
            selectedLocation.sublocations.forEach(sublocation => {
                if (sublocation && sublocation.id && sublocation.name) {
                    const option = document.createElement('option');
                    option.value = sublocation.id;
                    option.textContent = sublocation.name;
                    sublocationSelect.appendChild(option);
                } else {
                    console.warn('Invalid sublocation data:', sublocation);
                }
            });
            sublocationSelect.disabled = false;
        } else {
            console.log('No sublocations available for this location');
            const noSublocationsOption = document.createElement('option');
            noSublocationsOption.value = '';
            noSublocationsOption.textContent = 'No sublocations available';
            noSublocationsOption.disabled = true;
            sublocationSelect.appendChild(noSublocationsOption);
            sublocationSelect.disabled = true;
        }
        
        // Update UI based on current state
        updateUI();
    }
    
    // Add a barcode to the list
    function addBarcode() {
        if (!barcodeInput || !scannedItems) {
            console.error('Cannot add barcode: required elements not found');
            return;
        }
        
        const code = barcodeInput.value.trim();
        console.log('Adding barcode:', code);
        
        if (!code) {
            showNotification('Please scan or enter a barcode.', 'warning');
            return;
        }
        
        if (!isValidRecordId(code)) {
            showNotification('Please enter a valid barcode format.', 'error');
            return;
        }
        
        // Check for duplicates
        if (recordIds.includes(code)) {
            showNotification('This barcode has already been scanned.', 'warning');
            barcodeInput.value = '';
            barcodeInput.focus();
            return;
        }
        
        // Add to array
        recordIds.push(code);
        
        // Add to UI
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <span>Barcode: <span class="record-badge">${code}</span></span>
            <button class="remove-item" data-id="${code}">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
            </button>
        `;
        
        // Add remove event listener
        li.querySelector('.remove-item').addEventListener('click', function() {
            const idToRemove = this.getAttribute('data-id');
            removeRecordId(idToRemove);
        });
        
        scannedItems.appendChild(li);
        
        // Clear input field
        barcodeInput.value = '';
        
        // Play success sound
        playBeepSound();
        
        // Update UI
        updateUI();
        
        // Focus back on input for next scan
        barcodeInput.focus();
        
        console.log('Barcode added. Current record IDs:', recordIds);
    }
    
    // Check if a string looks like a valid barcode
    function isValidRecordId(code) {
        // Updated validation for barcodes (alphanumeric with possible special chars like dash)
        return /^[A-Za-z0-9\-\.]+$/.test(code) && code.length > 0;
    }
    
    // Remove a record ID from the list
    function removeRecordId(id) {
        console.log('Removing record ID:', id);
        // Find index of the ID in the array
        const index = recordIds.indexOf(id);
        
        if (index !== -1) {
            // Remove from array
            recordIds.splice(index, 1);
            
            // Remove from UI
            if (scannedItems) {
                const items = scannedItems.querySelectorAll('li');
                items.forEach(item => {
                    const removeBtn = item.querySelector('.remove-item');
                    if (removeBtn && removeBtn.getAttribute('data-id') === id) {
                        item.remove();
                    }
                });
            }
            
            // Update UI
            updateUI();
            
            // Focus back on input field
            if (barcodeInput) {
                barcodeInput.focus();
            }
            
            console.log('Record ID removed. Current record IDs:', recordIds);
        }
    }
    
    // Update locations for scanned records
    function updateRecordLocations() {
        console.log('Updating record locations...');
        
        if (!locationSelect || !updateButton || !processingStatus || !progressBar || !statusText) {
            console.error('Cannot update locations: required elements not found');
            return;
        }
        
        const locationId = locationSelect.value;
        const sublocationId = sublocationSelect ? sublocationSelect.value : '';
        
        if (recordIds.length === 0) {
            showNotification('Please scan at least one barcode.', 'error');
            return;
        }
        
        if (!locationId) {
            showNotification('Please select a location.', 'error');
            return;
        }
        
        // Disable update button and show processing status
        updateButton.disabled = true;
        updateButton.classList.add('disabled');
        processingStatus.style.display = 'block';
        progressBar.style.width = '50%';
        statusText.textContent = 'Processing update...';
        
        // Prepare data for the API
        const data = {
            recordIds: recordIds,
            locationId: locationId,
            sublocationId: sublocationId
        };
        
        console.log('Sending update data:', data);
        
        // Send update request to server
        fetch(`/update-location/${tenant}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`API returned status code ${response.status}`);
            }
            return response.json();
        })
        .then(result => {
            console.log('Update result:', result);
            // Complete progress bar
            progressBar.style.width = '100%';
            
            // Hide processing status after a brief delay
            setTimeout(() => {
                processingStatus.style.display = 'none';
                
                // Show results
                displayUpdateResults(result);
                
                // Re-enable update button
                updateButton.disabled = false;
                updateButton.classList.remove('disabled');
            }, 1000);
        })
        .catch(error => {
            console.error('Error:', error);
            
            // Hide processing status
            processingStatus.style.display = 'none';
            
            // Show error notification
            showNotification(`An error occurred while updating records: ${error.message}`, 'error');
            
            // Re-enable update button
            updateButton.disabled = false;
            updateButton.classList.remove('disabled');
        });
    }
    
    // Display update results
    function displayUpdateResults(result) {
        if (!updateResults || !resultsContent) {
            console.error('Cannot display results: required elements not found');
            return;
        }
        
        let html = '';
        
        if (result.status === 'success') {
            html = `
                <div class="alert alert-success">
                    <strong>Success!</strong> ${result.message}
                </div>
                <p>Successfully updated the following records:</p>
                <ul class="list-group mb-3">
            `;
            
            result.successful.forEach(id => {
                html += `<li class="list-group-item">Barcode: ${id}</li>`;
            });
            
            html += '</ul>';
        } else if (result.status === 'partial') {
            html = `
                <div class="alert alert-warning">
                    <strong>Partial Success.</strong> ${result.message}
                </div>
                <p>Successfully updated the following records:</p>
                <ul class="list-group mb-3">
            `;
            
            result.successful.forEach(id => {
                html += `<li class="list-group-item">Barcode: ${id}</li>`;
            });
            
            html += '</ul><p>Failed to update the following records:</p><ul class="list-group">';
            
            result.failed.forEach(item => {
                html += `<li class="list-group-item">Barcode: ${item.id} - Error: ${item.error}</li>`;
            });
            
            html += '</ul>';
        } else {
            html = `
                <div class="alert alert-danger">
                    <strong>Error!</strong> ${result.message || 'An unknown error occurred'}
                </div>
            `;
        }
        
        // Update results content and show results section
        resultsContent.innerHTML = html;
        updateResults.style.display = 'block';
    }
    
    // Reset the application
    function resetApp() {
        console.log('Resetting application...');
        
        if (!scannedItems || !barcodeInput || !locationSelect || !sublocationSelect || !updateResults) {
            console.error('Cannot reset: required elements not found');
            return;
        }
        
        // Clear record IDs
        recordIds = [];
        
        // Clear UI elements
        scannedItems.innerHTML = '';
        barcodeInput.value = '';
        locationSelect.selectedIndex = 0;
        sublocationSelect.innerHTML = '';
        
        // Add default option to sublocation
        const defaultSubOption = document.createElement('option');
        defaultSubOption.value = '';
        defaultSubOption.textContent = '-- Select Sublocation --';
        sublocationSelect.appendChild(defaultSubOption);
        sublocationSelect.disabled = true;
        
        // Hide results
        updateResults.style.display = 'none';
        
        // Update UI
        updateUI();
        
        // Focus on input
        barcodeInput.focus();
        
        console.log('Application reset');
    }
    
    // Update UI based on current state
    function updateUI() {
        if (!updateButton) {
            console.error('Cannot update UI: updateButton element not found');
            return;
        }
        
        // Update the record counter
        const recordCount = recordIds.length;
        
        // Enable/disable update button based on conditions
        const enableUpdate = recordCount > 0 && (locationSelect && locationSelect.value !== '');
        
        if (enableUpdate) {
            updateButton.disabled = false;
            updateButton.classList.remove('disabled');
            updateButton.classList.add('active');
        } else {
            updateButton.disabled = true;
            updateButton.classList.add('disabled');
            updateButton.classList.remove('active');
        }
    }
    
    // Show notification message
    function showNotification(message, type) {
        console.log(`Notification (${type}):`, message);
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : 'success'} notification`;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.style.maxWidth = '300px';
        notification.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        notification.innerHTML = message;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s';
            
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 500);
        }, 3000);
    }
    
    // Play beep sound when barcode is successfully scanned
    function playBeepSound() {
        try {
            const audio = new Audio('data:audio/mp3;base64,SUQzAwAAAAAAJlRQRTEAAAAcAAAAU291bmRKYXkuY29tIFNvdW5kIEVmZmVjdHMA//uSwAAAAAABLBQAAAMBUVTEFDQABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7ksH/g8AAAaQcAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (e) {
            console.warn('Unable to play beep sound:', e);
        }
    }
});
