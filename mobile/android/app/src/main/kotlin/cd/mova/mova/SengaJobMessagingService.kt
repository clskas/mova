package cd.mova.mova

import com.google.firebase.messaging.RemoteMessage
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService

/**
 * Reçoit les push data-only même app tuée, puis sonne + ouvre l’activité
 * avant l’isolate Flutter (souvent trop tard ou absent).
 * JOB_STOP / stopRing=1 coupe immédiatement MediaPlayer sans ouvrir l’app.
 */
class SengaJobMessagingService : FlutterFirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (JobRing.isStop(message.data)) {
            JobRing.stop(this)
            super.onMessageReceived(message)
            return
        }
        if (JobRing.isJob(message.data)) {
            JobRing.show(this, message.data)
        }
        super.onMessageReceived(message)
    }
}
