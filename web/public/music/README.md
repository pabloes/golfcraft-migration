# Map music

Served at `https://golfcraftgame.com/music/<file>` (`web/server/index.ts`, the
`*/music` route) and played by the scene through an `AudioStream` component.

It lives here, and not in the scene, because every player downloads everything
a scene deploys: seven maps of stereo music is about 17 MB on top of the
models. `AudioSource` could not be used for a URL either, since unity-explorer
resolves its `audioClipUrl` against the scene's own content.

The file names the scene expects are in `scene/src/services/map-music.ts`,
together with each track's length, which is how it knows when to start the
next one (`AudioStream` has no loop flag and no "finished" event).

All of them come from Fesliyan Studios (fesliyanstudios.com), the same library
as the two Egypt tracks the game already used. **Check their licence before
adding a track**: the free tier is attribution and non-commercial, which this
is not.

Encode to keep them small, stereo, 96 kbps:

    ffmpeg -i in.mp3 -ac 2 -ar 44100 -c:a libmp3lame -b:a 96k -joint_stereo 1 out.mp3

A four minute track comes to about 2.9 MB that way.
