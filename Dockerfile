FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements file first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create directories if they don't exist
RUN mkdir -p static/css static/js templates

# Copy files individually to avoid errors if directories don't exist
COPY app.py .
COPY static/css/styles.css static/css/
COPY static/js/scanner.js static/js/
COPY static/Alchemy-logo.svg static/
COPY templates/index.html templates/

# Expose port - environment variable will override this
EXPOSE 5000

# Run the application
CMD gunicorn --bind 0.0.0.0:${PORT:-5000} app:app
