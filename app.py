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

# Route for getting locations (simulated for now)
@app.route('/get-locations', methods=['GET'])
def get_locations():
    # Simulated list of locations - in a real app, this would come from an API or database
    locations = [
        {"id": "LOC001", "name": "Warehouse A", "sublocations": [
            {"id": "SUB001", "name": "Section A1"},
            {"id": "SUB002", "name": "Section A2"},
            {"id": "SUB003", "name": "Section A3"}
        ]},
        {"id": "LOC002", "name": "Warehouse B", "sublocations": [
            {"id": "SUB004", "name": "Section B1"},
            {"id": "SUB005", "name": "Section B2"}
        ]},
        {"id": "LOC003", "name": "Laboratory", "sublocations": [
            {"id": "SUB006", "name": "Lab Storage 1"},
            {"id": "SUB007", "name": "Lab Storage 2"},
            {"id": "SUB008", "name": "Cold Room"}
        ]},
        {"id": "LOC004", "name": "Office Building", "sublocations": [
            {"id": "SUB009", "name": "Front Desk"},
            {"id": "SUB010", "name": "Mail Room"}
        ]}
    ]
    
    return jsonify(locations)

# Route for updating record location in Alchemy
@app.route('/update-location', methods=['POST'])
def update_location():
    data = request.json
    
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400
    
    try:
        record_ids = data.get('recordIds', [])
        location_id = data.get('locationId', '')
        sublocation_id = data.get('sublocationId', '')
        
        if not record_ids:
            return jsonify({"status": "error", "message": "No record IDs provided"}), 400
        
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
        
        for record_id in record_ids:
            try:
                # Format data for Alchemy API
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
                
                # Send to Alchemy API
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                }
                
                logging.info(f"Sending update for record {record_id} to Alchemy: {json.dumps(alchemy_payload)}")
                response = requests.post(ALCHEMY_API_URL, headers=headers, json=alchemy_payload)
                
                # Log response for debugging
                logging.info(f"Alchemy API response status code: {response.status_code}")
                if response.text:
                    logging.info(f"Alchemy API response: {response.text}")
                
                # Check if the request was successful
                if response.ok:
                    success_records.append(record_id)
                else:
                    logging.error(f"Error updating record {record_id}: {response.text}")
                    failed_records.append({
                        "id": record_id,
                        "error": f"API returned status code {response.status_code}"
                    })
                
            except Exception as e:
                logging.error(f"Error processing record {record_id}: {str(e)}")
                failed_records.append({
                    "id": record_id,
                    "error": str(e)
                })
        
        # Return results
        return jsonify({
            "status": "success" if not failed_records else "partial",
            "message": f"Updated {len(success_records)} of {len(record_ids)} records",
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
