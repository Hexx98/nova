# HexStrike AI — Tool Execution Backend
# Source: Hexx98/hexstrike-ai (git submodule)
#
# Initialize submodule before building:
#   git submodule add https://github.com/Hexx98/hexstrike-ai hexstrike
#   git submodule update --init --recursive

FROM python:3.12-slim

WORKDIR /app

# Non-root user — HexStrike must never run as root (STRIDE E2 mitigation)
RUN groupadd -r hexstrike && useradd -r -g hexstrike hexstrike

# System deps required by HexStrike tool integrations
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    nmap \
    dnsutils \
    whois \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN pip install uv

# Install Python dependencies
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --frozen 2>/dev/null || pip install -e .

COPY . .

# Wordlist and output directories
RUN mkdir -p /wordlists /output && \
    chown -R hexstrike:hexstrike /app /wordlists /output

EXPOSE 9000

USER hexstrike

# Run HexStrike MCP server in SSE/HTTP transport mode
# Nova communicates with HexStrike over HTTP on port 9000
# Adjust entrypoint once submodule is initialized and startup command confirmed
CMD ["python", "-m", "hexstrike.server", "--transport", "sse", "--port", "9000", "--host", "0.0.0.0"]
