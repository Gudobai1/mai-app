package app.bukid;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private BukidNativePlugin share;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BukidNativePlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge().getPlugin("BukidNative") != null) {
            share = (BukidNativePlugin) getBridge().getPlugin("BukidNative").getInstance();
            share.handleIntent(getIntent(), false);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (share != null) share.handleIntent(intent, true);
    }
}
