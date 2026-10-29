package com.eren.minimalframe;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GalleryPlugin.class); // our own plugins register before the bridge starts
        registerPlugin(IncomingPlugin.class);
        super.onCreate(savedInstanceState);
        // Back closes what's open in the app (a tray, a dialog, Saved photos: each adds a history entry,
        // see closeOnBack in App.svelte); with nothing open it leaves the app as usual.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge().getWebView();
                if (web.canGoBack()) {
                    web.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
