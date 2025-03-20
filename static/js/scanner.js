/**
 * Main script for Alchemy Barcode Scanner application
 * This script handles handheld barcode scanner input, location selection, and record updates
 */

// Debug console messages to check if the script is loading
console.log('Scanner.js is loading...');

// Wait for the DOM to be fully loaded before executing
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing application...');
    
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

    // Set maximum number of barcodes that can be scanned
    const MAX_BARCODES = 5;
    
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
                    // Only re-focus if we're not using dropdowns and not at max barcodes
                    if (!isSelectingLocation && recordIds.length < MAX_BARCODES) {
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
        fetch('/get-locations')
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
                fetch('/get-test-locations')
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
    
    // All other functions remain the same...
