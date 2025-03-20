from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import logging
import json
import requests
import time

# Logging Configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Flask Application Setup
app = Flask(__name__, static_folder='static', template_folder='templates')

# Alchemy API Configuration
ALCHEMY_REFRESH_TOKEN = os.getenv('ALCHEMY_REFRESH_TOKEN')
ALCHEMY_REFRESH_URL = os.getenv('ALCHEMY_REFRESH_URL', 'https://core-production.alchemy.cloud/core/api/v2/refresh-token')
ALCHEMY_API_URL = os.getenv('ALCHEMY_API_URL', 'https://core-production.alchemy.cloud/core/api/v2/update-record')
ALCHEMY_FILTER_URL = os.getenv('ALCHEMY_FILTER_URL', 'https://core-production.alchemy.cloud/core/api/v2/filter-records')
ALCHEMY_FIND_RECORDS_URL = os.getenv('ALCHEMY_FIND_RECORDS_URL', 'https://core-production.alchemy.cloud/core/api/v2/find-records')
ALCHEMY_BASE_URL = os.getenv('ALCHEMY_BASE_URL', 'https://app.alchemy.cloud/productcaseelnlims4uat/record/')
ALCHEMY_TENANT_NAME = os.getenv('ALCHEMY_TENANT_NAME', 'productcaseelnlims4uat')

# Global Token Cache
alchemy_token_cache = {
    "access_token": None,
    "expires_at": 0  # Unix timestamp when the token expires
}

# Route Handlers
@app.route('/')
def index():
    app.logger.info("Rendering index.html")
    return render_template('index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/debug')
