package com.shiti.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

public class MainActivity extends ComponentActivity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final String LOCAL_APP_URL = APP_ORIGIN + "/assets/index.html";

    private WebView webView;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private boolean legacySettingsInjected;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);
        progress = findViewById(R.id.progress);
        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (fileCallback == null) return;
                    fileCallback.onReceiveValue(
                            WebChromeClient.FileChooserParams.parseResult(
                                    result.getResultCode(),
                                    result.getData()
                            )
                    );
                    fileCallback = null;
                }
        );
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
        configureWebView();
        webView.loadUrl(LOCAL_APP_URL);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("blob".equalsIgnoreCase(scheme) || "data".equalsIgnoreCase(scheme)) return false;
                return !uri.toString().startsWith(APP_ORIGIN + "/assets/");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                migrateLegacyConnectionSettings(view);
                progress.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    progress.setVisibility(View.GONE);
                    Toast.makeText(
                            MainActivity.this,
                            "本机页面加载失败，请重新安装应用",
                            Toast.LENGTH_LONG
                    ).show();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    fileChooserLauncher.launch(params.createIntent());
                    return true;
                } catch (Exception error) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    return false;
                }
            }
        });
    }

    private void migrateLegacyConnectionSettings(WebView view) {
        if (legacySettingsInjected) return;
        legacySettingsInjected = true;
        String endpoint = getPreferences(MODE_PRIVATE).getString("server", "").trim();
        String token = getPreferences(MODE_PRIVATE).getString("token", "").trim();
        if (endpoint.isEmpty() && token.isEmpty()) return;
        String script =
                (endpoint.isEmpty()
                        ? ""
                        : "localStorage.setItem('shiti-mobile-endpoint'," + JSONObject.quote(endpoint) + ");")
                + (token.isEmpty()
                        ? ""
                        : "localStorage.setItem('shiti-mobile-token'," + JSONObject.quote(token) + ");");
        view.evaluateJavascript(script, null);
        getPreferences(MODE_PRIVATE).edit().remove("server").remove("token").apply();
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
        webView.loadUrl("about:blank");
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }
}
