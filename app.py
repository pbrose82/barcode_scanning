from flask import Flask, request, jsonify, render_template, send_from_directory, redirect, url_for, Response
import os
import logging
import json
import requests
import time

# Logging Configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Flask Application Setup
app = Flask(__name__, static_folder='static', template_folder='templates')

# Authentication for admin routes
def authenticate(username, password):
    """Validate admin credentials"""
    admin_username = os.getenv('ADMIN_USERNAME', 'admin')
    admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')
    return username == admin_username and password == admin_password

@app.before_request
def require_auth():
    """Require authentication for admin routes"""
    if request.path.startswith('/admin'):
        auth = request.authorization
        if not auth or not authenticate(auth.username, auth.password):
            return Response(
                'Could not verify your access level for that URL.\n'
                'You have to login with proper credentials', 401,
                {'WWW-Authenticate': 'Basic realm="Admin Access"'})

def ensure_config_file():
    """Create config.json if it doesn't exist"""
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    if not os.path.exists(config_path):
        logging.info(f"Creating config file at {config_path}")
        config = {
            "default_tenant": "default",
            "default_urls": {
                "refresh_url": "https://core-production.alchemy.cloud/core/api/v2/refresh-token",
                "api_url": "https://core-production.alchemy.cloud/core/api/v2/update-record",
                "filter_url": "https://core-production.alchemy.cloud/core/api/v2/filter-records",
                "find_records_url": "https://core-production.alchemy.cloud/core/api/v2/find-records",
                "base_url": "https://app.alchemy.cloud/"
            },
            "tenants": {
                "default": {
                    "tenant_name": "productcaseelnlims4uat",
                    "display_name": "Product Case ELN&LIMS UAT",
                    "description": "Primary Alchemy environment",
                    "button_class": "primary",
                    "env_token_var": "DEFAULT_REFRESH_TOKEN",
                    "use_custom_urls": False
                },
                "tenant1": {
                    "tenant_name": "caseelnlims4uat",
                    "display_name": "CASE ELN&LIMS UAT",
                    "description": "Test environment",
                    "button_class": "primary",
                    "env_token_var": "TENANT1_REFRESH_TOKEN",
                    "use_custom_urls": False
                },
                "custom": {
                    "tenant_name": "custom",
                    "display_name": "Custom Tenant",
                    "description": "Custom Alchemy environment",
                    "button_class": "warning",
                    "env_token_var": "CUSTOM_REFRESH_TOKEN",
                    "use_custom_urls": True,
                    "custom_urls": {
                        "refresh_url": "https://custom-instance.alchemy.cloud/core/api/v2/refresh-token",
                        "api_url": "https://custom-instance.alchemy.cloud/core/api/v2/update-record", 
                        "filter_url": "https://custom-instance.alchemy.cloud/core/api/v2/filter-records",
                        "find_records_url": "https://custom-instance.alchemy.cloud/core/api/v2/find-records",
                        "base_url": "https://custom-instance.alchemy.cloud/"
                    }
                }
            }
        }
        try:
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)
            return True
        except Exception as e:
            logging.error(f"Error creating config file: {str(e)}")
            return False
    return True

def load_config():
    try:
        paths = [
            os.path.join(os.path.dirname(__file__), 'config.json'),
            '/app/config.json',
            '/barcode_scanning/config.json',
            os.path.join(os.path.dirname(__file__), '..', 'config.json'),
            './config.json',
            '../config.json',
            '/app/barcode_scanning/config.json',
            os.path.abspath('config.json')
        ]
        
        for config_path in paths:
            logging.info(f"Checking for config file at: {config_path}")
            if os.path.exists(config_path):
                logging.info(f"Found config file at {config_path}")
                with open(config_path, 'r') as f:
                    return json.load(f)
        
        # Print the current working directory to help debug
        logging.warning(f"Current working directory: {os.getcwd()}")
        logging.warning(f"Directory contents: {os.listdir('.')}")
        logging.warning("Config file not found in any of the expected locations, using default configuration")
        return create_default_config()
    except Exception as e:
        logging.error(f"Error loading configuration: {str(e)}")
        return create_default_config()

