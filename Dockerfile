FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p static/css static/js templates

# Copy application files
COPY app.py .
COPY static/ static/
COPY templates/ templates/

# Create the test.html file directly in the container
RUN echo '<!DOCTYPE html><html><head><title>Location Test</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><style>body{padding:20px}</style></head><body><div class="container"><h2>Location Dropdown Test</h2><div class="mb-3"><button id="fetch-test" class="btn btn-primary me-2">Fetch Test Locations</button><button id="fetch-real" class="btn btn-secondary">Fetch Real Locations</button></div><div class="mb-3"><label class="form-label">Select Location</label><select class="form-select" id="location-select"><option value="">-- Select Location --</option></select></div><div class="mb-3"><label class="form-label">Select Sublocation</label><select class="form-select" id="sublocation-select" disabled><option value="">-- Select Sublocation --</option></select></div><div class="alert alert-info" id="status">Ready to test...</div><div id="api-response" style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;padding:15px;margin-top:20px;max-height:300px;overflow:auto;font-family:monospace;white-space:pre-wrap;"></div></div><script>document.addEventListener("DOMContentLoaded",function(){const e=document.getElementById("location-select"),t=document.getElementById("sublocation-select"),n=document.getElementById("status"),o=document.getElementById("api-response"),a=document.getElementById("fetch-test"),c=document.getElementById("fetch-real");let l=[];function s(n){e.innerHTML="",t.innerHTML="";const o=document.createElement("option");o.value="",o.textContent="-- Select Location --",e.appendChild(o),n.forEach(t=>{const n=document.createElement("option");n.value=t.id,n.textContent=t.name||"Unnamed Location",e.appendChild(n)})}function i(){const o=e.value;t.innerHTML="";const a=document.createElement("option");if(a.value="",a.textContent="-- Select Sublocation --",t.appendChild(a),!o)return void(t.disabled=!0);const c=l.find(e=>e.id===o);c&&c.sublocations&&c.sublocations.length>0?(c.sublocations.forEach(e=>{const n=document.createElement("option");n.value=e.id,n.textContent=e.name||"Unnamed Sublocation",t.appendChild(n)}),t.disabled=!1,n.textContent=`Found ${c.sublocations.length} sublocations for ${c.name}`):(t.appendChild(Object.assign(document.createElement("option"),{value:"",textContent:"No sublocations available",disabled:!0})),t.disabled=!0,n.textContent=`No sublocations found for ${c?.name||"selected location"}`)}a.addEventListener("click",()=>(function(a){n.textContent="Loading locations...",e.innerHTML="<option value=\"\">Loading...</option>",t.innerHTML="<option value=\"\">-- Select Sublocation --</option>",t.disabled=!0,fetch(a).then(e=>e.json()).then(e=>{console.log("Locations fetched:",e),o.textContent=JSON.stringify(e,null,2),n.textContent=`Loaded ${e.length} locations`,l=e,s(e)}).catch(a=>{console.error("Error:",a),n.textContent=`Error: ${a.message}`,e.innerHTML="<option value=\"\">Failed to load locations</option>",o.textContent=a.toString()})}("/get-test-locations"))),c.addEventListener("click",()=>(function(a){n.textContent="Loading locations...",e.innerHTML="<option value=\"\">Loading...</option>",t.innerHTML="<option value=\"\">-- Select Sublocation --</option>",t.disabled=!0,fetch(a).then(e=>e.json()).then(e=>{console.log("Locations fetched:",e),o.textContent=JSON.stringify(e,null,2),n.textContent=`Loaded ${e.length} locations`,l=e,s(e)}).catch(a=>{console.error("Error:",a),n.textContent=`Error: ${a.message}`,e.innerHTML="<option value=\"\">Failed to load locations</option>",o.textContent=a.toString()})}("/get-locations"))),e.addEventListener("change",i)});</script></body></html>' > templates/test.html

# Expose port
EXPOSE 5000

# Run the application
CMD gunicorn --bind 0.0.0.0:${PORT:-5000} app:app
