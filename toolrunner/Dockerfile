FROM python:3.12-slim

WORKDIR /app

# System packages
RUN apt-get update && apt-get install -y \
    curl wget git nmap whois unzip perl \
    ruby ruby-dev libcurl4-openssl-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Go — GOPATH set to /go so binaries land in /go/bin (on PATH)
ENV GOPATH=/go
ENV PATH=$PATH:/usr/local/go/bin:/go/bin
RUN curl -sSL https://go.dev/dl/go1.22.3.linux-amd64.tar.gz | tar -C /usr/local -xz

# Go tools
RUN go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
RUN go install github.com/projectdiscovery/httpx/cmd/httpx@latest
RUN go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
RUN go install github.com/projectdiscovery/katana/cmd/katana@latest
RUN go install github.com/hakluke/hakrawler@latest
RUN go install github.com/lc/gau/v2/cmd/gau@latest
RUN go install github.com/OJ/gobuster/v3@latest
RUN go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
RUN go install github.com/hahwul/dalfox/v2@latest
RUN go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest

# Python tools
RUN pip install --no-cache-dir flask httpx sqlmap wafw00f

# nikto
RUN git clone --depth 1 https://github.com/sullo/nikto.git /opt/nikto \
    && ln -s /opt/nikto/program/nikto.pl /usr/local/bin/nikto \
    && chmod +x /opt/nikto/program/nikto.pl

# amass — pre-built binary
RUN curl -sL https://github.com/owasp-amass/amass/releases/download/v4.2.0/amass_Linux_amd64.zip \
    -o /tmp/amass.zip && unzip -q /tmp/amass.zip -d /tmp/amass \
    && mv /tmp/amass/amass_Linux_amd64/amass /usr/local/bin/ \
    && chmod +x /usr/local/bin/amass && rm -rf /tmp/amass /tmp/amass.zip

# feroxbuster
RUN curl -sL https://github.com/epi052/feroxbuster/releases/latest/download/x86-linux-feroxbuster.zip \
    -o /tmp/ferox.zip && unzip -q /tmp/ferox.zip -d /tmp \
    && mv /tmp/feroxbuster /usr/local/bin/ \
    && chmod +x /usr/local/bin/feroxbuster && rm /tmp/ferox.zip

# testssl.sh
RUN curl -sL https://github.com/drwetter/testssl.sh/archive/refs/heads/3.2.zip \
    -o /tmp/testssl.zip && unzip -q /tmp/testssl.zip -d /tmp \
    && mv /tmp/testssl.sh-3.2/testssl.sh /usr/local/bin/testssl.sh \
    && chmod +x /usr/local/bin/testssl.sh && rm -rf /tmp/testssl*

# wpscan
RUN gem install wpscan --no-document

# SecLists common wordlist
RUN mkdir -p /wordlists \
    && curl -sL https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/common.txt \
    -o /wordlists/common.txt

# Non-root runtime user — home dir needed for nuclei template cache
RUN useradd -m -s /bin/bash runner \
    && mkdir -p /home/runner/.config \
    && chown -R runner:runner /home/runner

COPY requirements.txt server.py ./
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 9000

USER runner

CMD ["python", "server.py"]
