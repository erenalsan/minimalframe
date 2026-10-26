package com.eren.minimalframe;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Photos shared to MinimalFrame (gallery → Share) or opened with it (Open with). Each one is copied into the app's
 * cache, and the app opens them like dropped files: JS reads them through Capacitor's local file URL.
 * JS: Incoming.take() → { files: [{ path, name, mime }] } for what arrived at launch; a "files" event for later ones.
 */
@CapacitorPlugin(name = "Incoming")
public class IncomingPlugin extends Plugin {

    private JSArray pending = new JSArray();
    private String pendingText = null; // shared text: a Fujifilm recipe

    @Override
    public void load() {
        deleteDir(incomingDir()); // last launch's copies are already in the saved session
        deleteDir(new File(getContext().getCacheDir(), "share")); // and files shared out of the app last time
        collect(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        collect(intent);
        if (pending.length() > 0 || pendingText != null) notifyListeners("files", drain(), true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        call.resolve(drain());
    }

    private JSObject drain() {
        JSObject result = new JSObject();
        result.put("files", pending);
        if (pendingText != null) result.put("text", pendingText);
        pending = new JSArray();
        pendingText = null;
        return result;
    }

    private void collect(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
            else {
                CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (text != null && text.length() > 0) pendingText = text.toString().substring(0, Math.min(text.length(), 4000));
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        } else {
            return;
        }
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN)); // handled: not again when Android recreates the app

        ContentResolver resolver = getContext().getContentResolver();
        File dir = incomingDir();
        dir.mkdirs();
        for (Uri uri : uris) {
            String name = displayName(resolver, uri);
            File out = new File(dir, System.nanoTime() + "_" + name);
            try (InputStream in = resolver.openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
                if (in == null) continue;
                byte[] buf = new byte[1 << 16];
                for (int n; (n = in.read(buf)) > 0; ) os.write(buf, 0, n);
            } catch (Exception e) {
                Logger.error("Incoming", "Could not read " + uri, e);
                out.delete();
                continue;
            }
            if (out.length() == 0) { // nothing came through: skip it rather than open an empty photo
                out.delete();
                continue;
            }
            JSObject file = new JSObject();
            file.put("path", out.getAbsolutePath());
            file.put("name", name);
            file.put("mime", resolver.getType(uri));
            pending.put(file);
        }
    }

    private File incomingDir() {
        return new File(getContext().getCacheDir(), "incoming");
    }

    /** The file's own name (from the app that shared it), made safe to use as a file name. */
    private static String displayName(ContentResolver resolver, Uri uri) {
        String name = null;
        try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {}
        if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "photo.jpg";
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static void deleteDir(File dir) {
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) f.delete();
    }
}
