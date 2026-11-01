package cd.mova.mova

import android.app.Activity
import android.app.Application
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.Menu
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.ImageButton

/**
 * Garde l'UI native uCrop (grille + barre Rogner) et place uniquement le ✓
 * de validation en bas au centre sur la photo.
 */
object UCropDoneButtonInjector : Application.ActivityLifecycleCallbacks {
    private const val TAG_DONE = "senga_ucrop_done_btn"
    private const val UCROP_ACTIVITY = "com.yalantis.ucrop.UCropActivity"
    private var installed = false

    fun install(app: Application) {
        if (installed) return
        installed = true
        app.registerActivityLifecycleCallbacks(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        if (activity.javaClass.name != UCROP_ACTIVITY) return
        activity.window.decorView.post { attach(activity) }
    }

    override fun onActivityResumed(activity: Activity) {
        if (activity.javaClass.name != UCROP_ACTIVITY) return
        hideToolbarCrop(activity)
    }

    private fun attach(activity: Activity) {
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        if (content.findViewWithTag<View>(TAG_DONE) != null) {
            hideToolbarCrop(activity)
            return
        }

        val density = activity.resources.displayMetrics.density
        val size = (56 * density).toInt()
        val marginBottom = (28 * density).toInt()
        val doneIconId = activity.resources.getIdentifier("ucrop_ic_done", "drawable", activity.packageName)

        val btn = ImageButton(activity).apply {
            tag = TAG_DONE
            contentDescription = "Valider"
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xFF6366F1.toInt())
            }
            if (doneIconId != 0) {
                setImageResource(doneIconId)
                drawable?.mutate()?.setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_ATOP)
            } else {
                setImageResource(android.R.drawable.checkbox_on_background)
                setColorFilter(Color.WHITE)
            }
            scaleType = android.widget.ImageView.ScaleType.CENTER_INSIDE
            val pad = (14 * density).toInt()
            setPadding(pad, pad, pad, pad)
            elevation = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                6f,
                activity.resources.displayMetrics,
            )
            setOnClickListener { invokeCropAndSave(activity) }
        }

        content.addView(
            btn,
            FrameLayout.LayoutParams(size, size).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                bottomMargin = marginBottom
            },
        )

        hideToolbarCrop(activity)
        val listener = object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                if (activity.isFinishing || activity.isDestroyed) {
                    content.viewTreeObserver.removeOnGlobalLayoutListener(this)
                    return
                }
                hideToolbarCrop(activity)
            }
        }
        content.viewTreeObserver.addOnGlobalLayoutListener(listener)
    }

    private fun hideToolbarCrop(activity: Activity) {
        val toolbarId = activity.resources.getIdentifier("toolbar", "id", activity.packageName)
        if (toolbarId == 0) return
        val toolbar = activity.findViewById<View>(toolbarId) ?: return
        val cropId = activity.resources.getIdentifier("menu_crop", "id", activity.packageName)
        if (cropId == 0) return
        try {
            val getMenu = toolbar.javaClass.methods.firstOrNull {
                it.name == "getMenu" && it.parameterTypes.isEmpty()
            } ?: return
            val menu = getMenu.invoke(toolbar) as? Menu ?: return
            menu.findItem(cropId)?.isVisible = false
        } catch (_: Throwable) {
            // Ignore — le ✓ bas-centre reste utilisable.
        }
    }

    private fun invokeCropAndSave(activity: Activity) {
        try {
            val method = activity.javaClass.getDeclaredMethod("cropAndSaveImage")
            method.isAccessible = true
            method.invoke(activity)
        } catch (_: Throwable) {
            // Ignore — l'utilisateur peut réessayer.
        }
    }

    override fun onActivityStarted(activity: Activity) {}
    override fun onActivityPaused(activity: Activity) {}
    override fun onActivityStopped(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}
}
