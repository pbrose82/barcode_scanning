FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy only the app.py and requirements.txt
COPY app.py requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p static/css static/js templates

# Create placeholder files
RUN echo '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 150 50"><text x="10" y="35" font-family="Arial" font-size="24" fill="#2196F3">Alchemy</text></svg>' > static/Alchemy-logo.svg
RUN echo '/* Placeholder CSS */' > static/css/styles.css
RUN echo '// Placeholder JS' > static/js/scanner.js
RUN echo '<!DOCTYPE html><html><head><title>Alchemy Barcode Scanner</title></head><body><h1>Alchemy Barcode Scanner</h1></body></html>' > templates/index.html

# Expose port - environment variable will override this
EXPOSE 5000

# Run the application
CMD gunicorn --bind 0.0.0.0:${PORT:-5000} app:app
