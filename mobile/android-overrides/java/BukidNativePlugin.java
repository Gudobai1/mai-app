package app.bukid;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Recebe texto/link compartilhado de outros apps (ACTION_SEND).
 * App fechado: o texto fica guardado até o site pedir com getPendingShare().
 * App aberto: avisa o site pelo evento "shareReceived".
 */
@CapacitorPlugin(name = "BukidNative")
public class BukidNativePlugin extends Plugin {
    private String pendingTitle = null;
    private String pendingText = null;

    public void handleIntent(Intent intent, boolean appRunning) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if ((text == null || text.trim().isEmpty()) && (title == null || title.trim().isEmpty())) return;
        intent.setAction(Intent.ACTION_MAIN); // evita processar de novo ao reabrir
        if (appRunning) {
            notifyListeners("shareReceived", payload(title, text));
        } else {
            pendingTitle = title;
            pendingText = text;
        }
    }

    private JSObject payload(String title, String text) {
        JSObject data = new JSObject();
        if (title != null) data.put("title", title);
        if (text != null) data.put("text", text);
        return data;
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject data = payload(pendingTitle, pendingText);
        pendingTitle = null;
        pendingText = null;
        call.resolve(data);
    }
}
