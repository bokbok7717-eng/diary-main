# Theme music player

The three supplied MP3 files are connected to their corresponding character themes. YouTube links remain metadata only; playback uses the supplied local assets.

- Configure each theme's `audioUrl` in `bgm-tracks.js` with a supplied audio file. Relative site assets or direct audio URLs are supported. The server must return a valid media content type and support seeking.
- Metadata and original supplied cover images are mapped separately for Usagi, Chiikawa, and Hachiware.
- One audio element survives sidebar moves and page navigation. The player moves below TODAY'S NOTE on desktop and between the profile status and counters on mobile.
- Character themes autoplay when available and unlocked. Every page load attempts autoplay, regardless of a pause on a previous visit. A rejected autoplay attempt waits silently for a subsequent click, pointer release, or keyboard activation. Explicit pause applies to the current visit; switching themes respects it. Leaving minihome or locking the diary pauses music.
- Empty sources show the album cover and disabled controls without a pending-audio message or requests for nonexistent files. No record or authentication data is changed.
- Controls: play/pause, seek, 10 seconds backward/forward. Long metadata scrolls; reduced-motion mode disables the animation.

Validation: `node --test tests/*.test.cjs` passes all 49 tests. The provided MP3s were checked byte-for-byte against the input files. Browser checks with actual files verified playback, pause, and 10-second seeking for all three tracks, recovery from blocked autoplay by user interaction, and uninterrupted playback during calendar navigation. Browser durations are approximately 1:10 (Usagi), 3:39 (Chiikawa), and 1:31 (Hachiware).
