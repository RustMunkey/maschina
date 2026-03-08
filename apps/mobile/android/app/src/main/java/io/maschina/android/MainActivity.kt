package io.maschina.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import io.maschina.android.ui.theme.MaschinaTheme
import io.maschina.android.screens.AppNavHost

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaschinaTheme {
                AppNavHost()
            }
        }
    }
}
