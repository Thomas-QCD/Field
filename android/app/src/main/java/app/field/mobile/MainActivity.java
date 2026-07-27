package app.field.mobile;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Black covers over system bar insets so CameraPreview (drawn behind the
 * WebView in a full-screen sibling) cannot show through the translucent
 * Android navigation / status bars under edge-to-edge.
 */
public class MainActivity extends BridgeActivity {
    private View topSystemCover;
    private View bottomSystemCover;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setBackgroundDrawableResource(android.R.color.black);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            installSystemBarCovers(bars.top, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    private void installSystemBarCovers(int topPx, int bottomPx) {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) return;

        topSystemCover = ensureCover(content, topSystemCover, Gravity.TOP, topPx);
        bottomSystemCover = ensureCover(content, bottomSystemCover, Gravity.BOTTOM, bottomPx);

        if (topSystemCover != null) content.bringChildToFront(topSystemCover);
        if (bottomSystemCover != null) content.bringChildToFront(bottomSystemCover);
    }

    private View ensureCover(ViewGroup parent, View existing, int gravity, int heightPx) {
        if (heightPx <= 0) {
            if (existing != null) existing.setVisibility(View.GONE);
            return existing;
        }

        View cover = existing;
        if (cover == null) {
            cover = new View(this);
            cover.setBackgroundColor(Color.BLACK);
            cover.setClickable(false);
            cover.setFocusable(false);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                heightPx,
                gravity
            );
            parent.addView(cover, lp);
        } else {
            cover.setVisibility(View.VISIBLE);
            ViewGroup.LayoutParams lp = cover.getLayoutParams();
            lp.height = heightPx;
            if (lp instanceof FrameLayout.LayoutParams) {
                ((FrameLayout.LayoutParams) lp).gravity = gravity;
            }
            cover.setLayoutParams(lp);
        }
        return cover;
    }
}
