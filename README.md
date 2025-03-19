# Alchemy Barcode Scanner

A web application for scanning barcodes and updating record locations in Alchemy.

## Features

- Scan up to 5 barcodes using the device camera
- Manually enter record IDs if scanning fails
- Select locations and sublocations from a dropdown menu
- Send location updates to Alchemy API
- Track successful and failed updates

## Setup Instructions

### Prerequisites

1. Python 3.6 or higher
2. Environment variables for Alchemy API authentication:
   - ALCHEMY_REFRESH_TOKEN
   - ALCHEMY_REFRESH_URL (optional, defaults provided)
   - ALCHEMY_API_URL (optional, defaults provided)
   - ALCHEMY_BASE_URL (optional, defaults provided)
   - ALCHEMY_TENANT_NAME (optional, defaults provided)

### Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/alchemy-barcode-scanner.git
   cd alchemy-barcode-scanner
   ```

2. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the application:
   ```
   python app.py
   ```

4. Open your browser and go to `http://127.0.0.1:5000/`

## Docker Deployment

1. Build the Docker image:
   ```
   docker build -t alchemy-barcode-scanner .
   ```

2. Run the container:
   ```
   docker run -p 5000:5000 -e ALCHEMY_REFRESH_TOKEN=your_token_here alchemy-barcode-scanner
   ```

## Project Structure

- `app.py`: The main Flask application
- `templates/index.html`: Main HTML template
- `static/css/styles.css`: CSS styles
- `static/js/scanner.js`: JavaScript for barcode scanning and form interactions
- `static/Alchemy-logo.svg`: Alchemy logo for the footer

## Using the Application

1. Select the "START SCANNER" button to activate your device's camera
2. Scan a barcode containing a record ID
3. Repeat up to 5 barcodes
4. Select a location from the dropdown
5. Optionally select a sublocation
6. Click "UPDATE LOCATIONS" to send the updates to Alchemy
7. View the results of the update operation

## License

This project is licensed under the MIT License - see the LICENSE file for details.