def debug_page():
    """Simple HTML debug page for locations without using templates"""
    try:
        # Get test locations
        test_locations = get_fallback_locations()
        
        # Build HTML response
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Location Debug</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body>
            <div class="container mt-4">
                <h1>Location Debug</h1>
                
                <div class="mb-4">
                    <button id="testBtn" class="btn btn-primary">Fetch Test Locations</button>
                    <button id="realBtn" class="btn btn-secondary">Fetch Real Locations</button>
                </div>
                
                <div class="row">
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label class="form-label">Location</label>
                            <select id="locationSelect" class="form-select"></select>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">Sublocation</label>
                            <select id="sublocationSelect" class="form-select" disabled></select>
                        </div>
                    </div>
                </div>
                
                <div id="status" class="alert alert-info">Ready</div>
                <div id="output" class="border p-3 bg-light" style="max-height:400px;overflow:auto;"></div>
            </div>
            
            <script>
                // Simple debug script
                const locationSelect = document.getElementById('locationSelect');
                const sublocationSelect = document.getElementById('sublocationSelect');
                const status = document.getElementById('status');
                const output = document.getElementById('output');
                const testBtn = document.getElementById('testBtn');
                const realBtn = document.getElementById('realBtn');
                
                let locationData = [];
                
                function init() {
                    testBtn.addEventListener('click', () => fetchLocations('/get-test-locations'));
                    realBtn.addEventListener('click', () => fetchLocations('/get-locations'));
                    locationSelect.addEventListener('change', handleLocationChange);
                    
                    // Initial load of test locations
                    fetchLocations('/get-test-locations');
                }
                
                function fetchLocations(endpoint) {
                    status.textContent = 'Loading...';
                    locationSelect.innerHTML = '<option value="">Loading...</option>';
                    
                    fetch(endpoint)
                        .then(response => response.json())
                        .then(data => {
                            status.textContent = `Loaded ${data.length} locations`;
                            output.textContent = JSON.stringify(data, null, 2);
                            locationData = data;
                            populateLocations(data);
                        })
                        .catch(error => {
                            status.textContent = `Error: ${error.message}`;
                            output.textContent = error.toString();
                        });
                }
                
                function populateLocations(locations) {
                    locationSelect.innerHTML = '<option value="">-- Select Location --</option>';
                    
                    locations.forEach(location => {
                        const option = document.createElement('option');
                        option.value = location.id;
                        option.textContent = location.name || 'Unnamed Location';
                        locationSelect.appendChild(option);
                    });
                }
                
                function handleLocationChange() {
                    const selectedId = locationSelect.value;
                    sublocationSelect.innerHTML = '<option value="">-- Select Sublocation --</option>';
                    
                    if (!selectedId) {
                        sublocationSelect.disabled = true;
                        return;
                    }
                    
                    const location = locationData.find(loc => loc.id === selectedId);
                    
                    if (location && location.sublocations && location.sublocations.length) {
                        location.sublocations.forEach(sub => {
                            const option = document.createElement('option');
                            option.value = sub.id;
                            option.textContent = sub.name;
                            sublocationSelect.appendChild(option);
                        });
                        sublocationSelect.disabled = false;
                    } else {
                        sublocationSelect.disabled = true;
                    }
                }
                
                init();
            </script>
        </body>
        </html>
        """
        return html
    except Exception as e:
        return f"<h1>Error</h1><p>{str(e)}</p>"

def refresh_alchemy_token():
    """Refresh the Alchemy API token"""
    global alchemy_token_cache
    
    current_time = time.time()
    if (alchemy_token_cache["access_token"] and 
        alchemy_token_cache["expires_at"] > current_time + 300):
        logging.info("Using cached Alchemy token")
        return alchemy_token_cache["access_token"]
    
    if not ALCHEMY_REFRESH_TOKEN:
        logging.error("Missing ALCHEMY_REFRESH_TOKEN environment variable")
        return None
    
    try:
        logging.info("Refreshing Alchemy API token")
        response = requests.put(
            ALCHEMY_REFRESH_URL, 
            json={"refreshToken": ALCHEMY_REFRESH_TOKEN},
            headers={"Content-Type": "application/json"}
        )
        
        if not response.ok:
            logging.error(f"Failed to refresh token. Status: {response.status_code}, Response: {response.text}")
            return None
        
        data = response.json()
        
        # Find token for the specified tenant
        tenant_token = next((token for token in data.get("tokens", []) 
                            if token.get("tenant") == ALCHEMY_TENANT_NAME), None)
        
        if not tenant_token:
            logging.error(f"Tenant '{ALCHEMY_TENANT_NAME}' not found in refresh response")
            return None
        
        # Cache the token
        access_token = tenant_token.get("accessToken")
        expires_in = tenant_token.get("expiresIn", 3600)
        
        alchemy_token_cache = {
            "access_token": access_token,
            "expires_at": current_time + expires_in
        }
        
        logging.info(f"Successfully refreshed Alchemy token, expires in {expires_in} seconds")
        return access_token
        
    except Exception as e:
        logging.error(f"Error refreshing Alchemy token: {str(e)}")
        return None

# Route for getting test locations (reliable hardcoded data)
@app.route('/get-test-locations', methods=['GET'])
def get_test_locations():
    """Return hardcoded test locations for debugging frontend"""
    test_locations = [
        {
            "id": "1001",
            "name": "Warehouse A",
            "sublocations": [
                {"id": "sub1", "name": "Section A1"},
                {"id": "sub2", "name": "Section A2"}
            ]
        },
        {
            "id": "1002",
            "name": "Laboratory B",
            "sublocations": [
                {"id": "sub3", "name": "Lab Storage 1"},
                {"id": "sub4", "name": "Lab Storage 2"}
            ]
        },
        {
            "id": "1003",
            "name": "Office Building",
            "sublocations": []
        }
    ]
    return jsonify(test_locations)

# Helper function to debug API response structure
def debug_api_response(response_data):
    """Log detailed information about the API response structure"""
    try:
        logging.info("Debug API response structure:")
        
        # Check if it's an array
        if isinstance(response_data, list):
            logging.info(f"Response is an array with {len(response_data)} items")
            
            # Look at the first item
            if response_data and len(response_data) > 0:
                first_item = response_data[0]
                logging.info(f"First item type: {type(first_item).__name__}")
                
                # If it's a dict, check its keys
                if isinstance(first_item, dict):
                    logging.info(f"First item keys: {list(first_item.keys())}")
                    
                    # Look at the top-level name
                    if "name" in first_item:
                        logging.info(f"Top-level name: {first_item['name']}")
                    
                    # Look at fields array
                    if "fields" in first_item and isinstance(first_item["fields"], list):
                        logging.info(f"Fields count: {len(first_item['fields'])}")
                        
                        # Log field identifiers
                        identifiers = [field.get("identifier") for field in first_item["fields"] if "identifier" in field]
                        logging.info(f"Field identifiers: {identifiers}")
                        
                        # Check the structure of fields to find potential location name
                        for field in first_item["fields"]:
                            field_id = field.get("identifier", "")
                            logging.info(f"Field: {field_id}")
                            if "rows" in field and field["rows"]:
                                for row_idx, row in enumerate(field["rows"]):
                                    if "values" in row and row["values"]:
                                        for val_idx, val in enumerate(row["values"]):
                                            logging.info(f"  {field_id} Value at [{row_idx}][{val_idx}]: {val.get('value')}")
                    
                    # Look at fieldGroups array
                    if "fieldGroups" in first_item and isinstance(first_item["fieldGroups"], list):
                        logging.info(f"FieldGroups count: {len(first_item['fieldGroups'])}")
                        # Log the first fieldGroup for reference
                        if first_item["fieldGroups"]:
                            logging.info(f"First fieldGroup: {json.dumps(first_item['fieldGroups'][0])}")
        else:
            logging.info(f"Response is not an array, type: {type(response_data).__name__}")
            
    except Exception as e:
        logging.error(f"Error debugging API response: {str(e)}")

# Helper function to get fallback locations
def get_fallback_locations():
    """Return fallback locations if API fails"""
    return [
        {
            "id": "1",
            "name": "Warehouse A (Fallback)",
            "sublocations": [
                {"id": "sub1", "name": "Section A1"},
                {"id": "sub2", "name": "Section A2"}
            ]
        },
        {
            "id": "2",
            "name": "Laboratory (Fallback)",
            "sublocations": [
                {"id": "sub3", "name": "Lab Storage"}
            ]
        }
    ]

# Route for getting locations from Alchemy API
@app.route('/get-locations', methods=['GET'])
def get_locations():
    try:
        # Get access token
        access_token = refresh_alchemy_token()
        
        if not access_token:
            logging.warning("Failed to get access token, returning fallback locations")
            return jsonify(get_fallback_locations())
        
        # Prepare filter request for locations
        filter_payload = {
            "queryTerm": "Result.Status == 'Valid'",
            "recordTemplateIdentifier": "AC_Location",
            "drop": 0,
            "take": 100,  # Fetch up to 100 locations
            "lastChangedOnFrom": "2018-03-03T00:00:00Z",
            "lastChangedOnTo": "2028-03-04T00:00:00Z"
        }
        
        # Send request to Alchemy API
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        logging.info(f"Fetching locations from Alchemy API: {json.dumps(filter_payload)}")
        response = requests.put(ALCHEMY_FILTER_URL, headers=headers, json=filter_payload)
        
        # Log response for debugging
        logging.info(f"Alchemy API response status code: {response.status_code}")
        
        if not response.ok:
            logging.error(f"Error fetching locations: {response.text}")
            return jsonify(get_fallback_locations())
        
        # Process the response
        locations_data = response.json()
        logging.info(f"Received {len(locations_data)} locations from API")
        
        # Debug the API response structure
        debug_api_response(locations_data)
        
        # Log the full first item for debugging
        if locations_data and len(locations_data) > 0:
            logging.info(f"First location data: {json.dumps(locations_data[0])}")
        
        # Transform the data into the format needed by the frontend
        formatted_locations = []
        
        for location in locations_data:
            try:
                # Extract location ID - use recordId if it exists, otherwise fall back to id
                location_id = str(location.get("recordId") or location.get("id", "unknown"))
                
                # Extract location name using improved method
                location_name = extract_location_name_improved(location)
                
                # Extract sublocations - improved version
                sublocations = extract_sublocations_improved(location)
                
                # Create location info object
                location_info = {
                    "id": location_id,
                    "name": location_name,
                    "sublocations": sublocations
                }
                
                formatted_locations.append(location_info)
                logging.info(f"Added location: {location_name} (ID: {location_id}) with {len(sublocations)} sublocations")
                
            except Exception as e:
                logging.error(f"Error processing location {location.get('recordId', location.get('id', 'unknown'))}: {str(e)}")
        
        # If no locations were found, add fallback locations
        if not formatted_locations:
            logging.warning("No locations found in API response, adding fallback locations")
            return jsonify(get_fallback_locations())
        
        return jsonify(formatted_locations)
        
    except Exception as e:
        logging.error(f"Error fetching locations: {str(e)}")
        return jsonify(get_fallback_locations())

def extract_location_name_improved(location):
    """Improved function to extract location name from Alchemy API response"""
    # First, try to use the top-level name field which is most reliable
    if "name" in location and location["name"]:
        return location["name"]
    
    # Fallback to a default name if top-level name isn't available
    default_name = f"Location {location.get('recordId') or location.get('id', 'unknown')}"
    
    # Check for name in fields array if top-level name isn't available
    if "fields" in location:
        # Look for fields with identifiers that might contain location name
        name_field_identifiers = ["LocationName", "RecordName", "Name"]
        for field in location["fields"]:
            identifier = field.get("identifier", "")
            if identifier in name_field_identifiers:
                if field.get("rows") and len(field["rows"]) > 0:
                    row = field["rows"][0]
                    if row.get("values") and len(row["values"]) > 0:
                        value = row["values"][0].get("value")
                        if value and isinstance(value, str) and value.strip():
                            return value
    
    # If no suitable name found, return the default
    return default_name

def extract_sublocations_improved(location):
    """Improved function to extract sublocations from Alchemy API response"""
    sublocations = []
    
    # Check for sublocations in fieldGroups
    if "fieldGroups" in location:
        for group in location["fieldGroups"]:
            group_id = group.get("identifier", "")
            if "Location" in group_id or "SubLocation" in group_id:
                for field in group.get("fields", []):
                    field_id = field.get("identifier", "")
                    if "SubLocation" in field_id or "Sublocation" in field_id:
                        for idx, row in enumerate(field.get("rows", [])):
                            if row.get("values") and len(row["values"]) > 0:
                                value = row["values"][0].get("value")
                                if value:
                                    # Handle both string and object values
                                    if isinstance(value, dict) and "name" in value:
                                        sublocations.append({
                                            "id": str(value.get("recordId", f"sub_{idx}")),
                                            "name": value.get("name", "Unnamed Sublocation")
                                        })
                                    elif isinstance(value, str) and value.strip():
                                        sublocations.append({
                                            "id": f"sub_{location.get('recordId', location.get('id', 'unknown'))}_{idx}",
                                            "name": value
                                        })
    
    # If no sublocations found in fieldGroups, check fields directly
    if not sublocations and "fields" in location:
        for field in location["fields"]:
            field_id = field.get("identifier", "")
            if "SubLocation" in field_id or "Sublocation" in field_id:
                for idx, row in enumerate(field.get("rows", [])):
                    if row.get("values") and len(row["values"]) > 0:
                        value = row["values"][0].get("value")
                        if value and isinstance(value, str) and value.strip():
                            sublocations.append({
                                "id": f"sub_{location.get('recordId', location.get('id', 'unknown'))}_{idx}",
                                "name": value
                            })
    
    return sublocations

# Function to find record ID by scanned barcode
def find_record_id_by_barcode(barcode, access_token):
    """Find Alchemy record ID using barcode as the Result.Code"""
    try:
        # Prepare find request payload
        find_payload = {
            "queryTerm": f"Result.Code == '{barcode}'",
            "recordTemplateIdentifier": "AC_Study_LabTrial",
            "lastChangedOnFrom": "2022-03-03T00:00:00Z",
            "lastChangedOnTo": "2025-12-31T23:59:59Z"  # Extended date range to future
        }
        
        # Send request to Alchemy API
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        logging.info(f"Finding record for barcode '{barcode}': {json.dumps(find_payload)}")
        response = requests.put(ALCHEMY_FIND_RECORDS_URL, headers=headers, json=find_payload)
        
        # Log response for debugging
        logging.info(f"Find records API response status code: {response.status_code}")
        
        if not response.ok:
            logging.error(f"Error finding record for barcode {barcode}: {response.text}")
            return None
        
        # Process response
        records = response.json()
        
        if not records or len(records) == 0:
            logging.warning(f"No records found for barcode {barcode}")
            return None
        
        # Get the first matching record ID
        record_id = records[0].get('recordId') or records[0].get('id')
        
        if not record_id:
            logging.error(f"Found record for barcode {barcode} but could not extract recordId")
            return None
            
        logging.info(f"Found record ID {record_id} for barcode {barcode}")
        return record_id
        
    except Exception as e:
        logging.error(f"Error finding record for barcode {barcode}: {str(e)}")
        return None

# Route for updating record location in Alchemy
@app.route('/update-location', methods=['POST'])
def update_location():
    data = request.json
    
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400
    
    try:
        barcode_codes = data.get('recordIds', [])  # These are actually barcode codes now, not record IDs
        location_id = data.get('locationId', '')
        sublocation_id = data.get('sublocationId', '')
        
        if not barcode_codes:
            return jsonify({"status": "error", "message": "No barcode codes provided"}), 400
        
        if not location_id:
            return jsonify({"status": "error", "message": "No location ID provided"}), 400
        
        # Get a fresh access token from Alchemy
        access_token = refresh_alchemy_token()
        
        if not access_token:
            return jsonify({
                "status": "error", 
                "message": "Failed to authenticate with Alchemy API"
            }), 500
        
        success_records = []
        failed_records = []
        
        for barcode in barcode_codes:
            try:
                # First, find the record ID from the barcode
                record_id = find_record_id_by_barcode(barcode, access_token)
                
                if not record_id:
                    failed_records.append({
                        "id": barcode,
                        "error": "Record not found for this barcode"
                    })
                    continue
                
                # Format data for Alchemy API update
                alchemy_payload = {
                    "recordId": int(record_id),
                    "fields": [
                        {
                            "identifier": "Location",
                            "rows": [
                                {
                                    "row": 0,
                                    "values": [
                                        {
                                            "value": location_id,
                                            "valuePreview": ""
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
                
                # Add sublocation if provided
                if sublocation_id:
                    alchemy_payload["fields"].append({
                        "identifier": "Sublocation",
                        "rows": [
                            {
                                "row": 0,
                                "values": [
                                    {
                                        "value": sublocation_id,
                                        "valuePreview": ""
                                    }
                                ]
                            }
                        ]
                    })
                
                # Send update to Alchemy API
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                }
                
                logging.info(f"Sending update for record {record_id} (barcode: {barcode}) to Alchemy: {json.dumps(alchemy_payload)}")
                response = requests.put(ALCHEMY_API_URL, headers=headers, json=alchemy_payload)
                
                # Log response for debugging
                logging.info(f"Alchemy API response status code: {response.status_code}")
                if response.text:
                    logging.info(f"Alchemy API response: {response.text}")
                
                # Check if the request was successful
                if response.ok:
                    success_records.append(barcode)
                else:
                    logging.error(f"Error updating record {record_id} (barcode: {barcode}): {response.text}")
                    failed_records.append({
                        "id": barcode,
                        "error": f"API returned status code {response.status_code}"
                    })
                
            except Exception as e:
                logging.error(f"Error processing barcode {barcode}: {str(e)}")
                failed_records.append({
                    "id": barcode,
                    "error": str(e)
                })
        
        # Return results
        return jsonify({
            "status": "success" if not failed_records else "partial",
            "message": f"Updated {len(success_records)} of {len(barcode_codes)} records",
            "successful": success_records,
            "failed": failed_records
        })
        
    except Exception as e:
        logging.error(f"Error updating locations: {e}")
        return jsonify({
            "status": "error", 
            "message": str(e)
        }), 500

# Main Application Runner
if __name__ == '__main__':
    # Get port from environment variable or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
