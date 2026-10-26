package com.eren.minimalframe;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;

/**
 * Saves exported photos straight into the phone's gallery, in a "MinimalFrame" album (Pictures/MinimalFrame).
 * Android 10 and later need no permission for this; Android 7–9 ask for storage permission the first time.
 * JS: Gallery.save({ data: base64, name, mime }) → { uri }
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
}
