package cd.mova.mova

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "senga/job_wake"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        UCropDoneButtonInjector.install(application)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "consumePending" -> result.success(consumeJob())
                    "ensureAlerts" -> {
                        ensureAlerts()
                        result.success(true)
                    }
                    "stopRing" -> {
                        JobRing.stop(this)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
        // Invitation link → Play Store « &referrer=ref%3DCODE » → referral code at sign-up.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "senga/install_referrer")
            .setMethodCallHandler { call, result ->
                if (call.method == "get") readInstallReferrer(result) else result.notImplemented()
            }
    }

    private fun readInstallReferrer(result: MethodChannel.Result) {
        var answered = false
        fun answer(value: String?) {
            if (answered) return
            answered = true
            runOnUiThread { result.success(value) }
        }
        try {
            val client = InstallReferrerClient.newBuilder(this).build()
            client.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(code: Int) {
                    val value = try {
                        if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                            client.installReferrer.installReferrer
                        } else {
                            null
                        }
                    } catch (_: Exception) {
                        null
                    }
                    try { client.endConnection() } catch (_: Exception) {}
                    answer(value)
                }

                override fun onInstallReferrerServiceDisconnected() = answer(null)
            })
        } catch (_: Exception) {
            answer(null)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        JobRing.stop(this)
        flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
            val job = consumeJob() ?: return@let
            MethodChannel(messenger, channelName).invokeMethod("arrived", job)
        }
    }

    override fun onResume() {
        super.onResume()
        JobRing.stop(this)
    }

    private fun consumeJob(): Map<String, String>? {
        val id = intent?.getStringExtra("senga_job_id") ?: return null
        if (id.isEmpty()) return null
        val kind = intent?.getStringExtra("senga_job_kind") ?: "ride"
        intent?.removeExtra("senga_job_id")
        intent?.removeExtra("senga_job_kind")
        return mapOf("kind" to kind, "id" to id)
    }

    private fun ensureAlerts() {
        if (Build.VERSION.SDK_INT >= 34) {
            val nm = getSystemService(android.app.NotificationManager::class.java)
            if (nm != null && !nm.canUseFullScreenIntent()) {
                startActivity(
                    Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                        data = Uri.parse("package:$packageName")
                    },
                )
                return
            }
        }
        val pm = getSystemService(PowerManager::class.java) ?: return
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                },
            )
        }
    }
}