def save_config():
    """Save the current configuration to the config file"""
    try:
        config_path = os.path.join(os.path.dirname(__file__), 'config.json')
        with open(config_path, 'w') as f:
            json.dump(CONFIG, f, indent=2)
        logging.info(f"Configuration saved to {config_path}")
        return True
    except Exception as e:
        logging.error(f"Error saving configuration: {str(e)}")
        return False

def create_default_config():
    """Create a default configuration if the config file is not found"""
    return {
        "default_tenant": "default",
        "default_urls": {
            "refresh_url": "https://core-production.alchemy.cloud/core/api/v2/refresh-token",
            "api_url": "https://core-production.alchemy.cloud/core/api/v2/update-record",
            "filter_url": "https://core-production.alchemy.cloud/core/api/v2/filter-records",
            "find_records_url": "https://core-production.alchemy.cloud/core/api/v2/find-records",
            "base_url": "https://app.alchemy.cloud/"
        },
        "tenants": {
            "default": {
                "tenant_name": "productcaseelnlims4uat",
                "display_name": "Default Tenant",
                "description": "Primary Alchemy environment",
                "button_class": "primary",
                "env_token_var": "ALCHEMY_REFRESH_TOKEN",
                "use_custom_urls": False
            }
        }
    }

# Load configuration
ensure_config_file()
CONFIG = load_config()
DEFAULT_URLS = CONFIG["default_urls"]
DEFAULT_TENANT = CONFIG["default_tenant"]

# Global Token Cache
token_cache = {}

def get_tenant_config(tenant_id):
    """Get tenant configuration from config file"""
    if tenant_id not in CONFIG["tenants"]:
        logging.error(f"Tenant {tenant_id} not found in configuration")
        tenant_id = DEFAULT_TENANT
    
    tenant = CONFIG["tenants"][tenant_id]
    
    # Build the complete tenant configuration
    tenant_config = {
        "tenant_id": tenant_id,
        "tenant_name": tenant.get("tenant_name"),
        "display_name": tenant.get("display_name", tenant.get("tenant_name")),
        "description": tenant.get("description", ""),
        "button_class": tenant.get("button_class", "primary"),
    }
    
    # Check for a directly stored refresh token first
    if "stored_refresh_token" in tenant and tenant["stored_refresh_token"]:
        tenant_config["refresh_token"] = tenant["stored_refresh_token"]
    else:
        # Fall back to environment variable
        tenant_config["refresh_token"] = os.getenv(tenant.get("env_token_var"))
    
    # Add URLs based on config
    if tenant.get("use_custom_urls") and "custom_urls" in tenant:
        tenant_config.update({
            "refresh_url": tenant["custom_urls"].get("refresh_url"),
            "api_url": tenant["custom_urls"].get("api_url"),
            "filter_url": tenant["custom_urls"].get("filter_url"),
            "find_records_url": tenant["custom_urls"].get("find_records_url"),
            "base_url": tenant["custom_urls"].get("base_url")
        })
    else:
        tenant_config.update({
            "refresh_url": DEFAULT_URLS["refresh_url"],
            "api_url": DEFAULT_URLS["api_url"],
            "filter_url": DEFAULT_URLS["filter_url"],
            "find_records_url": DEFAULT_URLS["find_records_url"],
            "base_url": DEFAULT_URLS["base_url"]
        })
    
    return tenant_config

