"use strict";
/**
 * Main script for Alchemy Barcode Scanner application (TypeScript version)
 * This script handles handheld barcode scanner input, location selection, and record updates.
 */
// Debug console messages to check if the script is loading
console.log('Scanner.js (TypeScript version) is loading...');
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM loaded, initializing application...');
    // Type definitions for API data
    // interface Sublocation { id: string; name: string; }
    // interface LocationData { id: string; name: string; sublocations: Sublocation[]; }
    // interface UpdateResult { status: 'success' | 'partial' | 'error'; message: string; successful?: string[]; failed?: { id: string; error: string }[]; }
    // Get tenant information from the global variable
    const tenantInfo = window.tenantInfo || { tenant: 'default', tenantName: 'Default' };
    const tenant = tenantInfo.tenant;
    const tenantName = tenantInfo.tenantName;
    console.log(`Running in tenant: ${tenant} (${tenantName})`);
    // Element variables with type casting
    const barcodeInput = document.getElementById('barcode-input');
    const addBarcodeBtn = document.getElementById('add-barcode');
    const scannedItemsTbody = document.getElementById('scanned-items-tbody');
    const noScannedItemsRow = document.getElementById('no-scanned-items-row');
    const locationSelect = document.getElementById('location-select');
    const sublocationSelect = document.getElementById('sublocation-select');
    const updateButton = document.getElementById('update-button');
    const resetButton = document.getElementById('reset-button');
    const processingStatus = document.getElementById('processing-status');
    const statusText = document.getElementById('status-text');
    const progressBar = document.getElementById('progress-bar');
    const updateResults = document.getElementById('update-results');
    const resultsContent = document.getElementById('results-content');
    // State variables
    let isSelectingLocation = false;
    let recordIds = [];
    let locationData = [];
    /**
     * Initializes the application by fetching locations and attaching event listeners.
     */
    function init() {
        console.log('Initializing application...');
        fetchLocations();
        // Event Listeners
        addBarcodeBtn?.addEventListener('click', addBarcode);
        locationSelect?.addEventListener('mousedown', () => isSelectingLocation = true);
        locationSelect?.addEventListener('focus', () => isSelectingLocation = true);
        locationSelect?.addEventListener('blur', () => setTimeout(() => isSelectingLocation = false, 200));
        locationSelect?.addEventListener('change', handleLocationChange);
        sublocationSelect?.addEventListener('mousedown', () => isSelectingLocation = true);
        sublocationSelect?.addEventListener('focus', () => isSelectingLocation = true);
        sublocationSelect?.addEventListener('blur', () => setTimeout(() => isSelectingLocation = false, 200));
        updateButton?.addEventListener('click', updateRecordLocations);
        resetButton?.addEventListener('click', resetApp);
        barcodeInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBarcode();
            }
        });
        barcodeInput?.addEventListener('blur', () => {
            setTimeout(() => {
                if (!isSelectingLocation) {
                    barcodeInput.focus();
                }
            }, 200);
        });
        updateUI();
        barcodeInput?.focus();
        console.log('Application initialized');
    }
    /**
     * Fetches available locations from the server.
     */
    async function fetchLocations() {
        console.log('Fetching locations...');
        if (!locationSelect)
            return;
        locationSelect.innerHTML = '<option value="">Loading locations...</option>';
        try {
            const response = await fetch(`/get-locations/${tenant}`);
            if (!response.ok)
                throw new Error(`API returned status: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data))
                throw new Error("Locations data is not an array");
            locationData = data;
            populateLocations(data);
        }
        catch (error) {
            console.error('Error fetching locations:', error);
            showNotification('Failed to load locations. Please refresh.', 'error');
            locationSelect.innerHTML = '<option value="">Failed to load</option>';
        }
    }
    /**
     * Populates the location dropdown menu.
     * @param {LocationData[]} locations - The array of location data.
     */
    function populateLocations(locations) {
        if (!locationSelect)
            return;
        locationSelect.innerHTML = '<option value="">-- Please Select --</option>';
        locations.forEach(location => {
            if (location?.id && location.name) {
                const option = document.createElement('option');
                option.value = location.id;
                option.textContent = location.name;
                locationSelect.appendChild(option);
            }
        });
    }
    /**
     * Handles changes in the main location dropdown to populate sublocations.
     */
    function handleLocationChange() {
        if (!sublocationSelect || !locationSelect)
            return;
        const selectedLocationId = locationSelect.value;
        sublocationSelect.innerHTML = '<option value="">-- Please Select --</option>';
        sublocationSelect.disabled = true;
        if (!selectedLocationId) {
            updateUI();
            return;
        }
        const selectedLocation = locationData.find(loc => loc.id === selectedLocationId);
        if (selectedLocation?.sublocations && selectedLocation.sublocations.length > 0) {
            const sortedSublocations = [...selectedLocation.sublocations].sort((a, b) => a.name.localeCompare(b.name));
            sortedSublocations.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub.id;
                option.textContent = sub.name;
                sublocationSelect.appendChild(option);
            });
            sublocationSelect.disabled = false;
        }
        updateUI();
    }
    /**
     * Adds a scanned barcode to the list.
     */
    function addBarcode() {
        if (!barcodeInput || !scannedItemsTbody)
            return;
        const code = barcodeInput.value.trim();
        if (!code) {
            showNotification('Please enter a barcode.', 'warning');
            return;
        }
        if (recordIds.includes(code)) {
            showNotification('This barcode has already been scanned.', 'warning');
            barcodeInput.value = '';
            return;
        }
        recordIds.push(code);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${code}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger remove-item" data-id="${code}" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        tr.querySelector('.remove-item')?.addEventListener('click', function () {
            removeRecordId(this.getAttribute('data-id'));
        });
        scannedItemsTbody.appendChild(tr);
        barcodeInput.value = '';
        barcodeInput.focus();
        playBeepSound();
        updateUI();
    }
    /**
     * Removes a record ID from the list.
     * @param {string | null} id - The record ID to remove.
     */
    function removeRecordId(id) {
        if (!id)
            return;
        recordIds = recordIds.filter(recordId => recordId !== id);
        scannedItemsTbody?.querySelector(`button[data-id="${id}"]`)?.closest('tr')?.remove();
        updateUI();
        barcodeInput?.focus();
    }
    /**
     * Sends the collected data to the server to update record locations.
     */
    async function updateRecordLocations() {
        const locationId = locationSelect?.value;
        if (recordIds.length === 0 || !locationId) {
            showNotification('Please scan barcodes and select a location.', 'error');
            return;
        }
        if (!updateButton || !processingStatus || !progressBar || !statusText)
            return;
        // UI updates for processing
        updateButton.disabled = true;
        processingStatus.style.display = 'block';
        progressBar.style.width = '50%';
        statusText.textContent = 'Processing update...';
        const payload = {
            recordIds: recordIds,
            locationId: locationId,
            sublocationId: sublocationSelect?.value || '',
        };
        try {
            const response = await fetch(`/update-location/${tenant}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok)
                throw new Error(`API error: ${response.statusText}`);
            const result = await response.json();
            progressBar.style.width = '100%';
            setTimeout(() => {
                processingStatus.style.display = 'none';
                displayUpdateResults(result);
                updateButton.disabled = false;
            }, 1000);
        }
        catch (error) {
            console.error('Error updating locations:', error);
            showNotification(`Update failed: ${error.message}`, 'error');
            processingStatus.style.display = 'none';
            updateButton.disabled = false;
        }
    }
    /**
     * Displays the results of the update operation.
     * @param {UpdateResult} result - The result object from the server.
     */
    function displayUpdateResults(result) {
        if (!updateResults || !resultsContent)
            return;
        let html = '';
        if (result.status === 'success') {
            html = `<div class="alert alert-success"><strong>Success!</strong> ${result.message}</div>`;
            if (result.successful?.length) {
                html += `<p>Successfully updated:</p><ul class="list-group list-group-flush">${result.successful.map(id => `<li class="list-group-item">${id}</li>`).join('')}</ul>`;
            }
        }
        else if (result.status === 'partial') {
            html = `<div class="alert alert-warning"><strong>Partial Success.</strong> ${result.message}</div>`;
            if (result.successful?.length) {
                html += `<p>Successfully updated:</p><ul class="list-group list-group-flush">${result.successful.map(id => `<li class="list-group-item">${id}</li>`).join('')}</ul>`;
            }
            if (result.failed?.length) {
                html += `<p class="mt-3">Failed to update:</p><ul class="list-group list-group-flush">${result.failed.map(item => `<li class="list-group-item">${item.id} - <span class="text-danger">${item.error}</span></li>`).join('')}</ul>`;
            }
        }
        else {
            html = `<div class="alert alert-danger"><strong>Error!</strong> ${result.message || 'An unknown error occurred'}</div>`;
        }
        resultsContent.innerHTML = html;
        updateResults.style.display = 'block';
    }
    /**
     * Resets the application to its initial state.
     */
    function resetApp() {
        recordIds = [];
        if (scannedItemsTbody)
            scannedItemsTbody.innerHTML = '';
        if (barcodeInput)
            barcodeInput.value = '';
        if (locationSelect)
            locationSelect.selectedIndex = 0;
        if (sublocationSelect) {
            sublocationSelect.innerHTML = '<option value="">-- Please Select --</option>';
            sublocationSelect.disabled = true;
        }
        if (updateResults)
            updateResults.style.display = 'none';
        updateUI();
        barcodeInput?.focus();
        console.log('Application reset');
    }
    /**
     * Updates the UI state, such as enabling/disabling buttons.
     */
    function updateUI() {
        if (noScannedItemsRow) {
            noScannedItemsRow.style.display = recordIds.length === 0 ? '' : 'none';
        }
        const enableUpdate = recordIds.length > 0 && !!locationSelect?.value;
        if (updateButton) {
            updateButton.disabled = !enableUpdate;
        }
    }
    /**
     * Shows a temporary notification message.
     * @param {string} message - The message to display.
     * @param {'success' | 'warning' | 'error'} type - The type of notification.
     */
    function showNotification(message, type) {
        const alertClass = type === 'error' ? 'alert-danger' : `alert-${type}`;
        const notification = document.createElement('div');
        notification.className = `alert ${alertClass} notification`;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 1050;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: none;
        `;
        notification.innerHTML = message;
        document.body.appendChild(notification);
        // Fade in
        let opacity = 0;
        notification.style.display = 'block';
        const fadeIn = setInterval(() => {
            if (opacity >= 1)
                clearInterval(fadeIn);
            notification.style.opacity = String(opacity);
            opacity += 0.1;
        }, 20);
        // Fade out and remove after 3 seconds
        setTimeout(() => {
            let opacity = 1;
            const fadeOut = setInterval(() => {
                if (opacity <= 0) {
                    clearInterval(fadeOut);
                    document.body.removeChild(notification);
                }
                notification.style.opacity = String(opacity);
                opacity -= 0.1;
            }, 50);
        }, 3000);
    }
    /**
     * Plays a beep sound effect.
     */
    function playBeepSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            gainNode.gain.value = 0.1; // Lower volume
            oscillator.frequency.value = 880; // A5 note
            oscillator.type = 'sine';
            oscillator.start();
            setTimeout(() => oscillator.stop(), 150); // Beep duration
        }
        catch (e) {
            console.warn('Unable to play beep sound:', e);
        }
    }
    // Start the application
    init();
});
