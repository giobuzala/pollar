library(plumber)

api <- plumb("plumber.R")
api$run(host = "0.0.0.0", port = 8000)
