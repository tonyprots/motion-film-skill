# Hershey glyphs for lib/hand.js (see hand_glyphs.py). One page per face: each glyph in its own 100pt cell, origin recorded; a sidecar lists (face, char, x0, y0, adv)
args <- commandArgs(TRUE); out <- args[1]
faces <- list(script = c("script", "plain"), cyr = c("serif", "oblique cyrillic"), sans = c("sans serif", "plain"))
lat <- c(letters, LETTERS, as.character(0:9), strsplit(".,:;!?-'\"()/+=%&", "")[[1]])
cyr <- c(strsplit("абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ", "")[[1]], as.character(0:9), strsplit(".,:;!?-()", "")[[1]])
CEX <- 4; W <- 1200; H <- 1600
pdf(out, width = W / 72, height = H / 72, compress = FALSE)
side <- file(sub("\\.pdf$", ".tsv", out), "w")
for (f in names(faces)) {
  vf <- faces[[f]]; chars <- if (f == "cyr") cyr else lat
  par(mar = rep(0, 4), xaxs = "i", yaxs = "i"); plot.new(); plot.window(c(0, W), c(0, H))
  for (i in seq_along(chars)) {
    ch <- chars[i]; x0 <- 50 + ((i - 1) %% 11) * 100; y0 <- H - 80 - ((i - 1) %/% 11) * 100
    s <- if (f == "cyr") { r <- iconv(ch, "UTF-8", "KOI8-R", toRaw = TRUE)[[1]]; z <- rawToChar(r); Encoding(z) <- "bytes"; z } else ch
    text(x0, y0, s, vfont = vf, cex = CEX, adj = c(0, 0))
    adv <- strwidth(s, vfont = vf, cex = CEX); hh <- strheight("M", vfont = vf, cex = CEX)
    writeLines(paste(f, ch, x0, y0, adv, hh, sep = "\t"), side)
  }
}
close(side); invisible(dev.off())
