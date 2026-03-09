# Start the pollar Plumber API (run from backend/).
# Uses PORT from environment (e.g. Render); defaults to 8000 for local dev.
library(plumber)

port <- as.integer(Sys.getenv("PORT", "8000"))
api <- plumb("plumber.R")
api$run(host = "0.0.0.0", port = port)
