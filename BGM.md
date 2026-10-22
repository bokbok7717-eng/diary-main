# Theme music player

Release mode: design preview with UI and playback controls implemented; the three requested music files have not been supplied. The user requested deployment of the design before audio is connected. YouTube links are metadata only; no audio is extracted, proxied, or downloaded.

- Configure each theme's `audioUrl` in `bgm-tracks.js` with a supplied audio file. Relative site assets or direct audio URLs are supported. The server must return a valid media content type and support seeking.
- Metadata and original supplied cover images are mapped separately for Usagi, Chiikawa, and Hachiware.
- One audio element survives sidebar moves and page navigation. The player moves below TODAY'S NOTE on desktop and between the profile status and counters on mobile.
- Character themes autoplay when available and unlocked. A rejected autoplay attempt waits for a subsequent user interaction. Explicit pause is remembered locally; switching themes respects it. Leaving minihome or locking the diary pauses music.
- Empty sources show the album cover and disabled controls without a pending-audio message or requests for nonexistent files. No record or authentication data is changed.
- Controls: play/pause, seek, 10 seconds backward/forward. Long metadata scrolls; reduced-motion mode disables the animation.

Validation: `node --test tests/*.test.cjs`. Browser playback and seek controls were checked with a generated test tone served only by the local preview fixture. The test tone is not included in the repository and is not one of the requested songs. Actual songs and their autoplay behavior remain to be verified after files are provided.
