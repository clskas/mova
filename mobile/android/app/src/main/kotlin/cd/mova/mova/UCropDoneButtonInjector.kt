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
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.RelativeLayout

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
        // Après setContentView + menu uCrop.
        activity.window.decorView.post { attach(activity) }
        activity.window.decorView.postDelayed({ attach(activity) }, 120)
    }

    override fun onActivityResumed(activity: Activity) {
        if (activity.javaClass.name != UCROP_ACTIVITY) return
        hideToolbarCrop(activity)
        activity.window.decorView.post { bringDoneToFront(activity) }
    }

    private fun attach(activity: Activity) {
        if (activity.isFinishing) return
        val host = findHost(activity) ?: return
        if (host.findViewWithTag<View>(TAG_DONE) != null) {
            hideToolbarCrop(activity)
            bringDoneToFront(activity)
            return
        }

        val density = activity.resources.displayMetrics.density
        val size = (64 * density).toInt()
        val marginBottom = (36 * density).toInt()
        val doneIconId = activity.resources.getIdentifier("ucrop_ic_done", "drawable", activity.packageName)

        val btn = ImageButton(activity).apply {
            tag = TAG_DONE
            contentDescription = "Valider"
            isClickable = true
            isFocusable = true
            isEnabled = true
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xFF6366F1.toInt())
            }
            if (doneIconId != 0) {
                setImageResource(doneIconId)
                drawable?.mutate()?.setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_ATOP)
            } else {
                setImageResource(android.R.drawable.ic_menu_save)
                setColorFilter(Color.WHITE)
            }
            scaleType = android.widget.ImageView.ScaleType.CENTER_INSIDE
            val pad = (16 * density).toInt()
            setPadding(pad, pad, pad, pad)
            elevation = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                16f,
                activity.resources.displayMetrics,
            )
            translationZ = elevation
            // Empêche UCrop / GestureImage de voler le geste.
            setOnTouchListener { v, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        v.isPressed = true
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        v.isPressed = false
                        val inside =
                            event.x >= 0 && event.x <= v.width &&
                                event.y >= 0 && event.y <= v.height
                        if (inside) invokeCropAndSave(activity)
                        true
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        v.isPressed = false
                        true
                    }
                    else -> true
                }
            }
        }

        val lp: ViewGroup.LayoutParams = when (host) {
            is RelativeLayout -> RelativeLayout.LayoutParams(size, size).apply {
                addRule(RelativeLayout.ALIGN_PARENT_BOTTOM)
                addRule(RelativeLayout.CENTER_HORIZONTAL)
                bottomMargin = marginBottom
            }
            is FrameLayout -> FrameLayout.LayoutParams(size, size).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                bottomMargin = marginBottom
            }
            else -> ViewGroup.MarginLayoutParams(size, size).apply {
                bottomMargin = marginBottom
            }
        }
        host.addView(btn, lp)
        btn.bringToFront()
        host.invalidate()

        hideToolbarCrop(activity)
        val listener = object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                if (activity.isFinishing || activity.isDestroyed) {
                    host.viewTreeObserver.removeOnGlobalLayoutListener(this)
                    return
                }
                hideToolbarCrop(activity)
                bringDoneToFront(activity)
            }
        }
        host.viewTreeObserver.addOnGlobalLayoutListener(listener)
    }

    private fun findHost(activity: Activity): ViewGroup? {
        val photoboxId = activity.resources.getIdentifier("ucrop_photobox", "id", activity.packageName)
        if (photoboxId != 0) {
            val box = activity.findViewById<ViewGroup?>(photoboxId)
            if (box != null) return box
        }
        return activity.findViewById(android.R.id.content)
    }

    private fun bringDoneToFront(activity: Activity) {
        val host = findHost(activity) ?: return
        val btn = host.findViewWithTag<View>(TAG_DONE) ?: return
        btn.bringToFront()
        btn.translationZ = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            24f,
            activity.resources.displayMetrics,
        )
        host.invalidate()
    }

    private fun toolbarMenu(activity: Activity): Menu? {
        val toolbarId = activity.resources.getIdentifier("toolbar", "id", activity.packageName)
        if (toolbarId == 0) return null
        val toolbar = activity.findViewById<View>(toolbarId) ?: return null
        return try {
            val getMenu = toolbar.javaClass.methods.firstOrNull {
                it.name == "getMenu" && it.parameterTypes.isEmpty()
            } ?: return null
            getMenu.invoke(toolbar) as? Menu
        } catch (_: Throwable) {
            null
        }
    }

    private fun hideToolbarCrop(activity: Activity) {
        val cropId = activity.resources.getIdentifier("menu_crop", "id", activity.packageName)
        if (cropId == 0) return
        try {
            toolbarMenu(activity)?.findItem(cropId)?.isVisible = false
        } catch (_: Throwable) {
            // Ignore
        }
    }

    private fun invokeCropAndSave(activity: Activity) {
        val cropId = activity.resources.getIdentifier("menu_crop", "id", activity.packageName)
        // 1) Action menu uCrop (même handler que le ✓ toolbar) — fiable même si l’item est masqué.
        if (cropId != 0) {
            try {
                val menu = toolbarMenu(activity)
                val item = menu?.findItem(cropId)
                if (menu != null && item != null) {
                    val wasVisible = item.isVisible
                    item.isVisible = true
                    item.isEnabled = true
                    val ok = menu.performIdentifierAction(cropId, 0)
                    item.isVisible = wasVisible
                    if (ok) return
                }
            } catch (_: Throwable) {
                // fallback reflection
            }
        }
        // 2) Reflection sur cropAndSaveImage (debug / si menu pas prêt).
        var cls: Class<*>? = activity.javaClass
        while (cls != null && cls != Activity::class.java) {
            try {
                val method = cls.getDeclaredMethod("cropAndSaveImage")
                method.isAccessible = true
                method.invoke(activity)
                return
            } catch (_: Throwable) {
                cls = cls.superclass
            }
        }
    }

    override fun onActivityStarted(activity: Activity) {}
    override fun onActivityPaused(activity: Activity) {}
    override fun onActivityStopped(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}
}
