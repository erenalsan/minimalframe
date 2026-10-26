package com.eren.minimalframe;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GalleryPlugin.class); // our own plugins register before the bridge starts
        super.onCreate(savedInstanceState);
    }
}