@app.route('/api/update-tenant-token', methods=['POST'])
def update_tenant_token():
    """Update refresh token for a tenant directly in the config"""
    try:
        data = request.json
        if not data or 'tenant_id' not in data or 'refresh_token' not in data:
            return jsonify({
                "status": "error", 
                "message": "Missing tenant_id or refresh_token"
            }), 400
            
        tenant_id = data['tenant_id']
        refresh_token = data['refresh_token']
        
        # Check if tenant exists
        if tenant_id not in CONFIG["tenants"]:
            return jsonify({
                "status": "error", 
                "message": f"Tenant {tenant_id} not found"
            }), 404
            
        # Update token in config
        CONFIG["tenants"][tenant_id]["stored_refresh_token"] = refresh_token
        
        # Save the updated config
        save_config()
        
        # Clear the token cache for this tenant
        if tenant_id in token_cache:
            del token_cache[tenant_id]
        
        return jsonify({
            "status": "success", 
            "message": f"Refresh token updated for tenant {tenant_id}"
        })
        
    except Exception as e:
        logging.error(f"Error updating tenant token: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# Route Handlers
@app.route('/')
def root():
    # Show tenant selector page
    return render_template('tenant_selector.html', tenants=CONFIG["tenants"])

@app.route('/tenant/<tenant>')
def index(tenant):
    # Validate tenant
    if tenant not in CONFIG["tenants"]:
        return render_template('error.html', message=f"Unknown tenant: {tenant}"), 404
    
    tenant_config = get_tenant_config(tenant)
    
    app.logger.info(f"Rendering index.html for tenant: {tenant} ({tenant_config['tenant_name']})")
    return render_template('index.html', tenant=tenant, tenant_name=tenant_config['display_name'])

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/admin', methods=['GET'])
def admin_panel():
    """Simple admin panel to manage tenants"""
    return render_template('admin.html', tenants=CONFIG["tenants"], default_tenant=DEFAULT_TENANT)

@app.route('/admin/add-tenant', methods=['POST'])
def add_tenant():
    """Add a new tenant to the configuration"""
    try:
        tenant_id = request.form.get('tenant_id')
        tenant_name = request.form.get('tenant_name')
        display_name = request.form.get('display_name')
        description = request.form.get('description', '')
        button_class = request.form.get('button_class', 'primary')
        env_token_var = request.form.get('env_token_var')
        use_custom_urls = request.form.get('use_custom_urls') == 'on'
        
        # Validate input
        if not tenant_id or not tenant_name or not display_name or not env_token_var:
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
        # Check if tenant already exists
        if tenant_id in CONFIG["tenants"]:
            return jsonify({"status": "error", "message": f"Tenant {tenant_id} already exists"}), 400
        
        # Create tenant config
        new_tenant = {
            "tenant_name": tenant_name,
            "display_name": display_name,
            "description": description,
            "button_class": button_class,
            "env_token_var": env_token_var,
            "use_custom_urls": use_custom_urls
        }
        
        # Add custom URLs if needed
        if use_custom_urls:
            new_tenant["custom_urls"] = {
                "refresh_url": request.form.get('refresh_url', DEFAULT_URLS["refresh_url"]),
                "api_url": request.form.get('api_url', DEFAULT_URLS["api_url"]),
                "filter_url": request.form.get('filter_url', DEFAULT_URLS["filter_url"]),
                "find_records_url": request.form.get('find_records_url', DEFAULT_URLS["find_records_url"]),
                "base_url": request.form.get('base_url', DEFAULT_URLS["base_url"])
            }
        
        # Update configuration in memory
        CONFIG["tenants"][tenant_id] = new_tenant
        
        # Save configuration to file
        save_config()
        
        return jsonify({"status": "success", "message": f"Tenant {display_name} added successfully"})
    except Exception as e:
        logging.error(f"Error adding tenant: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/admin/update-tenant/<tenant_id>', methods=['POST'])
def update_tenant(tenant_id):
    """Update an existing tenant"""
    try:
        # Check if tenant exists
        if tenant_id not in CONFIG["tenants"]:
            return jsonify({"status": "error", "message": f"Tenant {tenant_id} not found"}), 404
        
        tenant_name = request.form.get('tenant_name')
        display_name = request.form.get('display_name')
        description = request.form.get('description', '')
        button_class = request.form.get('button_class', 'primary')
        env_token_var = request.form.get('env_token_var')
        use_custom_urls = request.form.get('use_custom_urls') == 'on'
        
        # Validate input
        if not tenant_name or not display_name or not env_token_var:
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
        # Update tenant config
        CONFIG["tenants"][tenant_id].update({
            "tenant_name": tenant_name,
            "display_name": display_name,
            "description": description,
            "button_class": button_class,
            "env_token_var": env_token_var,
            "use_custom_urls": use_custom_urls
        })
        
        # Update custom URLs if needed
        if use_custom_urls:
            CONFIG["tenants"][tenant_id]["custom_urls"] = {
                "refresh_url": request.form.get('refresh_url', DEFAULT_URLS["refresh_url"]),
                "api_url": request.form.get('api_url', DEFAULT_URLS["api_url"]),
                "filter_url": request.form.get('filter_url', DEFAULT_URLS["filter_url"]),
                "find_records_url": request.form.get('find_records_url', DEFAULT_URLS["find_records_url"]),
                "base_url": request.form.get('base_url', DEFAULT_URLS["base_url"])
            }
        elif "custom_urls" in CONFIG["tenants"][tenant_id]:
            del CONFIG["tenants"][tenant_id]["custom_urls"]
        
        # Save configuration to file
        save_config()
        
        return jsonify({"status": "success", "message": f"Tenant {display_name} updated successfully"})
    except Exception as e:
        logging.error(f"Error updating tenant: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/admin/delete-tenant/<tenant_id>', methods=['POST'])
def delete_tenant(tenant_id):
    """Delete a tenant"""
    try:
        # Check if tenant exists
        if tenant_id not in CONFIG["tenants"]:
            return jsonify({"status": "error", "message": f"Tenant {tenant_id} not found"}), 404
        
        # Can't delete default tenant
        if tenant_id == DEFAULT_TENANT:
            return jsonify({"status": "error", "message": "Cannot delete default tenant"}), 400
        
        # Delete tenant
        display_name = CONFIG["tenants"][tenant_id].get("display_name", tenant_id)
        del CONFIG["tenants"][tenant_id]
        
        # Save configuration to file
        save_config()
        
        return jsonify({"status": "success", "message": f"Tenant {display_name} deleted successfully"})
    except Exception as e:
        logging.error(f"Error deleting tenant: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/admin/reload-config', methods=['POST'])
def reload_config():
    """Reload the configuration from disk"""
    global CONFIG, DEFAULT_URLS, DEFAULT_TENANT
    try:
        CONFIG = load_config()
        DEFAULT_URLS = CONFIG["default_urls"]
        DEFAULT_TENANT = CONFIG["default_tenant"]
        
        # Clear token cache to force token refresh for all tenants
        global token_cache
        token_cache = {}
        
        return jsonify({"status": "success", "message": "Configuration reloaded successfully"})
    except Exception as e:
        logging.error(f"Error reloading configuration: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/debug/<tenant>')
def debug_page(tenant):
    """Simple HTML debug page for locations without using templates"""
    try:
        # Validate tenant
        if tenant not in CONFIG["tenants"]:
            return render_template('error.html', message=f"Unknown tenant: {tenant}"), 404
        
        tenant_config = get_tenant_config(tenant)
        
        # Get test locations
        test_locations = get_fallback_locations()
        
        # Build HTML response - Use string concatenation for JS instead of template literals
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Location Debug - {tenant_config['display_name']}</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body>
            <div class="container mt-4">
                <h1>Location Debug - Tenant: {tenant_config['display_name']}</h1>
                
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
                const tenant = "{tenant}";
                
                let locationData = [];
                
                function init() {{
                    testBtn.addEventListener('click', () => fetchLocations('/get-test-locations/' + tenant));
                    realBtn.addEventListener('click', () => fetchLocations('/get-locations/' + tenant));
                    locationSelect.addEventListener('change', handleLocationChange);
                    
                    // Initial load of test locations
                    fetchLocations('/get-test-locations/' + tenant);
                }}
                
                function fetchLocations(endpoint) {{
                    status.textContent = 'Loading...';
                    locationSelect.innerHTML = '<option value="">Loading...</option>';
                    
                    fetch(endpoint)
                        .then(response => response.json())
                        .then(data => {{
                            status.textContent = 'Loaded ' + data.length + ' locations';
                            output.textContent = JSON.stringify(data, null, 2);
                            locationData = data;
                            populateLocations(data);
                        }})
                        .catch(error => {{
                            status.textContent = 'Error: ' + error.message;
                            output.textContent = error.toString();
                        }});
                }}
                
                function populateLocations(locations) {{
                    locationSelect.innerHTML = '<option value="">-- Select Location --</option>';
                    
                    locations.forEach(location => {{
                        const option = document.createElement('option');
                        option.value = location.id;
                        option.textContent = location.name || 'Unnamed Location';
                        locationSelect.appendChild(option);
                    }});
                }}
                
                function handleLocationChange() {{
                    const selectedId = locationSelect.value;
                    sublocationSelect.innerHTML = '<option value="">-- Select Sublocation --</option>';
                    
                    if (!selectedId) {{
                        sublocationSelect.disabled = true;
                        return;
                    }}
                    
                    const location = locationData.find(loc => loc.id === selectedId);
                    
                    if (location && location.sublocations && location.sublocations.length) {{
                        location.sublocations.forEach(sub => {{
                            const option = document.createElement('option');
                            option.value = sub.id;
                            option.textContent = sub.name;
                            sublocationSelect.appendChild(option);
                        }});
                        sublocationSelect.disabled = false;
                    }} else {{
                        sublocationSelect.disabled = true;
                    }}
                }}
                
                init();
            </script>
        </body>
        </html>
        """
        return html
    except Exception as e:
        return f"<h1>Error</h1><p>{str(e)}</p>"

def refresh_alchemy_token(tenant):
    """Refresh the Alchemy API token for a specific tenant"""
    global token_cache
    
    # Get tenant configuration
    tenant_config = get_tenant_config(tenant)
    refresh_token = tenant_config.get('refresh_token')
    refresh_url = tenant_config.get('refresh_url')
    tenant_name = tenant_config.get('tenant_name')
    
    # Create token cache entry for tenant if it doesn't exist
    if tenant not in token_cache:
        token_cache[tenant] = {
            "access_token": None,
            "expires_at": 0
        }
    
    current_time = time.time()
    if (token_cache[tenant]["access_token"] and 
        token_cache[tenant]["expires_at"] > current_time + 300):
        logging.info(f"Using cached Alchemy token for tenant: {tenant}")
        return token_cache[tenant]["access_token"]
    
    if not refresh_token:
        logging.error(f"Missing refresh token for tenant: {tenant}")
        return None
    
    try:
        logging.info(f"Refreshing Alchemy API token for tenant: {tenant}")
        response = requests.put(
            refresh_url, 
            json={"refreshToken": refresh_token},
            headers={"Content-Type": "application/json"}
        )
        
        if not response.ok:
            logging.error(f"Failed to refresh token for tenant {tenant}. Status: {response.status_code}, Response: {response.text}")
            return None
        
        data = response.json()
        
        # Find token for the specified tenant
        tenant_token = next((token for token in data.get("tokens", []) 
                            if token.get("tenant") == tenant_name), None)
        
        if not tenant_token:
            logging.error(f"Tenant '{tenant_name}' not found in refresh response")
            return None
        
        # Cache the token
        access_token = tenant_token.get("accessToken")
        expires_in = tenant_token.get("expiresIn", 3600)
        
        token_cache[tenant] = {
            "access_token": access_token,
            "expires_at": current_time + expires_in
        }
        
        logging.info(f"Successfully refreshed Alchemy token for tenant {tenant}, expires in {expires_in} seconds")
        return access_token
        
    except Exception as e:
        logging.error(f"Error refreshing Alchemy token for tenant {tenant}: {str(e)}")
        return None

# Route for getting test locations (reliable hardcoded data)
@app.route('/get-test-locations/<tenant>', methods=['GET'])
def get_test_locations(tenant):
    """Return hardcoded test locations for debugging frontend"""
    # Get tenant configuration
    tenant_config = get_tenant_config(tenant)
    tenant_display_name = tenant_config.get('display_name')
    
    test_locations = [
        {
            "id": "1001",
            "name": f"Warehouse A ({tenant_display_name})",
            "sublocations": [
                {"id": "sub1", "name": "Section A1"},
                {"id": "sub2", "name": "Section A2"}
            ]
        },
        {
            "id": "1002",
            "name": f"Laboratory B ({tenant_display_name})",
            "sublocations": [
                {"id": "sub3", "name": "Lab Storage 1"},
                {"id": "sub4", "name": "Lab Storage 2"}
            ]
        },
        {
            "id": "1003",
            "name": f"Office Building ({tenant_display_name})",
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
@app.route('/get-locations/<tenant>', methods=['GET'])
def get_locations(tenant):
    try:
        # Check if tenant exists
        if tenant not in CONFIG["tenants"]:
            return jsonify({"error": f"Unknown tenant: {tenant}"}), 404
            
        tenant_config = get_tenant_config(tenant)
        
        # Get access token
        access_token = refresh_alchemy_token(tenant)
        
        if not access_token:
            logging.warning(f"Failed to get access token for tenant {tenant}, returning fallback locations")
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
        
        filter_url = tenant_config.get('filter_url')
        logging.info(f"Fetching locations from Alchemy API for tenant {tenant}: {json.dumps(filter_payload)}")
        response = requests.put(filter_url, headers=headers, json=filter_payload)
        
        # Log response for debugging
        logging.info(f"Alchemy API response status code for tenant {tenant}: {response.status_code}")
        
        if not response.ok:
            logging.error(f"Error fetching locations for tenant {tenant}: {response.text}")
            return jsonify(get_fallback_locations())
        
        # Process the response
        locations_data = response.json()
        logging.info(f"Received {len(locations_data)} locations from API for tenant {tenant}")
        
        # Debug the API response structure
        debug_api_response(locations_data)
        
        # Log the full first item for debugging
        if locations_data and len(locations_data) > 0:
            logging.info(f"First location data for tenant {tenant}: {json.dumps(locations_data[0])}")
        
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
                logging.info(f"Added location for tenant {tenant}: {location_name} (ID: {location_id}) with {len(sublocations)} sublocations")
                
            except Exception as e:
                logging.error(f"Error processing location {location.get('recordId', location.get('id', 'unknown'))} for tenant {tenant}: {str(e)}")
        
        # If no locations were found, add fallback locations
        if not formatted_locations:
            logging.warning(f"No locations found in API response for tenant {tenant}, adding fallback locations")
            return jsonify(get_fallback_locations())
        
        return jsonify(formatted_locations)
        
    except Exception as e:
        logging.error(f"Error fetching locations for tenant {tenant}: {str(e)}")
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
def find_record_id_by_barcode(barcode, access_token, tenant):
    """Find Alchemy record ID using barcode as the Result.Code"""
    try:
        tenant_config = get_tenant_config(tenant)
        find_records_url = tenant_config.get('find_records_url')
        
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
        
        logging.info(f"Finding record for barcode '{barcode}' in tenant {tenant}: {json.dumps(find_payload)}")
        response = requests.put(find_records_url, headers=headers, json=find_payload)
        
        # Log response for debugging
        logging.info(f"Find records API response status code for tenant {tenant}: {response.status_code}")
        
        if not response.ok:
            logging.error(f"Error finding record for barcode {barcode} in tenant {tenant}: {response.text}")
            return None
        
        # Process response
        records = response.json()
        
        if not records or len(records) == 0:
            logging.warning(f"No records found for barcode {barcode} in tenant {tenant}")
            return None
        
        # Get the first matching record ID
        record_id = records[0].get('recordId') or records[0].get('id')
        
        if not record_id:
            logging.error(f"Found record for barcode {barcode} in tenant {tenant} but could not extract recordId")
            return None
            
        logging.info(f"Found record ID {record_id} for barcode {barcode} in tenant {tenant}")
        return record_id
        
    except Exception as e:
        logging.error(f"Error finding record for barcode {barcode} in tenant {tenant}: {str(e)}")
        return None
@app.route('/api/get-refresh-token', methods=['POST'])
def get_refresh_token():
    """Proxy for Alchemy sign-in API to get refresh tokens"""
    try:
        # Get credentials from request
        data = request.json
        if not data or 'email' not in data or 'password' not in data:
            return jsonify({"status": "error", "message": "Missing email or password"}), 400
            
        # Forward the request to Alchemy API
        alchemy_response = requests.post(
            'https://core-production.alchemy.cloud/core/api/v2/sign-in',
            json={
                "email": data['email'],
                "password": data['password']
            },
            headers={"Content-Type": "application/json"}
        )
        
        # Return the response directly
        return alchemy_response.json(), alchemy_response.status_code
            
    except Exception as e:
        logging.error(f"Error getting refresh token: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500
# Route for updating record location in Alchemy
@app.route('/update-location/<tenant>', methods=['POST'])
def update_location(tenant):
    data = request.json
    
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400
    
    try:
        # Check if tenant exists
        if tenant not in CONFIG["tenants"]:
            return jsonify({"status": "error", "message": f"Unknown tenant: {tenant}"}), 404
            
        tenant_config = get_tenant_config(tenant)
        
        barcode_codes = data.get('recordIds', [])  # These are actually barcode codes now, not record IDs
        location_id = data.get('locationId', '')
        sublocation_id = data.get('sublocationId', '')
        
        if not barcode_codes:
            return jsonify({"status": "error", "message": "No barcode codes provided"}), 400
        
        if not location_id:
            return jsonify({"status": "error", "message": "No location ID provided"}), 400
        
        # Get a fresh access token from Alchemy
        access_token = refresh_alchemy_token(tenant)
        
        if not access_token:
            return jsonify({
                "status": "error", 
                "message": f"Failed to authenticate with Alchemy API for tenant {tenant}"
            }), 500
        
        success_records = []
        failed_records = []
        
        for barcode in barcode_codes:
            try:
                # First, find the record ID from the barcode
                record_id = find_record_id_by_barcode(barcode, access_token, tenant)
                
                if not record_id:
                    failed_records.append({
                        "id": barcode,
                        "error": f"Record not found for this barcode in tenant {tenant_config['display_name']}"
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
                
                api_url = tenant_config.get('api_url')
                logging.info(f"Sending update for record {record_id} (barcode: {barcode}) to Alchemy for tenant {tenant}: {json.dumps(alchemy_payload)}")
                response = requests.put(api_url, headers=headers, json=alchemy_payload)
                
                # Log response for debugging
                logging.info(f"Alchemy API response status code for tenant {tenant}: {response.status_code}")
                if response.text:
                    logging.info(f"Alchemy API response for tenant {tenant}: {response.text}")
                
                # Check if the request was successful
                if response.ok:
                    success_records.append(barcode)
                else:
                    logging.error(f"Error updating record {record_id} (barcode: {barcode}) for tenant {tenant}: {response.text}")
                    failed_records.append({
                        "id": barcode,
                        "error": f"API returned status code {response.status_code}"
                    })
                
            except Exception as e:
                logging.error(f"Error processing barcode {barcode} for tenant {tenant}: {str(e)}")
                failed_records.append({
                    "id": barcode,
                    "error": str(e)
                })
        
        # Return results
        return jsonify({
            "status": "success" if not failed_records else "partial",
            "message": f"Updated {len(success_records)} of {len(barcode_codes)} records in tenant {tenant_config['display_name']}",
            "successful": success_records,
            "failed": failed_records
        })
        
    except Exception as e:
        logging.error(f"Error updating locations for tenant {tenant}: {e}")
        return jsonify({
            "status": "error", 
            "message": str(e)
        }), 500

# Create a simple error.html template
@app.route('/create-error-template')
def create_error_template():
    """Create error.html template if it doesn't exist"""
    try:
        template_path = os.path.join(app.template_folder, 'error.html')
        
        # Check if template already exists
        if os.path.exists(template_path):
            return "Error template already exists."
        
        # Create templates directory if it doesn't exist
        if not os.path.exists(app.template_folder):
            os.makedirs(app.template_folder)
        
        # Write error template
        error_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Alchemy Barcode Scanner</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            padding: 30px;
        }
        .error-container {
            max-width: 600px;
            margin: 50px auto;
            text-align: center;
        }
        .error-icon {
            font-size: 64px;
            color: #dc3545;
            margin-bottom: 20px;
        }
        .btn-home {
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <h1 class="mb-3">Error</h1>
        <div class="alert alert-danger">
            {{ message }}
        </div>
        <a href="/" class="btn btn-primary btn-home">Go to Homepage</a>
    </div>
</body>
</html>"""
        
        with open(template_path, 'w') as f:
            f.write(error_html)
            
        return "Error template created successfully."
    except Exception as e:
        return f"Error creating template: {str(e)}"

# Main Application Runner
if __name__ == '__main__':
    # Get port from environment variable or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
