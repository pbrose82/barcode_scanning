FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy only the app.py and requirements.txt
COPY app.py requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p static/css static/js templates

# Create Alchemy logo SVG
RUN echo '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 150 50"><style>.logo-text { font-family: Arial, sans-serif; font-weight: bold; }.primary { fill: #2196F3; }.secondary { fill: #333; }</style><text x="10" y="35" class="logo-text primary" font-size="24">Alchemy</text><text x="120" y="35" class="logo-text secondary" font-size="12">™</text></svg>' > static/Alchemy-logo.svg

# Copy template files
COPY templates/index.html templates/
COPY static/css/styles.css static/css/
COPY static/js/scanner.js static/js/

# Expose port - environment variable will override this
EXPOSE 5000

# Run the application
CMD gunicorn --bind 0.0.0.0:${PORT:-5000} app:app
