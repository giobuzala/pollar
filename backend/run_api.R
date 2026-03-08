# Start the pollar Plumber API (run from backend/). Serves on 0.0.0.0:8000.
library(plumber)

api <- plumb("plumber.R")
api$run(host = "0.0.0.0", port = 8000)
