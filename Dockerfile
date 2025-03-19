FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements file first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create directories
RUN mkdir -p static/css static/js templates

# Copy Python application
COPY app.py .

# Create placeholder files if they don't exist in the repository
# This ensures the build doesn't fail due to missing files

# Create a placeholder SVG logo
RUN echo '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 150 50"><text x="10" y="35" font-family="Arial" font-size="24" fill="#2196F3">Alchemy</text></svg>' > static/Alchemy-logo.svg

# Create placeholder CSS
RUN echo '/* Placeholder CSS */' > static/css/styles.css

# Create placeholder JS
RUN echo '// Placeholder JS' > static/js/scanner.js

# Create placeholder HTML
RUN echo '<!DOCTYPE html><html><head><title>Alchemy Barcode Scanner</title></head><body><h1>Alchemy Barcode Scanner</h1></body></html>' > templates/index.html

# Now copy actual files, overwriting placeholders if they exist
COPY static/css/styles.css static/css/ 2>/dev/null || true
COPY static/js/scanner.js static/js/ 2>/dev/null || true
COPY static/Alchemy-logo.svg static/ 2>/dev/null || true
COPY templates/index.html templates/ 2>/dev/null || true

# Expose port - environment variable will override this
EXPOSE 5000

# Run the application
CMD gunicorn --bind 0.0.0.0:${PORT:-5000} app:app
