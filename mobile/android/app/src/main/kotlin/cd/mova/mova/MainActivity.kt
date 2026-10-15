package cd.mova.mova

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "senga/job_wake"

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
