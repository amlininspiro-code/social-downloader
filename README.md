# Drop — Social Downloader

A local website for public YouTube, Instagram, TikTok, and supported Snapchat video links. Includes source resolution selection, MP4 video, MP3 audio at 128/192/320 kbps, download progress, and responsive mobile layout.

## Start on Windows

1. Install Node.js 22+ and FFmpeg (already found on this computer).
2. Double-click `start.bat`. On first launch it runs `setup.ps1` to download the official yt-dlp executable and verify its release SHA-256 checksum.
3. Open http://localhost:3000, paste a public individual video link, choose your format and quality, and download. When processing finishes, click **Save to device**.
4. The server runs in the background. You can close the launcher and browser; run start.bat again to reopen the site. After restarting Windows, run start.bat to start the server again.

No npm dependencies are needed. Run `npm test` for backend validation tests.

## Operation

- yt-dlp supplies platform extraction: https://github.com/yt-dlp/yt-dlp
- FFmpeg merges video/audio and converts MP3. The source determines available quality; higher MP3 bitrate does not enhance the source.
- Run `powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1` again to update yt-dlp when platform changes break links.
- Only public, supported individual videos are intended. Private posts, DRM, authentication, region restrictions, and live streams are not bypassed. Snapchat support depends on the link type. Platform support is not guaranteed: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
- Two simultaneous downloads and two link inspections are allowed. Each source stream is limited to 1 GB; merged output can be larger. Processing times out after 20 minutes.
- The `downloads` directory keeps temporary copies. Files older than 24 hours are deleted hourly while running and on restart. Avoid manually placing files in the UUID subdirectories.
- Files and job state are local. A restart clears job status; already created temporary files remain until cleanup.
- Download only content you own or are permitted to save.

## Hosting

This project is configured for local use on 127.0.0.1 only. It is not publicly deployed. Public hosting requires a server capable of running Node.js, yt-dlp, and FFmpeg plus authentication, outbound network protections, durable job storage, quotas, and abuse controls. It cannot run as a static-only hosted page or directly in a Cloudflare Worker.

## Files

`server.mjs` — local API and download processing.
`public/` — website interface.
`setup.ps1` — engine installer/updater.
`start.bat` — Windows launcher.

