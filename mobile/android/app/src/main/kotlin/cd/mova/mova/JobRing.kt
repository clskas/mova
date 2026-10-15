package cd.mova.mova

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat

/** Sonnerie + plein écran pour une offre course/livraison, process mort compris. */
object JobRing {
    const val CHANNEL_ID = "mova_driver_jobs_v6"
    private const val NOTIF_ID = 7701
    private var ringtone: Ringtone? = null

    fun isJob(data: Map<String, String>): Boolean {
        val kind = data["jobKind"] ?: data["type"] ?: return false
        if (kind == "INCIDENT_CREATED" || kind == "SOS" || kind == "CHAT_MESSAGE") return false
        return kind.contains("RIDE") ||
            kind.contains("DELIVERY") ||
            kind.contains("OFFER") ||
            kind.contains("JOB") ||
            kind.contains("CALL") ||
            kind.contains("MISSION")
    }

    fun show(context: Context, data: Map<String, String>) {
        val title = data["title"]?.takeIf { it.isNotBlank() } ?: "SENGA Driver"
        val body = data["body"]?.takeIf { it.isNotBlank() } ?: "Nouvelle course ou livraison"
        val kindRaw = data["jobKind"] ?: data["type"] ?: "RIDE"
        val id = data["referenceId"] ?: data["rideId"] ?: data["deliveryId"] ?: ""
        val kind = if (kindRaw.contains("DELIVERY")) "delivery" else "ride"
        val sound = Uri.parse("android.resource://${context.packageName}/raw/senga_job")
        ensureChannel(context, sound)

        val launch = launchIntent(context, kind, id)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val contentPi = PendingIntent.getActivity(context, NOTIF_ID, launch, flags)
        val fullPi = PendingIntent.getActivity(context, NOTIF_ID + 1, launch, flags)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setSound(sound)
            .setVibrate(longArrayOf(0, 700, 300, 700, 300, 700))
            .setFullScreenIntent(fullPi, true)
            .setContentIntent(contentPi)
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, notification)
        startLoop(context, sound)
        try {
            context.startActivity(launch)
        } catch (_: Exception) {
            // Android 10+ bloque souvent startActivity en fond : le fullScreenIntent reste.
        }
    }

    fun stop(context: Context) {
        try {
            ringtone?.stop()
        } catch (_: Exception) {
        }
        ringtone = null
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_ID)
    }

    fun launchIntent(context: Context, kind: String, id: String): Intent {
        return Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("senga_job_kind", kind)
            putExtra("senga_job_id", id)
        }
    }

    private fun ensureChannel(context: Context, sound: Uri) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Missions & courses SENGA",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Courses et livraisons — sonnerie même app fermée"
            setSound(sound, attrs)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 700, 300, 700)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(channel)
    }

    private fun startLoop(context: Context, sound: Uri) {
        try {
            ringtone?.stop()
            val tone = RingtoneManager.getRingtone(context, sound) ?: return
            if (Build.VERSION.SDK_INT >= 28) tone.isLooping = true
            tone.play()
            ringtone = tone
        } catch (_: Exception) {
        }
    }
}
