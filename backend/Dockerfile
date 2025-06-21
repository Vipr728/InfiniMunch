FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy frontend files to be served by the backend
COPY frontend ./frontend

# Copy backend code
COPY . .

# Create a non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port (fly.io will set PORT environment variable)
EXPOSE 8080

# Run the server
CMD ["python", "server.py"] 