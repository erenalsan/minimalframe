package com.eren.minimalframe;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/**
 * Saves exported photos straight into the phone's gallery, in a "MinimalFrame" album (Pictures/MinimalFrame).
 * Android 10 and later need no permission for this; Android 7–9 ask for storage permission the first time.
 * JS: Gallery.save({ data: base64, name, mime }) → { uri }
 * The in-app "Saved" screen reads that album back (Android 10 and later):
 *     list() → { supported, items: [{ id, uri, name, date, width, height }] }, newest first
 *     thumb({ id }) → { src }: a small JPEG data URL for the grid
 *     share({ ids }), remove({ ids }) → { removed }
 * Without a photos permission Android shows an app only the files it saved itself, so this is exactly
 * "what MinimalFrame exported" (after a reinstall the older ones are no longer ours and drop out).
 */
@CapacitorPlugin(
    name = "Gallery",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class GalleryPlugin extends Plugin {

    private static final boolean SCOPED = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;

    @PluginMethod
    public void save(PluginCall call) {
        if (!SCOPED && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageAnswered");
            return;
        }
        write(call);
    }

    @PermissionCallback
    private void storageAnswered(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) write(call);
        else call.reject("Storage permission was denied");
    }

    private void write(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("No image data");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, call.getString("name", "MinimalFrame.jpg"));
        values.put(MediaStore.Images.Media.MIME_TYPE, call.getString("mime", "image/jpeg"));
        if (SCOPED) {
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/MinimalFrame");
            values.put(MediaStore.Images.Media.IS_PENDING, 1); // hidden from the gallery until fully written
        }
        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            call.reject("The gallery would not take the image");
            return;
        }
        try (OutputStream out = resolver.openOutputStream(uri)) {
            out.write(Base64.decode(data, Base64.DEFAULT));
        } catch (Exception e) {
            resolver.delete(uri, null, null); // never leave a half-written photo in the gallery
            call.reject("Could not save the image: " + e.getMessage());
            return;
        }
        if (SCOPED) {
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
        }
        JSObject result = new JSObject();
        result.put("uri", uri.toString());
        call.resolve(result);
    }

    private static final String ALBUM = Environment.DIRECTORY_PICTURES + "/MinimalFrame/";

    private Uri uriOf(long id) {
        return ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSObject result = new JSObject();
        JSArray items = new JSArray();
        // shortcut: Android 7–9 save to the gallery without an album path; the screen is hidden there (few phones)
        result.put("supported", SCOPED);
        if (SCOPED) {
            String[] cols = {
                MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.WIDTH, MediaStore.Images.Media.HEIGHT,
            };
            try (Cursor c = getContext().getContentResolver().query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cols,
                MediaStore.Images.Media.RELATIVE_PATH + " = ?", new String[] { ALBUM },
                MediaStore.Images.Media.DATE_ADDED + " DESC, " + MediaStore.Images.Media.DISPLAY_NAME + " ASC"
            )) {
                while (c != null && c.moveToNext()) {
                    JSObject item = new JSObject();
                    item.put("id", c.getLong(0));
                    item.put("uri", uriOf(c.getLong(0)).toString());
                    item.put("name", c.getString(1));
                    item.put("date", c.getLong(2) * 1000);
                    item.put("width", c.getInt(3));
                    item.put("height", c.getInt(4));
                    items.put(item);
                }
            } catch (Exception e) {
                call.reject("Could not read the album: " + e.getMessage());
                return;
            }
        }
        result.put("items", items);
        call.resolve(result);
    }

    @PluginMethod
    public void thumb(PluginCall call) {
        if (!SCOPED) {
            call.reject("Not supported");
            return;
        }
        try {
            Bitmap bmp = getContext().getContentResolver().loadThumbnail(uriOf(call.getData().optLong("id")), new Size(400, 400), null);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 82, out);
            bmp.recycle();
            JSObject result = new JSObject();
            result.put("src", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("No thumbnail: " + e.getMessage());
        }
    }

    private ArrayList<Uri> urisOf(PluginCall call) {
        ArrayList<Uri> uris = new ArrayList<>();
        JSArray ids = call.getArray("ids", new JSArray());
        for (int i = 0; i < ids.length(); i++) uris.add(uriOf(ids.optLong(i)));
        return uris;
    }

    @PluginMethod
    public void share(PluginCall call) {
        ArrayList<Uri> uris = urisOf(call);
        if (uris.isEmpty()) {
            call.reject("Nothing to share");
            return;
        }
        Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE).setType("image/*");
        if (uris.size() == 1) send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
        else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
        // the receiving app may read these photos; the clip data carries that permission through the chooser
        ClipData clip = ClipData.newRawUri(null, uris.get(0));
        for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
        send.setClipData(clip);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        int removed = 0;
        try {
            for (Uri uri : urisOf(call)) removed += getContext().getContentResolver().delete(uri, null, null);
        } catch (Exception e) {
            call.reject("Could not delete: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("removed", removed);
        call.resolve(result);
    }
}
