package io.maschina.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = MaschinaAccent,
    onPrimary = MaschinaWhite,
    primaryContainer = MaschinaAccentDark,
    background = MaschinaBlack,
    surface = MaschinaSurface,
    onSurface = MaschinaOnSurface,
    error = MaschinaError,
)

private val LightColorScheme = lightColorScheme(
    primary = MaschinaAccent,
    onPrimary = MaschinaWhite,
    primaryContainer = MaschinaAccentDark,
    background = MaschinaWhite,
    surface = MaschinaWhite,
    onSurface = MaschinaBlack,
    error = MaschinaError,
)

@Composable
fun MaschinaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
