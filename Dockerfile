FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY static/ static/
COPY templates/ templates/

# Expose port - environment variable will override this
EXPOSE 5000

# Run the application with the correct port
CMD gunicorn --bind 0.0.0.0:$PORT app:app
