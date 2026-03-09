# pollar backend: R Plumber API for Render (or any Docker host).
# Build from repo root: docker build -f backend/Dockerfile .
# Use rstudio/plumber so plumber is pre-installed; add remaining deps.
FROM rstudio/plumber:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    && rm -rf /var/lib/apt/lists/*

RUN R -e "pkgs <- c('dplyr', 'tidyr', 'readr', 'tibble', 'jsonlite', 'MCMCpack'); install.packages(pkgs, repos = 'https://cloud.r-project.org/'); if (!all(sapply(c('plumber', pkgs), require, character.only = TRUE, quietly = TRUE))) stop('Required package missing')"

WORKDIR /app

# Data and backend code (paths in plumber.R expect backend/ and ../Data/)
COPY Data /app/Data
COPY backend /app/backend

WORKDIR /app/backend

EXPOSE 8000

CMD ["Rscript", "run_api.R"]
