Inter Latin variable WOFF2, normal style, weights 400–800, obtained from the
Google Fonts CSS API on 27 October 2026. This is the same Inter family previously
requested by index.html, including English/Filipino and Latin-1 characters.

Source: https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2
Upstream: https://github.com/rsms/inter
License: ../../../public/licenses/Inter-OFL.txt (SIL Open Font License 1.1).

index.css deliberately uses `?inline`. Vite embeds these 48,256 bytes in the
render-blocking entry CSS, so the font has no separate network or cache race.
Keep the font in this stylesheet when updating it; do not restore a remote
Google Fonts link, a late JavaScript loader, or a separate font download.
