# pollar backend: R Plumber API for Render (or any Docker host).
# Build from repo root: docker build -f backend/Dockerfile .
FROM rocker/r-ver:4.4.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    && rm -rf /var/lib/apt/lists/*

RUN R -e "install.packages(c('plumber', 'dplyr', 'tidyr', 'readr', 'tibble', 'jsonlite', 'MCMCpack'), repos = 'https://cloud.r-project.org/')"

WORKDIR /app

# Data and backend code (paths in plumber.R expect backend/ and ../Data/)
COPY Data /app/Data
COPY backend /app/backend

WORKDIR /app/backend

EXPOSE 8000

CMD ["Rscript", "run_api.R"]
