# Privacy

*Last updated: 29 October 2026 · applies to MinimalFrame on the web and the Android app*

MinimalFrame is made to keep your photos yours. In short: **your photos never leave your device, there are no accounts, no analytics and no ads**, and the only thing that ever goes online is an optional place-name lookup.

## Your photos

Everything MinimalFrame does happens on your phone, tablet or computer: opening, editing, framing and exporting. Photos are never uploaded, not to us and not to anyone else.

Exported photos go where you send them: your gallery (the **MinimalFrame** album on Android), your downloads folder, or the app you share them to.

## What goes online

**One thing, and only when you ask for it.** With **Show location** turned on in Caption, and a photo that has a GPS position but no place name of its own, MinimalFrame asks [OpenStreetMap Nominatim](https://nominatim.org) for the name of the place (for example *Passau, Germany*).

- The position is **rounded to about 100 m** before it's sent.
- Like any request on the internet, it also carries your IP address and your app language. OpenStreetMap's own [privacy policy](https://osmfoundation.org/wiki/Privacy_Policy) applies to it.
- The answer is kept on your device, so the same place isn't asked for twice.
- With **Show location** off, or without an internet connection, nothing is sent. Offline, the coordinates are shown instead.

Nothing else is ever sent: no usage data, no crash reports, no tracking.

## What's in your exported files

By default, exports carry **no metadata**: no camera serial number, no camera data, no GPS position. If you turn **Remove metadata** off, JPEG exports keep the camera, lens, settings and date. **The GPS position is always removed.**

## What's kept on your device

So your work is still there next time, MinimalFrame keeps these on your device only:

- the photos you have open, with their edits, crop and caption (photos you've already saved or shared, and not changed since, are left out);
- fonts, logos and LUT files you add;
- your saved frames, looks, colour pairs and colours;
- your settings: language, theme and export choices;
- place names already looked up.

To delete all of it: in the Android app, go to *Settings → Apps → MinimalFrame → Storage → Clear data*; in a browser, clear the site data for MinimalFrame. Your exported photos stay where you saved them.

## Android permissions

- **Internet:** only for the place-name lookup above.
- **Storage** (Android 9 and older only): to save exports into your gallery. Android 10 and later need no permission for that.

MinimalFrame doesn't ask for access to your other photos. It only sees the photos you open in it and the ones it saved itself.

## Children

MinimalFrame collects no personal data from anyone, children included.

## Changes and questions

If this ever changes, this page will say so, with a new date at the top. Questions are welcome as an [issue on GitHub](https://github.com/erenalsan/minimalframe/issues).
